// ============================================================================
// morning/cameraPpgEngine.js — BioSync
// ----------------------------------------------------------------------------
// Moteur PURE de traitement du signal PPG optique (doigt sur caméra+flash).
// Aucune dépendance navigateur — testable en Node. Réutilise hrvEngine.js
// pour tout ce qui est déjà écrit (nettoyage d'IBI, RMSSD, HR moyen, rapport
// orthostatique complet) : ce fichier ne fait QUE la partie spécifique à la
// caméra, à savoir transformer un flux de luminosité en intervalles entre
// battements (IBI, ms) — l'équivalent optique des intervalles RR Bluetooth.
//
// PIPELINE :
//   cameraPpgCapture.js  -> échantillons bruts { timestampMs, red }
//   cameraPpgEngine.js   -> detrend -> détection de pics -> IBIs   (ce fichier)
//   hrvEngine.js         -> cleanRRIntervals/computeOrthostaticReport (réutilisés tels quels)
//
// ⚠️ Détection de pics par heuristique (seuil adaptatif + distance minimale),
// pas un algorithme PPG clinique. Suffisant pour l'usage terrain visé, mais
// à valider vs Bluetooth avant toute déclaration d'équivalence (cf. §16 du
// cahier des charges) — voir orthostaticDataSource.js.
// ============================================================================
import { cleanRRIntervals } from "./hrvEngine.js";

const DETREND_WINDOW_MS = 2000; // retire la dérive lente (respiration, pression du doigt)
const SMOOTH_WINDOW_MS = 150; // lissage court, réduit le bruit capteur

export const PPG_MIN_PEAK_DISTANCE_MS = 320; // ~187 bpm max
export const PPG_MIN_COVERAGE_SEC = 45;
export const PPG_MIN_VALID_BEATS = 40;
export const PPG_MAX_ARTIFACT_RATIO_GOOD = 0.08;
export const PPG_MAX_ARTIFACT_RATIO_ACCEPTABLE = 0.2;

function movingAverageByTime(series, windowMs) {
  return series.map((pt, i) => {
    let sum = 0, count = 0;
    for (let j = i; j >= 0 && pt.timestampMs - series[j].timestampMs <= windowMs / 2; j--) { sum += series[j].value; count++; }
    for (let j = i + 1; j < series.length && series[j].timestampMs - pt.timestampMs <= windowMs / 2; j++) { sum += series[j].value; count++; }
    return { timestampMs: pt.timestampMs, value: count ? sum / count : pt.value };
  });
}

// Le doigt absorbe plus de lumière quand le volume sanguin augmente
// (systole) -> la luminosité réfléchie BAISSE au pic systolique. On inverse
// donc le signal (baseline - valeur) pour que "pic de volume sanguin" =
// "pic du signal traité", cohérent avec une détection de maxima locaux.
export function detrendPpgSignal(rawSamples) {
  const series = rawSamples.map((s) => ({ timestampMs: s.timestampMs, value: s.red }));
  const baseline = movingAverageByTime(series, DETREND_WINDOW_MS);
  const inverted = series.map((s, i) => ({ timestampMs: s.timestampMs, value: baseline[i].value - s.value }));
  return movingAverageByTime(inverted, SMOOTH_WINDOW_MS);
}

export function detectPpgPeaks(filteredSeries, options = {}) {
  const minDistanceMs = options.minDistanceMs ?? PPG_MIN_PEAK_DISTANCE_MS;
  if (filteredSeries.length < 3) return [];
  const values = filteredSeries.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const threshold = mean + 0.5 * std;

  const peaks = [];
  let lastPeakMs = -Infinity;
  for (let i = 1; i < filteredSeries.length - 1; i++) {
    const p = filteredSeries[i];
    const isLocalMax = p.value > filteredSeries[i - 1].value && p.value >= filteredSeries[i + 1].value;
    if (isLocalMax && p.value > threshold && p.timestampMs - lastPeakMs >= minDistanceMs) {
      peaks.push(p.timestampMs);
      lastPeakMs = p.timestampMs;
    }
  }
  return peaks;
}

export function computeIBIsFromPeaks(peakTimestampsMs) {
  const ibis = [];
  for (let i = 1; i < peakTimestampsMs.length; i++) ibis.push(peakTimestampsMs[i] - peakTimestampsMs[i - 1]);
  return ibis;
}

// Contrôle qualité : GOOD / ACCEPTABLE / POOR selon couverture, nombre de
// battements valides et taux d'artefacts (réutilise cleanRRIntervals de
// hrvEngine.js pour filtrer les IBIs aberrants avant d'évaluer).
export function assessPpgSignalQuality(cleanResult, coverageSec) {
  const validBeats = cleanResult.validRR.length;
  const artifactRatio = cleanResult.artifactRatio;
  const roundedCoverage = Math.round(coverageSec);

  if (coverageSec < PPG_MIN_COVERAGE_SEC * 0.5 || validBeats < PPG_MIN_VALID_BEATS * 0.4) {
    return { level: "poor", validBeats, artifactRatio, coverageSec: roundedCoverage };
  }
  if (artifactRatio <= PPG_MAX_ARTIFACT_RATIO_GOOD && validBeats >= PPG_MIN_VALID_BEATS && coverageSec >= PPG_MIN_COVERAGE_SEC) {
    return { level: "good", validBeats, artifactRatio, coverageSec: roundedCoverage };
  }
  if (artifactRatio <= PPG_MAX_ARTIFACT_RATIO_ACCEPTABLE && validBeats >= PPG_MIN_VALID_BEATS * 0.6) {
    return { level: "acceptable", validBeats, artifactRatio, coverageSec: roundedCoverage };
  }
  return { level: "poor", validBeats, artifactRatio, coverageSec: roundedCoverage };
}

// Point d'entrée pour une phase complète (allongé OU debout) : renvoie les
// IBIs bruts (à passer tels quels à hrvEngine.computeOrthostaticReport, qui
// fait déjà son propre nettoyage/exclusion de la période d'adaptation) ET
// les IBIs nettoyés localement pour le contrôle qualité immédiat.
export function processPpgPhase(rawSamples, options = {}) {
  if (!rawSamples || rawSamples.length < 30) {
    return { ibisMs: [], rawIbisMs: [], quality: { level: "poor", validBeats: 0, artifactRatio: 1, coverageSec: 0 } };
  }
  const filtered = detrendPpgSignal(rawSamples);
  const peaks = detectPpgPeaks(filtered, options);
  const rawIbisMs = computeIBIsFromPeaks(peaks);
  const clean = cleanRRIntervals(rawIbisMs, options);
  const coverageSec = (rawSamples[rawSamples.length - 1].timestampMs - rawSamples[0].timestampMs) / 1000;
  const quality = assessPpgSignalQuality(clean, coverageSec);
  return { ibisMs: clean.validRR, rawIbisMs, quality };
}

// FC à des instants précis de la phase debout (§6 du cahier des charges) —
// moyenne des IBIs dans une fenêtre de ±10s autour de chaque marqueur.
export function computeHeartRateAtMarks(ibisMs, markMinutes = [1, 2, 3], windowMs = 20000) {
  if (!ibisMs || ibisMs.length < 3) return markMinutes.map((m) => ({ minute: m, heartRate: null }));
  const cumulative = [];
  let t = 0;
  for (const ibi of ibisMs) { t += ibi; cumulative.push(t); }
  return markMinutes.map((m) => {
    const targetMs = m * 60000;
    const windowIbis = ibisMs.filter((_, i) => Math.abs(cumulative[i] - targetMs) <= windowMs / 2);
    if (windowIbis.length < 2) return { minute: m, heartRate: null };
    const meanIbi = windowIbis.reduce((a, b) => a + b, 0) / windowIbis.length;
    return { minute: m, heartRate: Math.round(60000 / meanIbi) };
  });
}

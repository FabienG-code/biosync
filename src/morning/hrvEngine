// ============================================================================
// morning/hrvEngine.js — BioSync
// ----------------------------------------------------------------------------
// Phase 1 de la refonte du Morning Check-in : moteur pur de traitement du
// signal cardiaque (intervalles RR) et du test orthostatique. Aucune
// dépendance Bluetooth/UI — testable avec `node morning/hrvEngine.test.js`,
// exactement comme cmjEngine.js pour le module CMJ.
//
// RÉUTILISE LE MÊME PATRON que les moteurs existants (Workload, Hormonal,
// CMJ) : baseline individuelle -> z-score 0-100 -> combinaison pondérée
// -> recommandation par règles avec rationaleKey. Les fonctions
// `softPenaltyScore` / `genericBaselineZScore` sont ré-implémentées ici
// (mêmes formules qu'App.jsx/cmjEngine.js) pour garder ce fichier
// autonome et sans dépendance circulaire.
//
// PIPELINE (miroir du pipeline CMJ) :
//   bleHeartRate.js        -> flux brut de battements { rrMs, timestampMs }
//   hrvEngine.js            -> cleanRRIntervals() -> métriques -> rapport   (ce fichier)
//   OrthostaticTestScreen.jsx -> orchestration UI (phase 3)
//
// ⚠️ AVERTISSEMENT NON NÉGOCIABLE (même esprit que HRI côté Hormonal Engine) :
// Les indices calculés ici (orthostaticResponseIndex, sympatheticActivationIndex,
// parasympatheticRecoveryIndex, autonomicStatus) sont des indicateurs
// PROPRIÉTAIRES, NON VALIDÉS CLINIQUEMENT. Ce ne sont ni des scores médicaux
// ni des outils diagnostiques. Ils ne remplacent jamais un avis médical.
// ============================================================================

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const round3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function softPenaltyScore(absDeviation, freeZone, fullPenaltyAt) {
  const excess = Math.max(0, absDeviation - freeZone);
  const span = Math.max(1e-6, fullPenaltyAt - freeZone);
  return 100 * (1 - clamp(excess / span, 0, 1));
}

// Même convention que baselineZScore ailleurs dans l'app : neutre (70) si
// pas assez d'historique, 50 pile à la moyenne individuelle (jamais 100).
function genericBaselineZScore(stat, higherIsBetter) {
  if (!stat || !stat.individualSd) return 70;
  const z = (stat.today - stat.individualMean) / stat.individualSd;
  const oriented = higherIsBetter ? z : -z;
  return clamp(50 + oriented * 20, 0, 100);
}

export const ORTHOSTATIC_DISCLAIMER =
  "Ces indices (réponse orthostatique, activation sympathique, récupération parasympathique) sont des indicateurs propriétaires, non validés cliniquement. Ce ne sont ni des scores médicaux ni des outils diagnostiques. Ils ne remplacent jamais un avis médical.";

// ============================================================================
// 1. Nettoyage des intervalles RR (correction d'artefacts)
// ----------------------------------------------------------------------------
// Deux filtres complémentaires, méthode standard en analyse HRV :
//   (a) plage physiologique absolue (30-200 bpm)
//   (b) écart à la médiane locale (fenêtre glissante) — détecte les battements
//       ectopiques/artefacts que (a) seul laisserait passer
// ============================================================================
export const RR_MIN_MS = 300; // 200 bpm max
export const RR_MAX_MS = 2000; // 30 bpm min
export const RR_ARTIFACT_THRESHOLD_PERCENT = 0.2; // 20% d'écart vs médiane locale
export const RR_LOCAL_WINDOW = 5;

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function cleanRRIntervals(rrMsRaw, options = {}) {
  const threshold = options.artifactThresholdPercent ?? RR_ARTIFACT_THRESHOLD_PERCENT;
  const window = options.localWindow ?? RR_LOCAL_WINDOW;
  const rrMs = rrMsRaw || [];
  const valid = [];
  let rejectedCount = 0;

  for (let i = 0; i < rrMs.length; i++) {
    const rr = rrMs[i];
    if (!Number.isFinite(rr) || rr < RR_MIN_MS || rr > RR_MAX_MS) {
      rejectedCount++;
      continue;
    }
    const windowStart = Math.max(0, i - window);
    const windowEnd = Math.min(rrMs.length, i + window + 1);
    const localValues = [];
    for (let j = windowStart; j < windowEnd; j++) {
      if (j === i) continue;
      const v = rrMs[j];
      if (Number.isFinite(v) && v >= RR_MIN_MS && v <= RR_MAX_MS) localValues.push(v);
    }
    if (localValues.length >= 3) {
      const localMedian = median(localValues);
      const deviation = Math.abs(rr - localMedian) / localMedian;
      if (deviation > threshold) {
        rejectedCount++;
        continue;
      }
    }
    valid.push(rr);
  }

  const totalCount = rrMs.length;
  const artifactRatio = totalCount ? rejectedCount / totalCount : 1;
  return { validRR: valid, rejectedCount, totalCount, artifactRatio: round3(artifactRatio) };
}

// ============================================================================
// 2. Métriques HRV de base
// ============================================================================
export function computeRMSSD(rrMs) {
  if (!rrMs || rrMs.length < 2) return null;
  let sumSq = 0;
  for (let i = 1; i < rrMs.length; i++) {
    const d = rrMs[i] - rrMs[i - 1];
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (rrMs.length - 1));
}

export function computeSDNN(rrMs) {
  if (!rrMs || rrMs.length < 2) return null;
  const mean = rrMs.reduce((a, b) => a + b, 0) / rrMs.length;
  const variance = rrMs.reduce((a, b) => a + (b - mean) ** 2, 0) / rrMs.length;
  return Math.sqrt(variance);
}

export function computeMeanHR(rrMs) {
  if (!rrMs || !rrMs.length) return null;
  const meanRR = rrMs.reduce((a, b) => a + b, 0) / rrMs.length;
  return 60000 / meanRR;
}

export function computePNN50(rrMs) {
  if (!rrMs || rrMs.length < 2) return null;
  let count = 0;
  for (let i = 1; i < rrMs.length; i++) {
    if (Math.abs(rrMs[i] - rrMs[i - 1]) > 50) count++;
  }
  return (count / (rrMs.length - 1)) * 100;
}

// ============================================================================
// 3. Contrôle qualité du signal (même esprit que qualityControl.js côté CMJ)
// ============================================================================
export const MAX_ARTIFACT_RATIO = 0.1; // 10% de battements rejetés max
export const MIN_VALID_BEATS = 60; // ~1 minute de signal exploitable minimum

export function assessSignalQuality(cleanResult, options = {}) {
  const maxArtifactRatio = options.maxArtifactRatio ?? MAX_ARTIFACT_RATIO;
  const minValidBeats = options.minValidBeats ?? MIN_VALID_BEATS;
  const issues = [];
  if (cleanResult.artifactRatio > maxArtifactRatio) issues.push("high_artifact_ratio");
  if (cleanResult.validRR.length < minValidBeats) issues.push("insufficient_beats");
  return { ok: issues.length === 0, issues, artifactRatio: cleanResult.artifactRatio, validBeats: cleanResult.validRR.length };
}

// ============================================================================
// 4. Reconstruction temporelle et exclusion de la période d'adaptation
// ----------------------------------------------------------------------------
// Les RR encodent nativement le temps écoulé entre battements — pas besoin
// d'horodatage Bluetooth pour situer un battement dans le temps, on cumule
// simplement les RR depuis le début de la phase. Plus robuste que les
// timestamps de réception BLE, sujets à la latence radio.
// ============================================================================
export const SETTLING_PERIOD_MS = 30000; // 30s d'adaptation ignorées en début de phase

function cumulativeTimestamps(rrMs) {
  const out = [];
  let t = 0;
  for (const rr of rrMs) {
    t += rr;
    out.push(t);
  }
  return out;
}

export function excludeSettlingPeriod(rrMs, settlingMs = SETTLING_PERIOD_MS) {
  const ts = cumulativeTimestamps(rrMs);
  return rrMs.filter((_, i) => ts[i] >= settlingMs);
}

// ============================================================================
// 5. Temps de stabilisation de la fréquence cardiaque (phase debout)
// ----------------------------------------------------------------------------
// Cherche le premier instant à partir duquel le HR reste durablement (fenêtre
// glissante) proche du plateau final (moyenne du dernier tiers de la phase).
// ============================================================================
export const STABILIZATION_TOLERANCE_BPM = 3;
export const STABILIZATION_WINDOW_MS = 15000;

export function computeStabilizationTimeMs(standingRR, options = {}) {
  const toleranceBpm = options.toleranceBpm ?? STABILIZATION_TOLERANCE_BPM;
  const windowMs = options.windowMs ?? STABILIZATION_WINDOW_MS;
  if (!standingRR || standingRR.length < 10) return null;

  const ts = cumulativeTimestamps(standingRR);
  const totalMs = ts[ts.length - 1];
  const plateauStart = totalMs * (2 / 3);
  const plateauRR = standingRR.filter((_, i) => ts[i] >= plateauStart);
  if (plateauRR.length < 5) return null;
  const plateauHR = computeMeanHR(plateauRR);

  for (let i = 0; i < standingRR.length; i++) {
    const tStart = ts[i];
    const windowRR = standingRR.filter((_, j) => ts[j] >= tStart && ts[j] < tStart + windowMs);
    if (windowRR.length < 3) continue;
    const windowHR = computeMeanHR(windowRR);
    if (Math.abs(windowHR - plateauHR) <= toleranceBpm) {
      return Math.round(tStart);
    }
  }
  return null; // jamais stabilisé dans la fenêtre observée
}

// ============================================================================
// 6. Indices composites orthostatiques (0-100)
// ----------------------------------------------------------------------------
// Heuristiques documentées, alignées sur la littérature du test orthostatique
// court (3 min) : ΔFC normale ~10-25 bpm au lever ; le RMSSD chute
// normalement en position debout (retrait vagal physiologique) — un ratio
// trop proche de 1 (peu de retrait) ou trop bas (retrait excessif) sont
// tous deux des signaux à surveiller, pas seulement une valeur basse.
// ============================================================================
function computeOrthostaticResponseIndex(deltaHR) {
  if (deltaHR == null) return null;
  const deviation = deltaHR < 15 ? 15 - deltaHR : deltaHR > 25 ? deltaHR - 25 : 0;
  return Math.round(softPenaltyScore(deviation, 5, 25));
}

function computeSympatheticActivationIndex(deltaHR, rmssdRatio) {
  if (deltaHR == null) return null;
  const hrComponent = softPenaltyScore(Math.max(0, deltaHR - 20), 5, 25);
  if (rmssdRatio == null) return Math.round(hrComponent);
  const ratioComponent = softPenaltyScore(Math.max(0, 0.7 - rmssdRatio) * 100, 0, 40);
  return Math.round((hrComponent + ratioComponent) / 2);
}

function computeParasympatheticRecoveryIndex(rmssdRatio, stabilizationTimeMs) {
  if (rmssdRatio == null && stabilizationTimeMs == null) return null;
  const ratioScore = rmssdRatio == null ? null : clamp(100 - Math.abs(rmssdRatio - 0.6) * 100, 0, 100);
  const stabScore =
    stabilizationTimeMs == null ? null : softPenaltyScore(Math.max(0, (stabilizationTimeMs - 60000) / 1000), 0, 120);
  const scores = [ratioScore, stabScore].filter((v) => v != null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// ============================================================================
// 7. Rapport complet du test orthostatique
// ----------------------------------------------------------------------------
// Point d'entrée principal pour la phase 3 (OrthostaticTestScreen.jsx) :
// prend les flux RR bruts des deux phases (allongé / debout), nettoie,
// exclut la période d'adaptation, calcule toutes les métriques.
// ============================================================================
export function computeOrthostaticReport(lyingRRRaw, standingRRRaw, options = {}) {
  const lyingClean = cleanRRIntervals(lyingRRRaw, options);
  const standingClean = cleanRRIntervals(standingRRRaw, options);
  const lyingQuality = assessSignalQuality(lyingClean, options);
  const standingQuality = assessSignalQuality(standingClean, options);

  const lyingStable = excludeSettlingPeriod(lyingClean.validRR, options.settlingMs);
  const standingStable = excludeSettlingPeriod(standingClean.validRR, options.settlingMs);

  const restingHR = computeMeanHR(lyingStable);
  const standingHR = computeMeanHR(standingStable);
  const standingMaxHR = standingStable.length ? Math.max(...standingStable.map((rr) => 60000 / rr)) : null;
  const deltaHR = restingHR != null && standingHR != null ? round1(standingHR - restingHR) : null;

  const rmssdLying = computeRMSSD(lyingStable);
  const rmssdStanding = computeRMSSD(standingStable);
  const sdnnLying = computeSDNN(lyingStable);
  const sdnnStanding = computeSDNN(standingStable);
  const rmssdRatio = rmssdLying && rmssdStanding != null && rmssdLying > 0 ? round2(rmssdStanding / rmssdLying) : null;

  const stabilizationTimeMs = computeStabilizationTimeMs(standingClean.validRR, options);

  const orthostaticResponseIndex = computeOrthostaticResponseIndex(deltaHR);
  const sympatheticActivationIndex = computeSympatheticActivationIndex(deltaHR, rmssdRatio);
  const parasympatheticRecoveryIndex = computeParasympatheticRecoveryIndex(rmssdRatio, stabilizationTimeMs);

  return {
    restingHR: round1(restingHR),
    standingHR: round1(standingHR),
    standingMaxHR: round1(standingMaxHR),
    deltaHR,
    rmssdLying: round1(rmssdLying),
    rmssdStanding: round1(rmssdStanding),
    sdnnLying: round1(sdnnLying),
    sdnnStanding: round1(sdnnStanding),
    rmssdRatio,
    stabilizationTimeMs,
    orthostaticResponseIndex,
    sympatheticActivationIndex,
    parasympatheticRecoveryIndex,
    signalQuality: { lying: lyingQuality, standing: standingQuality, ok: lyingQuality.ok && standingQuality.ok },
  };
}

// ============================================================================
// 8. Statut autonome (score composite 0-100 vs baseline individuelle)
// ----------------------------------------------------------------------------
// Même mécanique que computeReadiness (Workload) et computeNeuromuscularStatus
// (CMJ) : chaque facteur disponible produit un sous-score, pondération
// redistribuée sur les facteurs présents.
// ============================================================================
export const DEFAULT_AUTONOMIC_WEIGHTS = {
  restingHR: 0.2,
  rmssd: 0.25,
  orthostaticResponse: 0.2,
  sympatheticActivation: 0.2,
  parasympatheticRecovery: 0.15,
};

export function computeAutonomicStatus(report, baselineInputs = {}, weights = DEFAULT_AUTONOMIC_WEIGHTS) {
  const raw = [
    {
      key: "restingHR",
      label: "autonomic_factor_resting_hr",
      score: baselineInputs.restingHR ? genericBaselineZScore(baselineInputs.restingHR, false) : null,
    },
    {
      key: "rmssd",
      label: "autonomic_factor_rmssd",
      score: baselineInputs.rmssdLying ? genericBaselineZScore(baselineInputs.rmssdLying, true) : null,
    },
    { key: "orthostaticResponse", label: "autonomic_factor_orthostatic", score: report?.orthostaticResponseIndex ?? null },
    { key: "sympatheticActivation", label: "autonomic_factor_sympathetic", score: report?.sympatheticActivationIndex ?? null },
    { key: "parasympatheticRecovery", label: "autonomic_factor_parasympathetic", score: report?.parasympatheticRecoveryIndex ?? null },
  ];

  const available = raw.filter((r) => r.score != null);
  if (!available.length) return null;

  const totalWeight = available.reduce((s, r) => s + (weights[r.key] ?? 0), 0) || 1;
  const subscores = raw.map((r) => ({
    key: r.key,
    label: r.label,
    score: r.score ?? 70,
    weight: r.score == null ? 0 : (weights[r.key] ?? 0) / totalWeight,
    available: r.score != null,
  }));

  const score = Math.round(subscores.reduce((s, x) => s + x.score * x.weight, 0));
  const level =
    score >= 80 ? "optimal" : score >= 65 ? "good" : score >= 50 ? "to_monitor" : score >= 35 ? "probable_fatigue" : "significant_fatigue";

  return { score, level, subscores };
}

function weakestFactors(status, n = 2) {
  return status.subscores
    .filter((s) => s.available)
    .sort((a, b) => a.score - b.score)
    .slice(0, n)
    .map((s) => s.label);
}

// ============================================================================
// 9. Distinction du type de fatigue (objectif central de la refonte)
// ----------------------------------------------------------------------------
// Compare la contribution relative des facteurs autonomes vs neuromusculaires
// (CMJ, fourni par le module CMJ existant) vs récupération (sommeil/temp/
// questionnaires) pour distinguer les 4 profils demandés : fatigue autonome,
// neuromusculaire, systémique (les deux à la fois), ou récupération optimale.
// `cmjStatus` et `recoveryStatus` sont optionnels — si absents, la fonction
// se rabat sur ce qui est disponible (Check-in "Rapide"/"Standard").
// ============================================================================
export function classifyFatigueProfile(autonomicStatus, cmjStatus, recoveryStatus) {
  const domains = [
    { key: "autonomic", status: autonomicStatus },
    { key: "neuromuscular", status: cmjStatus },
    { key: "recovery", status: recoveryStatus },
  ].filter((d) => d.status != null);

  if (!domains.length) return { profile: "insufficient_data", degradedDomains: [] };

  const degraded = domains.filter((d) => d.status.score < 65).map((d) => d.key);

  if (degraded.length === 0) return { profile: "optimal_recovery", degradedDomains: [] };
  if (degraded.length === domains.length && domains.length > 1) return { profile: "systemic_fatigue", degradedDomains: degraded };
  if (degraded.includes("autonomic") && !degraded.includes("neuromuscular")) return { profile: "autonomic_fatigue", degradedDomains: degraded };
  if (degraded.includes("neuromuscular") && !degraded.includes("autonomic")) return { profile: "neuromuscular_fatigue", degradedDomains: degraded };
  return { profile: "mixed_fatigue", degradedDomains: degraded };
}

// ============================================================================
// 10. Recommandation par règles
// ============================================================================
export function generateAutonomicRecommendation(autonomicStatus, fatigueProfile) {
  if (!autonomicStatus) return { action: "insufficient_data", rationaleKey: "autonomic_rationale_no_data", drivers: [] };

  if (autonomicStatus.level === "significant_fatigue") {
    return {
      action: fatigueProfile?.profile === "systemic_fatigue" ? "rest" : "reduce_intensity",
      riskLevel: "high",
      rationaleKey: "autonomic_rationale_severe",
      drivers: weakestFactors(autonomicStatus),
      fatigueProfile: fatigueProfile?.profile ?? null,
    };
  }
  if (autonomicStatus.level === "probable_fatigue") {
    return {
      action: "reduce_volume",
      riskLevel: "moderate",
      rationaleKey: "autonomic_rationale_fatigue",
      drivers: weakestFactors(autonomicStatus),
      fatigueProfile: fatigueProfile?.profile ?? null,
    };
  }
  if (autonomicStatus.level === "to_monitor") {
    return {
      action: "monitor",
      riskLevel: "moderate",
      rationaleKey: "autonomic_rationale_monitor",
      drivers: weakestFactors(autonomicStatus),
      fatigueProfile: fatigueProfile?.profile ?? null,
    };
  }
  return { action: "maintain", riskLevel: "low", rationaleKey: "autonomic_rationale_optimal", drivers: [], fatigueProfile: fatigueProfile?.profile ?? null };
}

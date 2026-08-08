// ============================================================================
// cmj/cmjEngine.js — BioSync
// ----------------------------------------------------------------------------
// Étape 2 de l'architecture CMJ : moteur pur, sans dépendance UI ni caméra.
// Réutilise exactement le patron déjà en place pour le Workload Engine et le
// Hormonal Readiness Engine dans App.jsx :
//
//   baseline individuelle (moyenne/écart-type) -> z-score normalisé 0-100
//   -> combinaison pondérée multi-facteurs avec redistribution automatique
//   -> recommandation par règles avec clé de justification (rationaleKey)
//
// Comme pour les deux moteurs existants, ce fichier est conçu pour être
// terminé/testé de façon autonome puis inliné dans App.jsx de la même
// manière (voir les commentaires "JS port du module TypeScript autonome" au
// début des sections WORKLOAD / HORMONAL de App.jsx) — aucune dépendance
// externe, testable avec `node cmj/cmjEngine.test.js` sans navigateur.
//
// Portée de ce fichier (étape 2 uniquement, cf. biosync-cmj-architecture.md) :
//   - dérivation best/avg/qualité à partir des sauts bruts (utile aussi à
//     jumpDetector.js plus tard, étape 4)
//   - baseline individuelle glissante (30j par défaut, cf. Buchheit 2014,
//     même fenêtre de raisonnement que VFC/FC repos dans le Workload Engine)
//   - variation % vs baseline
//   - moyenne glissante 7j et tendance 30j (régression linéaire simple)
//   - indice de fatigue neuromusculaire 0-100 (composite multi-facteurs)
//   - recommandation par règles
//
// Hors scope ici : capture caméra (étape 4), contrôle qualité avancé
// (étape 5), UI Dashboard (étape 3).
// ============================================================================

export const CMJ_ALGORITHM_VERSION = "cmj-v1";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round1 = (v) => Math.round(v * 10) / 10;

function addDaysISO(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// 1. Dérivation du résultat de test à partir des sauts bruts
// ----------------------------------------------------------------------------
// Pure et déterministe : mêmes règles que celles décrites dans
// biosync-cmj-architecture.md §3 — seuls les sauts "valid" comptent pour le
// meilleur/la moyenne ; la qualité globale du test dépend du nombre de sauts
// valides, pas d'une heuristique caméra (qui vit dans qualityControl.js,
// étape 5). Volontairement séparé de la capture pour rester recalculable si
// l'algorithme de détection évolue (cf. algorithmVersion dans le modèle).
// ============================================================================
export function summarizeJumps(jumps) {
  const valid = (jumps || []).filter(
    (j) => j && j.quality === "valid" && Number.isFinite(j.heightCm)
  );
  if (valid.length === 0) {
    return { bestHeightCm: null, avgHeightCm: null, testQuality: "poor", validCount: 0 };
  }
  const heights = valid.map((j) => j.heightCm);
  const bestHeightCm = round1(Math.max(...heights));
  const avgHeightCm = round1(heights.reduce((a, b) => a + b, 0) / heights.length);
  const testQuality = valid.length >= 3 ? "good" : valid.length === 2 ? "acceptable" : "poor";
  return { bestHeightCm, avgHeightCm, testQuality, validCount: valid.length };
}

// ============================================================================
// 2. Baseline individuelle glissante
// ----------------------------------------------------------------------------
// Même logique que vfcStats/rhrStats dans RecoveryDashboard (App.jsx) :
// moyenne + écart-type sur un historique récent, en excluant le jour même.
// Fenêtre de 30 jours par défaut (plus courte que les 35j de charge utilisés
// ailleurs — la hauteur de saut est plus stable jour à jour que le sommeil
// ou la VFC, donc une fenêtre un peu plus longue reste pertinente sans sur-
// lisser une vraie tendance de fatigue).
// ============================================================================
export const CMJ_BASELINE_WINDOW_DAYS = 30;
export const CMJ_BASELINE_MIN_SAMPLES = 5;

export function computeCMJBaselineStats(history, todayDate, options = {}) {
  const windowDays = options.windowDays ?? CMJ_BASELINE_WINDOW_DAYS;
  const minSamples = options.minSamples ?? CMJ_BASELINE_MIN_SAMPLES;
  const cutoff = addDaysISO(todayDate, -windowDays);
  const heights = Object.keys(history || {})
    .filter((d) => d >= cutoff && d < todayDate)
    .map((d) => history[d]?.bestHeightCm)
    .filter((v) => Number.isFinite(v));

  if (heights.length < minSamples) {
    return { individualMean: null, individualSd: null, sampleSize: heights.length, sufficient: false };
  }
  const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
  const variance = heights.reduce((a, b) => a + (b - mean) ** 2, 0) / heights.length;
  return { individualMean: mean, individualSd: Math.sqrt(variance), sampleSize: heights.length, sufficient: true };
}

// Même convention que baselineZScore dans le Workload Engine : si l'écart-
// type individuel n'est pas disponible (historique insuffisant), on renvoie
// 70 (neutre-favorable) plutôt que de pénaliser un athlète qui débute le
// suivi. Au niveau exact de la moyenne individuelle (z=0), le score vaut 50
// (neutre), jamais 100 — même nuance de test que pour le Hormonal Engine.
export function cmjHeightSubscore(todayHeightCm, baselineStats) {
  if (todayHeightCm == null) return null;
  if (!baselineStats.sufficient || !baselineStats.individualSd) return 70;
  const z = (todayHeightCm - baselineStats.individualMean) / baselineStats.individualSd;
  return clamp(50 + z * 20, 0, 100);
}

export function computeCMJVariationPercent(todayHeightCm, baselineStats) {
  if (todayHeightCm == null || !baselineStats.sufficient || !baselineStats.individualMean) return null;
  return round1(((todayHeightCm - baselineStats.individualMean) / baselineStats.individualMean) * 100);
}

// ============================================================================
// 3. Moyenne glissante 7j & tendance 30j
// ----------------------------------------------------------------------------
// buildHeightSeries produit une série zéro-tolérante (valeurs manquantes en
// null, pas en 0) — contrairement à buildDailyLoadSeries qui zéro-remplit
// volontairement les jours de repos. Ici un jour sans test n'est PAS un test
// à 0cm, donc il doit être exclu des calculs plutôt que fausser la moyenne.
// ============================================================================
function buildHeightSeries(history, endDate, days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysISO(endDate, -i);
    out.push({ date, value: history[date]?.bestHeightCm ?? null });
  }
  return out;
}

export function computeRollingAverage(history, endDate, days = 7) {
  const vals = buildHeightSeries(history, endDate, days)
    .map((p) => p.value)
    .filter((v) => v != null);
  if (!vals.length) return null;
  return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export const CMJ_TREND = { UP: "up", DOWN: "down", STABLE: "stable", INSUFFICIENT: "insufficient" };
const CMJ_TREND_THRESHOLD_PERCENT_PER_WEEK = 1.5;
const CMJ_TREND_MIN_POINTS = 6;

// Régression linéaire simple sur les points disponibles (jours sans test
// ignorés). La pente est exprimée en %/semaine par rapport à la moyenne de
// la fenêtre, pour rester interprétable indépendamment de la hauteur de saut
// absolue de l'athlète (cohérent avec weeklyLoadChangePercent ailleurs dans
// l'app, qui raisonne aussi en % plutôt qu'en valeur brute).
export function computeCMJTrend(history, endDate, days = 30) {
  const series = buildHeightSeries(history, endDate, days).filter((p) => p.value != null);
  if (series.length < CMJ_TREND_MIN_POINTS) {
    return { trend: CMJ_TREND.INSUFFICIENT, slopePercentPerWeek: null, sampleSize: series.length };
  }
  const n = series.length;
  const xs = series.map((_, i) => i);
  const ys = series.map((p) => p.value);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slopePerDay = den === 0 ? 0 : num / den;
  const slopePercentPerWeek = yMean === 0 ? 0 : round1((slopePerDay * 7 * 100) / yMean);
  const trend =
    Math.abs(slopePercentPerWeek) < CMJ_TREND_THRESHOLD_PERCENT_PER_WEEK
      ? CMJ_TREND.STABLE
      : slopePercentPerWeek > 0
      ? CMJ_TREND.UP
      : CMJ_TREND.DOWN;
  return { trend, slopePercentPerWeek, sampleSize: n };
}

// ============================================================================
// 4. Indice de fatigue neuromusculaire (0-100)
// ----------------------------------------------------------------------------
// Même mécanique que computeReadiness (Workload) : chaque facteur DISPONIBLE
// produit un sous-score 0-100 ; les poids des facteurs manquants sont
// redistribués proportionnellement sur les facteurs présents (totalWeight).
// "cmj" a le poids le plus élevé — c'est la donnée la plus spécifique à la
// fatigue neuromusculaire ; les autres (VFC, FC repos, sommeil, charge,
// douleur...) sont des signaux de soutien déjà calculés ailleurs dans l'app
// et simplement transmis en entrée (pas recalculés ici, pour ne pas dupliquer
// la logique du Workload Engine).
// ============================================================================
export const DEFAULT_NEUROMUSCULAR_WEIGHTS = {
  cmj: 0.35,
  hrv: 0.15,
  restingHeartRate: 0.1,
  nightTemperature: 0.05,
  sleep: 0.1,
  load: 0.1,
  carbsAvailability: 0.05,
  pain: 0.05,
  subjective: 0.05,
};

function softPenaltyScore(absDeviation, freeZone, fullPenaltyAt) {
  const excess = Math.max(0, absDeviation - freeZone);
  const span = Math.max(1e-6, fullPenaltyAt - freeZone);
  return 100 * (1 - clamp(excess / span, 0, 1));
}

function genericBaselineZScore(stat, higherIsBetter) {
  if (!stat || !stat.individualSd) return 70;
  const z = (stat.today - stat.individualMean) / stat.individualSd;
  const oriented = higherIsBetter ? z : -z;
  return clamp(50 + oriented * 20, 0, 100);
}

function sleepSubscore(hours) {
  if (hours == null) return null;
  return clamp(100 - Math.abs(hours - 8) * 18, 0, 100);
}

function loadSubscoreSimple(loadDeltaPercent) {
  if (loadDeltaPercent == null) return null;
  return softPenaltyScore(Math.abs(loadDeltaPercent), 20, 80);
}

function painSubscoreSimple(pain) {
  if (pain == null) return null;
  return clamp(100 - pain * 10, 0, 100);
}

// inputs attendus (tous optionnels sauf cmjHeightScore, déjà calculé par
// cmjHeightSubscore en amont) :
//   cmjHeightScore, hrv:{today,individualMean,individualSd},
//   restingHeartRate:{...}, nightTemperatureDeltaC, sleepHours,
//   loadDeltaPercent (acuteLoad7d vs chronicLoad28d, cf. snapshot.loadDeltaPercent
//   déjà calculé par computeWorkloadSnapshot), carbsAvailabilityPercent
//   (% de l'objectif glucidique du jour atteint, si suivi côté nutrition),
//   pain (0-10), subjectiveScore (0-100, questionnaire libre étape 5)
export function computeNeuromuscularStatus(inputs, weights = DEFAULT_NEUROMUSCULAR_WEIGHTS) {
  const raw = [
    { key: "cmj", label: "cmj_factor_height", score: inputs.cmjHeightScore ?? null },
    { key: "hrv", label: "hrv_label", score: inputs.hrv ? genericBaselineZScore(inputs.hrv, true) : null },
    {
      key: "restingHeartRate",
      label: "rhr_label",
      score: inputs.restingHeartRate ? genericBaselineZScore(inputs.restingHeartRate, false) : null,
    },
    {
      key: "nightTemperature",
      label: "temp_label",
      score:
        inputs.nightTemperatureDeltaC != null
          ? softPenaltyScore(Math.abs(inputs.nightTemperatureDeltaC), 0.2, 1.0)
          : null,
    },
    { key: "sleep", label: "sleep_label", score: sleepSubscore(inputs.sleepHours) },
    { key: "load", label: "load_label", score: loadSubscoreSimple(inputs.loadDeltaPercent) },
    {
      key: "carbsAvailability",
      label: "cmj_factor_carbs",
      score: inputs.carbsAvailabilityPercent != null ? clamp(inputs.carbsAvailabilityPercent, 0, 100) : null,
    },
    { key: "pain", label: "pain_label", score: painSubscoreSimple(inputs.pain) },
    { key: "subjective", label: "cmj_factor_subjective", score: inputs.subjectiveScore ?? null },
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
    score >= 80 ? "optimal" :
    score >= 65 ? "good" :
    score >= 50 ? "to_monitor" :
    score >= 35 ? "probable_fatigue" :
    "significant_fatigue";

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
// 5. Recommandation par règles
// ----------------------------------------------------------------------------
// Même forme que generateRecommendation : { action, riskLevel, rationaleKey,
// drivers } — les clés i18n (cmj_rationale_*, cmj_action_*) sont à ajouter au
// DICT (fr/en/es) à l'étape 3, en même temps que la carte Dashboard.
// ============================================================================
export function generateNeuromuscularRecommendation(status) {
  if (!status) return { action: "run_test", riskLevel: null, rationaleKey: "cmj_rationale_no_data", drivers: [] };

  if (status.level === "significant_fatigue") {
    return { action: "postpone_intense_session", riskLevel: "high", rationaleKey: "cmj_rationale_severe", drivers: weakestFactors(status) };
  }
  if (status.level === "probable_fatigue") {
    return { action: "reduce_intensity", riskLevel: "moderate", rationaleKey: "cmj_rationale_fatigue", drivers: weakestFactors(status) };
  }
  if (status.level === "to_monitor") {
    return { action: "monitor", riskLevel: "moderate", rationaleKey: "cmj_rationale_monitor", drivers: weakestFactors(status) };
  }
  return { action: "maintain", riskLevel: "low", rationaleKey: "cmj_rationale_optimal", drivers: [] };
}

// ============================================================================
// 6. Orchestration — point d'entrée unique (comme computeAthleteReadinessReport
//    et computeHormonalReadinessReport)
// ----------------------------------------------------------------------------
// history : objet { "YYYY-MM-DD": { bestHeightCm, avgHeightCm, testQuality, ... } }
//           — forme exactement celle renvoyée par getAthleteData côté Sheet
//           (colonnes CMJ existantes dans script.docx : Meilleur saut, Moyenne...).
// extraInputs : signaux de soutien déjà calculés ailleurs dans l'app (VFC,
//           FC repos, sommeil, charge, douleur...) — voir computeNeuromuscularStatus.
// ============================================================================
export function computeCMJReport(history, todayDate, extraInputs = {}, options = {}) {
  const safeHistory = history || {};
  const todayEntry = safeHistory[todayDate] || null;
  const todayHeightCm = todayEntry?.bestHeightCm ?? null;

  const baselineStats = computeCMJBaselineStats(safeHistory, todayDate, options);
  const cmjHeightScore = cmjHeightSubscore(todayHeightCm, baselineStats);
  const variationPercent = computeCMJVariationPercent(todayHeightCm, baselineStats);
  const rollingAvg7d = computeRollingAverage(safeHistory, todayDate, 7);
  const trend30d = computeCMJTrend(safeHistory, todayDate, 30);

  const status = computeNeuromuscularStatus({ ...extraInputs, cmjHeightScore }, options.weights);
  const recommendation = generateNeuromuscularRecommendation(status);

  return {
    testedToday: !!todayEntry,
    todayHeightCm,
    baselineStats,
    variationPercent,
    rollingAvg7d,
    trend30d,
    status,
    recommendation,
  };
}

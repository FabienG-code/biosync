// ============================================================================
// morning/recoveryEngine.js — BioSync
// ----------------------------------------------------------------------------
// Moteur pur du questionnaire matinal. Deux groupes de facteurs subjectifs :
//   - HOOPER_ITEMS : le Hooper Index classique (sommeil, fatigue, courbatures,
//     stress), échelle 1-7, 1=meilleur état. Même items que l'ancien
//     CheckinForm (App.jsx), pour rester comparable au score Hooper standard
//     utilisé dans la littérature du monitoring d'entraînement (Hooper &
//     Mackinnon, 1995).
//   - QUESTIONNAIRE_ITEMS : 3 facteurs complémentaires (motivation, douleur
//     articulaire, sensation générale de récupération), échelle 0-10, non
//     couverts par le Hooper classique.
// + durée de sommeil et température cutanée, échelles séparées.
//
// Aucune dépendance UI/réseau — testable avec `node morning/recoveryEngine.test.js`.
// ============================================================================

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function softPenaltyScore(absDeviation, freeZone, fullPenaltyAt) {
  const excess = Math.max(0, absDeviation - freeZone);
  const span = Math.max(1e-6, fullPenaltyAt - freeZone);
  return 100 * (1 - clamp(excess / span, 0, 1));
}

function scaledItemToScore(rawValue, direction, min, max) {
  const clamped = clamp(rawValue, min, max);
  const normalized = (clamped - min) / (max - min);
  return direction === "worse" ? 100 - normalized * 100 : normalized * 100;
}

// ============================================================================
// 1. Hooper Index (échelle 1-7, 1 = meilleur état, tous "worse")
// ============================================================================
export const HOOPER_ITEMS = [
  { key: "hooperSleepQuality", labelKey: "hooper_sommeil", hintKey: "hooper_hint_sleep_quality" },
  { key: "hooperFatigue", labelKey: "hooper_fatigue", hintKey: "hooper_hint_fatigue" },
  { key: "hooperMusclePain", labelKey: "hooper_courbatures", hintKey: "hooper_hint_muscle_pain" },
  { key: "hooperStress", labelKey: "hooper_stress", hintKey: "hooper_hint_stress" },
];

export function computeHooperFactors(values, labelResolver) {
  return HOOPER_ITEMS.filter((def) => values[def.key] != null).map((def) => ({
    key: def.key,
    label: labelResolver ? labelResolver(def.labelKey) : def.labelKey,
    score: scaledItemToScore(values[def.key], "worse", 1, 7),
  }));
}

// Score Hooper classique (somme brute 4-28, sans passer par les sous-scores
// 0-100) — nécessite les 4 items ; renvoie null si l'un d'eux manque, pour
// ne jamais produire un score Hooper partiel silencieusement faux.
export function computeHooperScore(values) {
  if (!values) return null;
  const raw = HOOPER_ITEMS.map((def) => values[def.key]);
  if (raw.some((v) => v == null)) return null;
  return raw.reduce((sum, v) => sum + clamp(v, 1, 7), 0);
}

// ============================================================================
// 2. Facteurs complémentaires (échelle 0-10)
// ============================================================================
export const QUESTIONNAIRE_ITEMS = [
  { key: "motivation", labelKey: "recovery_factor_motivation", direction: "better" },
  { key: "jointPain", labelKey: "recovery_factor_joint_pain", direction: "worse" },
  { key: "generalRecovery", labelKey: "recovery_factor_general_recovery", direction: "better" },
];

export function computeQuestionnaireFactors(values, labelResolver) {
  return QUESTIONNAIRE_ITEMS.filter((def) => values[def.key] != null).map((def) => ({
    key: def.key,
    label: labelResolver ? labelResolver(def.labelKey) : def.labelKey,
    score: scaledItemToScore(values[def.key], def.direction, 0, 10),
  }));
}

// ============================================================================
// 3. Durée de sommeil / température cutanée
// ============================================================================
export function sleepDurationScore(hours) {
  if (hours == null) return null;
  return clamp(100 - Math.abs(hours - 8) * 18, 0, 100);
}

export function temperatureScore(deltaC) {
  if (deltaC == null) return null;
  return softPenaltyScore(Math.abs(deltaC), 0.2, 1.0);
}

// ============================================================================
// 4. Score de récupération combiné (0-100)
// ----------------------------------------------------------------------------
// Poids rééquilibrés pour intégrer les 4 items Hooper (0.56 au total,
// cohérent avec leur rôle central dans le Hooper Index original) + les 3
// items complémentaires + sommeil + température.
// ============================================================================
export const DEFAULT_RECOVERY_WEIGHTS = {
  hooperSleepQuality: 0.14,
  hooperFatigue: 0.16,
  hooperMusclePain: 0.12,
  hooperStress: 0.14,
  sleepDuration: 0.14,
  motivation: 0.08,
  jointPain: 0.08,
  generalRecovery: 0.06,
  temperature: 0.08,
};

export function computeRecoveryStatus(questionnaireValues, sleepHours, temperatureDeltaC, weights = DEFAULT_RECOVERY_WEIGHTS, labelResolver) {
  const values = questionnaireValues || {};
  const raw = [
    ...HOOPER_ITEMS.map((def) => ({
      key: def.key,
      label: labelResolver ? labelResolver(def.labelKey) : def.labelKey,
      score: values[def.key] != null ? scaledItemToScore(values[def.key], "worse", 1, 7) : null,
    })),
    ...QUESTIONNAIRE_ITEMS.map((def) => ({
      key: def.key,
      label: labelResolver ? labelResolver(def.labelKey) : def.labelKey,
      score: values[def.key] != null ? scaledItemToScore(values[def.key], def.direction, 0, 10) : null,
    })),
    { key: "sleepDuration", label: labelResolver ? labelResolver("recovery_factor_sleep_duration") : "recovery_factor_sleep_duration", score: sleepDurationScore(sleepHours) },
    { key: "temperature", label: labelResolver ? labelResolver("recovery_factor_temperature") : "recovery_factor_temperature", score: temperatureScore(temperatureDeltaC) },
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

  return { score, level, subscores, hooperScore: computeHooperScore(values) };
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
// ============================================================================
export function generateRecoveryRecommendation(status) {
  if (!status) return { action: "insufficient_data", rationaleKey: "recovery_rationale_no_data", drivers: [] };
  if (status.level === "significant_fatigue") {
    return { action: "rest", riskLevel: "high", rationaleKey: "recovery_rationale_severe", drivers: weakestFactors(status) };
  }
  if (status.level === "probable_fatigue") {
    return { action: "reduce_volume", riskLevel: "moderate", rationaleKey: "recovery_rationale_fatigue", drivers: weakestFactors(status) };
  }
  if (status.level === "to_monitor") {
    return { action: "monitor", riskLevel: "moderate", rationaleKey: "recovery_rationale_monitor", drivers: weakestFactors(status) };
  }
  return { action: "maintain", riskLevel: "low", rationaleKey: "recovery_rationale_optimal", drivers: [] };
}

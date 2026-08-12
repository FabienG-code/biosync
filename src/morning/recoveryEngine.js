// ============================================================================
// morning/recoveryEngine.js — BioSync
// ----------------------------------------------------------------------------
// Phase 4 : moteur pur du questionnaire matinal + température cutanée.
// Alimente `recoveryStatus` dans classifyFatigueProfile() (hrvEngine.js),
// aux côtés du statut autonome (orthostatique) et neuromusculaire (CMJ).
//
// Réutilise le même patron que tous les moteurs précédents (Workload,
// Hormonal, CMJ, Autonomic) : direction better/worse par item -> score
// 0-100 -> combinaison pondérée avec redistribution -> niveau qualitatif.
// Même convention d'échelle 0-10 que les curseurs de symptômes déjà en
// place dans App.jsx (CycleCheckinForm) — cohérence UX avec le reste de
// l'app plutôt qu'une nouvelle échelle à apprendre pour les athlètes.
//
// Aucune dépendance UI/réseau — testable avec `node morning/recoveryEngine.test.js`.
// ============================================================================

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function softPenaltyScore(absDeviation, freeZone, fullPenaltyAt) {
  const excess = Math.max(0, absDeviation - freeZone);
  const span = Math.max(1e-6, fullPenaltyAt - freeZone);
  return 100 * (1 - clamp(excess / span, 0, 1));
}

// ============================================================================
// 1. Items du questionnaire subjectif (échelle 0-10, direction better/worse)
// ----------------------------------------------------------------------------
// Liste exacte du cahier des charges §3 : qualité du sommeil, stress,
// fatigue, motivation, douleur musculaire, douleur articulaire, sensation
// générale de récupération. La durée du sommeil et la température sont
// traitées séparément (échelles différentes, cf. §2-3 plus bas).
// ============================================================================
export const QUESTIONNAIRE_ITEMS = [
  { key: "sleepQuality", labelKey: "recovery_factor_sleep_quality", direction: "better" },
  { key: "stress", labelKey: "recovery_factor_stress", direction: "worse" },
  { key: "fatigue", labelKey: "recovery_factor_fatigue", direction: "worse" },
  { key: "motivation", labelKey: "recovery_factor_motivation", direction: "better" },
  { key: "musclePain", labelKey: "recovery_factor_muscle_pain", direction: "worse" },
  { key: "jointPain", labelKey: "recovery_factor_joint_pain", direction: "worse" },
  { key: "generalRecovery", labelKey: "recovery_factor_general_recovery", direction: "better" },
];

function itemToScore(rawValue, direction) {
  const clamped = clamp(rawValue, 0, 10);
  return direction === "worse" ? 100 - clamped * 10 : clamped * 10;
}

export function computeQuestionnaireFactors(values, labelResolver) {
  return QUESTIONNAIRE_ITEMS.filter((def) => values[def.key] != null).map((def) => ({
    key: def.key,
    label: labelResolver ? labelResolver(def.labelKey) : def.labelKey,
    score: itemToScore(values[def.key], def.direction),
  }));
}

// ============================================================================
// 2. Durée de sommeil (heures, pas 0-10) — même formule que sleepSubscore
//    dans le Workload Engine (App.jsx) : pénalité à l'écart de 8h idéales.
// ============================================================================
export function sleepDurationScore(hours) {
  if (hours == null) return null;
  return clamp(100 - Math.abs(hours - 8) * 18, 0, 100);
}

// ============================================================================
// 3. Température cutanée (écart en °C vs référence) — même formule que
//    temperatureSubscore dans le Workload Engine.
// ============================================================================
export function temperatureScore(deltaC) {
  if (deltaC == null) return null;
  return softPenaltyScore(Math.abs(deltaC), 0.2, 1.0);
}

// ============================================================================
// 4. Score de récupération combiné (0-100)
// ============================================================================
export const DEFAULT_RECOVERY_WEIGHTS = {
  sleepQuality: 0.14,
  sleepDuration: 0.14,
  stress: 0.14,
  fatigue: 0.16,
  motivation: 0.08,
  musclePain: 0.12,
  jointPain: 0.12,
  generalRecovery: 0.06,
  temperature: 0.04,
};

export function computeRecoveryStatus(questionnaireValues, sleepHours, temperatureDeltaC, weights = DEFAULT_RECOVERY_WEIGHTS, labelResolver) {
  const values = questionnaireValues || {};
  const raw = [
    ...QUESTIONNAIRE_ITEMS.map((def) => ({
      key: def.key,
      label: labelResolver ? labelResolver(def.labelKey) : def.labelKey,
      score: values[def.key] != null ? itemToScore(values[def.key], def.direction) : null,
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
// 5. Recommandation par règles (même forme que les autres moteurs)
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

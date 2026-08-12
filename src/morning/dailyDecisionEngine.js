// ============================================================================
// morning/dailyDecisionEngine.js — BioSync
// ----------------------------------------------------------------------------
// Phase 5 : décide si le test CMJ doit être proposé aujourd'hui — cahier des
// charges §5 : "Le test est proposé automatiquement" pour certains types de
// séance, OU en cas de "suspicion de fatigue neuromusculaire" basée sur la
// combinaison HRV / FC repos / test orthostatique / température / sommeil /
// questionnaires / charge récente / Adaptive Readiness Score.
//
// Logique pure, aucune dépendance UI/caméra — testable avec
// `node morning/dailyDecisionEngine.test.js`. Consomme les SORTIES déjà
// calculées par les autres moteurs (autonomicStatus de hrvEngine.js,
// recoveryStatus de recoveryEngine.js) plutôt que de recalculer quoi que ce
// soit — ce fichier ne fait qu'agréger des décisions déjà prises.
// ============================================================================

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// ============================================================================
// 1. Types de séance déclenchant systématiquement une proposition de CMJ
// ----------------------------------------------------------------------------
// Liste exacte du cahier des charges §5 : force, puissance, sprint,
// pliométrie — toutes des qualités physiques directement informées par la
// hauteur de saut.
// ============================================================================
export const SESSION_TYPES_TRIGGERING_CMJ = ["strength", "power", "sprint", "plyometric"];

// ============================================================================
// 2. Suspicion de fatigue neuromusculaire (score 0-100)
// ----------------------------------------------------------------------------
// Combine l'inverse des statuts déjà calculés (un score de statut BAS = une
// suspicion HAUTE) avec la variation de charge récente. Chaque facteur est
// optionnel — la fonction s'adapte à ce qui est disponible selon le niveau
// de check-in choisi (Rapide : ni autonomicStatus ni charge orthostatique
// détaillée, seulement recoveryStatus).
// ============================================================================
export const NEUROMUSCULAR_SUSPICION_WEIGHTS = {
  autonomicStatus: 0.35,
  recoveryStatus: 0.25,
  loadSpike: 0.25,
  adaptiveReadiness: 0.15,
};

// Une hausse de charge hebdomadaire modérée (< 20%) ne pèse pas ; au-delà,
// le risque de fatigue neuromusculaire non détectée par le seul ressenti
// subjectif augmente progressivement (même philosophie que rationale_spike
// dans le Workload Engine, qui alerte déjà au-delà de 60%).
function loadSpikeSuspicionScore(loadDeltaPercent) {
  if (loadDeltaPercent == null) return null;
  return clamp((loadDeltaPercent - 20) * 2, 0, 100);
}

export function computeNeuromuscularFatigueSuspicion(context = {}, weights = NEUROMUSCULAR_SUSPICION_WEIGHTS) {
  const factors = [];
  if (context.autonomicStatus?.score != null) {
    factors.push({ key: "autonomicStatus", label: "cmj_suspicion_factor_autonomic", suspicion: 100 - context.autonomicStatus.score });
  }
  if (context.recoveryStatus?.score != null) {
    factors.push({ key: "recoveryStatus", label: "cmj_suspicion_factor_recovery", suspicion: 100 - context.recoveryStatus.score });
  }
  const loadSuspicion = loadSpikeSuspicionScore(context.loadDeltaPercent);
  if (loadSuspicion != null) {
    factors.push({ key: "loadSpike", label: "cmj_suspicion_factor_load", suspicion: loadSuspicion });
  }
  if (context.adaptiveReadinessScore != null) {
    factors.push({ key: "adaptiveReadiness", label: "cmj_suspicion_factor_readiness", suspicion: 100 - context.adaptiveReadinessScore });
  }

  if (!factors.length) return null;

  const totalWeight = factors.reduce((s, f) => s + (weights[f.key] ?? 0), 0) || 1;
  const suspicionScore = Math.round(
    factors.reduce((s, f) => s + f.suspicion * ((weights[f.key] ?? 0) / totalWeight), 0)
  );
  return { suspicionScore, factors };
}

// ============================================================================
// 3. Décision finale
// ============================================================================
export const FATIGUE_SUSPICION_THRESHOLD = 40;

export function shouldSuggestCMJTest(context = {}) {
  const sessionTriggered = !!(context.sessionType && SESSION_TYPES_TRIGGERING_CMJ.includes(context.sessionType));
  const suspicion = computeNeuromuscularFatigueSuspicion(context);
  const threshold = context.suspicionThreshold ?? FATIGUE_SUSPICION_THRESHOLD;
  const fatigueTriggered = suspicion != null && suspicion.suspicionScore >= threshold;

  if (sessionTriggered && fatigueTriggered) {
    return { suggested: true, reason: "both", rationaleKey: "cmj_suggest_both", suspicion, sessionType: context.sessionType };
  }
  if (sessionTriggered) {
    return { suggested: true, reason: "session_type", rationaleKey: "cmj_suggest_session_type", suspicion, sessionType: context.sessionType };
  }
  if (fatigueTriggered) {
    return { suggested: true, reason: "fatigue_suspicion", rationaleKey: "cmj_suggest_fatigue_suspicion", suspicion, sessionType: context.sessionType ?? null };
  }
  return { suggested: false, reason: "not_needed", rationaleKey: "cmj_not_suggested", suspicion, sessionType: context.sessionType ?? null };
}

// ============================================================================
// morning/legacyCheckinBridge.js — BioSync
// ----------------------------------------------------------------------------
// Phase 8 : le Tier 1 "Décision" du Dashboard (Workload Engine, App.jsx)
// dépend entièrement du format `checkins` alimenté jusqu'ici par l'ancien
// CheckinForm (vfcNuit, fcRepos, sleepHours, sleepQuality, hooper, nightTemp).
// Plutôt que de réécrire le Workload Engine dans la foulée (risque élevé sur
// une fonctionnalité qui marche déjà), ce pont traduit le résultat du
// NOUVEAU Morning Check-in vers l'ANCIEN format, pour que le Tier 1 continue
// de recevoir des données réelles pendant la transition.
//
// ⚠️ C'est une PASSERELLE DE COMPATIBILITÉ, pas une équivalence exacte :
// les échelles diffèrent (Hooper 4-28 vs questionnaire 0-10 par item), donc
// le "hooper" recalculé ici est une approximation linéaire, documentée
// comme telle. À terme (au-delà de cette Phase 8), le Workload Engine
// pourra être migré pour consommer directement morningCheckinHistory et ce
// fichier sera supprimé.
//
// Logique pure — testable avec `node morning/legacyCheckinBridge.test.js`.
// ============================================================================

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function mapMorningCheckinToLegacyCheckin(fullResult) {
  const report = fullResult?.orthostatic?.report ?? null;
  const questionnaire = fullResult?.questionnaire ?? null;

  const vfcNuit = report?.rmssdLying ?? null;
  const fcRepos = report?.restingHR ?? null;
  const sleepHours = questionnaire?.sleepHours ?? null;
  const nightTemp = questionnaire?.temperatureDeltaC ?? null;

  // Rééchelonnage 0-10 (nouveau) -> 0-5 (ancien) pour la qualité de sommeil.
  const sleepQuality = questionnaire?.sleepQuality != null ? Math.round(clamp(questionnaire.sleepQuality, 0, 10) / 2) : null;

  // Approximation du score Hooper (4-28, plus haut = pire) à partir des
  // items les plus proches du questionnaire (fatigue, stress, douleur
  // musculaire, qualité de sommeil inversée) — combinaison linéaire
  // rééchelonnée, pas une reconstruction fidèle du Hooper original.
  let hooper = null;
  if (questionnaire) {
    const parts = [questionnaire.fatigue, questionnaire.stress, questionnaire.musclePain, questionnaire.sleepQuality != null ? 10 - questionnaire.sleepQuality : null].filter((v) => v != null);
    if (parts.length) {
      const sum = parts.reduce((a, b) => a + b, 0);
      const maxSum = parts.length * 10;
      hooper = Math.round(4 + (sum / maxSum) * 24);
    }
  }

  return {
    vfcNuit,
    vfcMoy: vfcNuit, // pas d'historique de moyenne glissante recalculée ici — même valeur que le jour, comme le fait l'ancien flux au premier check-in
    fcRepos,
    sleepHours,
    sleepQuality,
    hooper,
    nightTemp,
  };
}

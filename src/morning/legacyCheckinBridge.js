// ============================================================================
// morning/legacyCheckinBridge.js — BioSync
// ----------------------------------------------------------------------------
// hooper utilise désormais directement computeHooperScore() (Hooper Index
// réel, 4-28) quand les items Hooper sont présents. Repli sur l'ancienne
// approximation uniquement pour d'éventuels check-ins déjà enregistrés
// avant cette mise à jour (items 0-10 sans les clés hooperX).
// ============================================================================
import { computeHooperScore } from "./recoveryEngine.js";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function mapMorningCheckinToLegacyCheckin(fullResult) {
  const report = fullResult?.orthostatic?.report ?? null;
  const questionnaire = fullResult?.questionnaire ?? null;

  const vfcNuit = report?.rmssdLying ?? null;
  const fcRepos = report?.restingHR ?? null;
  const sleepHours = questionnaire?.sleepHours ?? null;
  const nightTemp = questionnaire?.temperatureDeltaC ?? null;

  const sleepQuality = questionnaire?.hooperSleepQuality != null
    ? Math.round(clamp(8 - questionnaire.hooperSleepQuality, 0, 7) / 1.4) // 1(excellent)->5, 7(très mauvais)->0
    : null;

  let hooper = computeHooperScore(questionnaire);
  if (hooper == null && questionnaire) {
    // Repli pour anciens formats sans items Hooper dédiés.
    const parts = [questionnaire.fatigue, questionnaire.stress, questionnaire.musclePain, questionnaire.sleepQuality != null ? 10 - questionnaire.sleepQuality : null].filter((v) => v != null);
    if (parts.length) {
      const sum = parts.reduce((a, b) => a + b, 0);
      const maxSum = parts.length * 10;
      hooper = Math.round(4 + (sum / maxSum) * 24);
    }
  }

  return { vfcNuit, vfcMoy: vfcNuit, fcRepos, sleepHours, sleepQuality, hooper, nightTemp };
}

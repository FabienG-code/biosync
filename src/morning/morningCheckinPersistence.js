// ============================================================================
// morning/morningCheckinPersistence.js — BioSync
// ----------------------------------------------------------------------------
// + hooperScore (Hooper Index classique 4-28) et measurementSource
// (bluetooth | camera_ppg | null), pour distinguer la technologie utilisée
// dans l'historique (§10/§16 cahier des charges caméra).
// ============================================================================
import { computeMeasurementConfidence } from "./confidenceScore.js";
import { computeHooperScore } from "./recoveryEngine.js";

export function buildMorningCheckinPayload(fullResult) {
  const { tier, orthostatic, questionnaire, cmj, recoveryStatus, recoveryRecommendation, fatigueProfile } = fullResult || {};
  const report = orthostatic?.report ?? null;
  const autonomicStatus = orthostatic?.autonomicStatus ?? null;
  const measurementSource = orthostatic?.measurement?.source ?? null;

  const confidence = computeMeasurementConfidence({
    tier,
    questionnaireComplete: !!questionnaire,
    orthostaticSignalQualityOk: report ? report.signalQuality.ok : null,
    cmjTested: !!cmj,
    cmjQuality: cmj?.result?.testQuality ?? null,
  });

  return {
    tier: tier ?? null,
    measurementSource,
    restingHR: report?.restingHR ?? null,
    standingHR: report?.standingHR ?? null,
    deltaHR: report?.deltaHR ?? null,
    rmssdLying: report?.rmssdLying ?? null,
    rmssdStanding: report?.rmssdStanding ?? null,
    sdnnLying: report?.sdnnLying ?? null,
    sdnnStanding: report?.sdnnStanding ?? null,
    rmssdRatio: report?.rmssdRatio ?? null,
    stabilizationTimeMs: report?.stabilizationTimeMs ?? null,
    orthostaticResponseIndex: report?.orthostaticResponseIndex ?? null,
    sympatheticActivationIndex: report?.sympatheticActivationIndex ?? null,
    parasympatheticRecoveryIndex: report?.parasympatheticRecoveryIndex ?? null,
    heartRateAt1Min: orthostatic?.measurement?.heartRateAt1Min ?? null,
    heartRateAt2Min: orthostatic?.measurement?.heartRateAt2Min ?? null,
    heartRateAt3Min: orthostatic?.measurement?.heartRateAt3Min ?? null,
    signalQualityOk: report?.signalQuality?.ok ?? null,
    autonomicScore: autonomicStatus?.score ?? null,
    autonomicLevel: autonomicStatus?.level ?? null,
    questionnaire: questionnaire
      ? {
          hooperSleepQuality: questionnaire.hooperSleepQuality ?? null,
          hooperFatigue: questionnaire.hooperFatigue ?? null,
          hooperMusclePain: questionnaire.hooperMusclePain ?? null,
          hooperStress: questionnaire.hooperStress ?? null,
          motivation: questionnaire.motivation ?? null,
          jointPain: questionnaire.jointPain ?? null,
          generalRecovery: questionnaire.generalRecovery ?? null,
        }
      : null,
    hooperScore: computeHooperScore(questionnaire),
    sleepHours: questionnaire?.sleepHours ?? null,
    bedtime: questionnaire?.bedtime ?? null,
    temperatureDeltaC: questionnaire?.temperatureDeltaC ?? null,
    recoveryScore: recoveryStatus?.score ?? null,
    recoveryLevel: recoveryStatus?.level ?? null,
    recoveryAction: recoveryRecommendation?.action ?? null,
    cmjTested: !!cmj,
    cmjHeightCm: cmj?.result?.bestHeightCm ?? null,
    cmjQuality: cmj?.result?.testQuality ?? null,
    fatigueProfile: fatigueProfile?.profile ?? null,
    adaptiveReadinessScore: null,
    confidence,
    comments: "",
  };
}

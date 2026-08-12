// ============================================================================
// morning/morningCheckinPersistence.js — BioSync
// ----------------------------------------------------------------------------
// Phase 6 : transforme la sortie de MorningCheckinFlow.onComplete() (objets
// imbriqués : report orthostatique, statut autonome, questionnaire, CMJ...)
// en un payload plat prêt à être envoyé à saveMorningCheckin() côté backend
// — même rôle que buildDailyLoadSeries/computeWorkloadSnapshot pour le
// Workload Engine : une fonction pure entre le moteur et la couche réseau.
//
// Logique pure — testable avec `node morning/morningCheckinPersistence.test.js`.
// ============================================================================
import { computeMeasurementConfidence } from "./confidenceScore.js";

export function buildMorningCheckinPayload(fullResult) {
  const { tier, orthostatic, questionnaire, cmj, recoveryStatus, recoveryRecommendation, fatigueProfile } = fullResult || {};
  const report = orthostatic?.report ?? null;
  const autonomicStatus = orthostatic?.autonomicStatus ?? null;

  const confidence = computeMeasurementConfidence({
    tier,
    questionnaireComplete: !!questionnaire,
    orthostaticSignalQualityOk: report ? report.signalQuality.ok : null,
    cmjTested: !!cmj,
    cmjQuality: cmj?.result?.testQuality ?? null,
  });

  return {
    tier: tier ?? null,
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
    signalQualityOk: report?.signalQuality?.ok ?? null,
    autonomicScore: autonomicStatus?.score ?? null,
    autonomicLevel: autonomicStatus?.level ?? null,
    questionnaire: questionnaire
      ? {
          sleepQuality: questionnaire.sleepQuality ?? null,
          stress: questionnaire.stress ?? null,
          fatigue: questionnaire.fatigue ?? null,
          motivation: questionnaire.motivation ?? null,
          musclePain: questionnaire.musclePain ?? null,
          jointPain: questionnaire.jointPain ?? null,
          generalRecovery: questionnaire.generalRecovery ?? null,
        }
      : null,
    sleepHours: questionnaire?.sleepHours ?? null,
    temperatureDeltaC: questionnaire?.temperatureDeltaC ?? null,
    recoveryScore: recoveryStatus?.score ?? null,
    recoveryLevel: recoveryStatus?.level ?? null,
    recoveryAction: recoveryRecommendation?.action ?? null,
    cmjTested: !!cmj,
    cmjHeightCm: cmj?.result?.bestHeightCm ?? null,
    cmjQuality: cmj?.result?.testQuality ?? null,
    fatigueProfile: fatigueProfile?.profile ?? null,
    adaptiveReadinessScore: null, // branché en Phase 8 (intégration finale au Daily Decision Engine)
    confidence,
    comments: "",
  };
}

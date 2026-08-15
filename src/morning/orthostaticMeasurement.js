// ============================================================================
// morning/orthostaticMeasurement.js — BioSync
// ----------------------------------------------------------------------------
// Modèle de données commun (§3 du cahier des charges), normalisé depuis le
// `report` déjà produit par hrvEngine.computeOrthostaticReport — que la
// source soit Bluetooth ou caméra. Distingue explicitement `source` de la
// valeur mesurée (§10), sans jamais les mélanger silencieusement (§16).
// ============================================================================

export const MEASUREMENT_SOURCE = { BLUETOOTH: "bluetooth", CAMERA_PPG: "camera_ppg" };
export const CAMERA_PPG_ALGORITHM_VERSION = "camera-ppg-v1";
export const BLUETOOTH_ALGORITHM_VERSION = "bluetooth-hrv-v1";

export function buildOrthostaticMeasurement(report, source, extra = {}) {
  if (!report) return null;
  return {
    timestamp: new Date().toISOString(),
    source,
    restingHeartRate: report.restingHR ?? null,
    standingHeartRate: report.standingHR ?? null,
    peakHeartRate: report.standingMaxHR ?? null,
    deltaHeartRate: report.deltaHR ?? null,
    heartRateAt1Min: extra.heartRateAt1Min ?? null,
    heartRateAt2Min: extra.heartRateAt2Min ?? null,
    heartRateAt3Min: extra.heartRateAt3Min ?? null,
    rmssdSupine: report.rmssdLying ?? null,
    rmssdStanding: report.rmssdStanding ?? null,
    signalQuality: extra.signalQualityPercent ?? (report.signalQuality?.ok ? 100 : null),
    validBeats: extra.validBeats ?? null,
    artifactRate: extra.artifactRate ?? null,
    valid: report.signalQuality ? report.signalQuality.ok : true,
    rejectionReason: extra.rejectionReason ?? null,
    algorithmVersion: source === MEASUREMENT_SOURCE.CAMERA_PPG ? CAMERA_PPG_ALGORITHM_VERSION : BLUETOOTH_ALGORITHM_VERSION,
  };
}

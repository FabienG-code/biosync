// ============================================================================
// morning/orthostaticDataSource.js — BioSync
// ----------------------------------------------------------------------------
// Adaptation JS/React du contrat `OrthostaticDataSource` du cahier des
// charges. Le projet étant en React fonctionnel (pas de classes), le
// contrat est respecté PAR CONVENTION DE FORME plutôt que par une interface
// formelle : OrthostaticTestScreen.jsx (Bluetooth) et
// CameraOrthostaticTestScreen.jsx (caméra) produisent chacun le MÊME
// `report` (forme hrvEngine.computeOrthostaticReport) + le même
// `autonomicStatus`/`recommendation`. Le reste du Check-in
// (MorningCheckinFlow, legacyCheckinBridge, MorningReadinessCard...) ne lit
// que cette forme commune et n'a jamais besoin de connaître la source —
// exactement l'abstraction demandée.
// ============================================================================
import { buildOrthostaticMeasurement, MEASUREMENT_SOURCE } from "./orthostaticMeasurement.js";

export function fromBluetoothResult({ report, autonomicStatus, recommendation }) {
  return {
    report, autonomicStatus, recommendation,
    measurement: buildOrthostaticMeasurement(report, MEASUREMENT_SOURCE.BLUETOOTH),
  };
}

export function fromCameraResult({ report, autonomicStatus, recommendation, heartRateMarks, quality }) {
  const marks = Object.fromEntries((heartRateMarks || []).map((m) => [`heartRateAt${m.minute}Min`, m.heartRate]));
  return {
    report, autonomicStatus, recommendation,
    measurement: buildOrthostaticMeasurement(report, MEASUREMENT_SOURCE.CAMERA_PPG, {
      ...marks,
      signalQualityPercent: quality?.level === "good" ? 95 : quality?.level === "acceptable" ? 70 : 30,
      validBeats: quality?.validBeats ?? null,
      artifactRate: quality?.artifactRatio ?? null,
      rejectionReason: quality?.level === "poor" ? "low_signal_quality" : null,
    }),
  };
}

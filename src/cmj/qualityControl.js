// ============================================================================
// cmj/qualityControl.js — BioSync
// ----------------------------------------------------------------------------
// Étape 5 : contrôle qualité d'un essai CMJ, APRÈS la détection du saut
// (jumpDetector.js). Logique pure, sans caméra ni navigateur — testable avec
// `node src/cmj/qualityControl.test.js`.
//
// Consomme les frames produites par poseCapture.js (champs plats
// `${key}X`, `${key}Y`, `${key}Visibility`) et le résultat de
// analyzeJumpAttempt(). Trois contrôles :
//   1. Continuité du suivi   -> "tracking_dropout"          (qualité faible)
//   2. Visibilité du corps   -> "low_landmark_visibility"   (qualité faible)
//   3. Cadrage corps entier  -> "athlete_out_of_frame"      (essai invalidé)
//
// Les clés de raison correspondent aux textes cmj_reason_* de cmjI18n.js.
// ============================================================================

// Points suivis pour le cadrage / la visibilité (convention de poseCapture.js)
export const QC_LANDMARK_KEYS = [
  "nose", "leftShoulder", "rightShoulder", "leftHip", "rightHip",
  "leftKnee", "rightKnee", "leftAnkle", "rightAnkle",
];

export const QC_GAP_THRESHOLD_MS = 200;       // trou > 200 ms entre 2 frames = suivi interrompu
export const QC_WINDOW_MARGIN_MS = 100;       // marge autour du décollage/atterrissage
export const QC_MIN_LANDMARK_VISIBILITY = 0.5;
export const QC_MIN_VISIBLE_FRAME_RATIO = 0.8; // 80 % des frames doivent avoir un corps assez visible
export const QC_FRAME_MARGIN = 0.02;           // un point à < 2 % du bord est considéré hors cadre
export const QC_MAX_OUT_OF_FRAME_RATIO = 0.2;  // > 20 % des frames hors cadre = essai invalidé

// ============================================================================
// 1. Continuité du suivi
// ============================================================================
export function assessContinuity(frames, options = {}) {
  const gapThresholdMs = options.gapThresholdMs ?? QC_GAP_THRESHOLD_MS;
  const ts = (frames || []).map((f) => f.timestampMs).filter(Number.isFinite).sort((a, b) => a - b);
  if (ts.length < 2) return { ok: false, gaps: [], totalGapMs: 0, maxGapMs: 0 };

  const gaps = [];
  let totalGapMs = 0;
  let maxGapMs = 0;
  for (let i = 1; i < ts.length; i++) {
    const delta = ts[i] - ts[i - 1];
    if (delta > gapThresholdMs) {
      gaps.push({ startMs: ts[i - 1], durationMs: delta });
      totalGapMs += delta;
      maxGapMs = Math.max(maxGapMs, delta);
    }
  }
  return { ok: gaps.length === 0, gaps, totalGapMs, maxGapMs };
}

// ============================================================================
// 2. Visibilité des landmarks
// ----------------------------------------------------------------------------
// Pour chaque frame : visibilité moyenne des points clés disponibles. Une
// frame est "bonne" si cette moyenne atteint le seuil.
// ============================================================================
export function frameVisibility(frame) {
  const vis = QC_LANDMARK_KEYS.map((k) => frame[`${k}Visibility`]).filter(Number.isFinite);
  if (!vis.length) return 0;
  return vis.reduce((a, b) => a + b, 0) / vis.length;
}

export function assessLandmarkVisibility(frames, options = {}) {
  const minVisibility = options.minVisibility ?? QC_MIN_LANDMARK_VISIBILITY;
  const minRatio = options.minVisibleFrameRatio ?? QC_MIN_VISIBLE_FRAME_RATIO;
  const list = frames || [];
  if (!list.length) return { ok: false, visibleFrameRatio: 0, meanVisibility: 0 };

  const visibilities = list.map(frameVisibility);
  const goodFrames = visibilities.filter((v) => v >= minVisibility).length;
  const visibleFrameRatio = goodFrames / list.length;
  const meanVisibility = visibilities.reduce((a, b) => a + b, 0) / visibilities.length;
  return { ok: visibleFrameRatio >= minRatio, visibleFrameRatio, meanVisibility };
}

// ============================================================================
// 3. Cadrage corps entier
// ----------------------------------------------------------------------------
// Une frame est "hors cadre" si au moins un point clé (de coordonnées connues)
// sort de la zone [margin, 1 - margin] en X ou en Y.
// ============================================================================
export function isFrameOutOfBounds(frame, margin = QC_FRAME_MARGIN) {
  for (const k of QC_LANDMARK_KEYS) {
    const x = frame[`${k}X`];
    const y = frame[`${k}Y`];
    if (Number.isFinite(x) && (x < margin || x > 1 - margin)) return true;
    if (Number.isFinite(y) && (y < margin || y > 1 - margin)) return true;
  }
  return false;
}

export function assessFraming(frames, options = {}) {
  const margin = options.frameMargin ?? QC_FRAME_MARGIN;
  const maxRatio = options.maxOutOfFrameRatio ?? QC_MAX_OUT_OF_FRAME_RATIO;
  const list = frames || [];
  if (!list.length) return { ok: false, outOfFrameRatio: 1 };

  const outCount = list.filter((f) => isFrameOutOfBounds(f, margin)).length;
  const outOfFrameRatio = outCount / list.length;
  return { ok: outOfFrameRatio <= maxRatio, outOfFrameRatio };
}

// ============================================================================
// 4. Point d'entrée : applique les 3 contrôles à un résultat d'essai
// ----------------------------------------------------------------------------
// result    : sortie de analyzeJumpAttempt() (detected true/false, quality, reason,
//             takeoffTimestamp, landingTimestamp, ...)
// allFrames : toutes les frames capturées pendant l'essai
//
// - Essai non détecté : renvoyé tel quel (rien à contrôler).
// - Hors cadre        : l'essai est invalidé (detected:false) -> l'UI invite à recommencer.
// - Suivi interrompu / visibilité faible : essai conservé mais "low_confidence".
// - Si une raison existait déjà (ex. temps de vol implausible), elle est
//   conservée ; les problèmes détectés ici sont listés dans `qc.issues`.
// ============================================================================
export function applyQualityControl(result, allFrames, options = {}) {
  if (!result || !result.detected) return result;

  const margin = options.windowMarginMs ?? QC_WINDOW_MARGIN_MS;
  const start = (result.takeoffTimestamp ?? -Infinity) - margin;
  const end = (result.landingTimestamp ?? Infinity) + margin;
  const windowFrames = (allFrames || []).filter((f) => f.timestampMs >= start && f.timestampMs <= end);

  const continuity = assessContinuity(windowFrames, options);
  const visibility = assessLandmarkVisibility(windowFrames, options);
  const framing = assessFraming(windowFrames, options);

  const issues = [];
  if (!framing.ok) issues.push("athlete_out_of_frame");
  if (!continuity.ok) issues.push("tracking_dropout");
  if (!visibility.ok) issues.push("low_landmark_visibility");

  const qc = { issues, continuity, visibility, framing };

  if (issues.includes("athlete_out_of_frame")) {
    return { ...result, detected: false, reason: "athlete_out_of_frame", quality: undefined, qc };
  }
  if (issues.length === 0) return { ...result, qc };

  return {
    ...result,
    quality: "low_confidence",
    reason: result.reason || issues[0],
    qc,
  };
}

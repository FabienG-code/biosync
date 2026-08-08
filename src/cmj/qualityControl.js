// ============================================================================
// cmj/qualityControl.js
// ----------------------------------------------------------------------------
// Étape 5 (partie contrôle qualité) : là où jumpDetector.js vérifie la
// PHYSIQUE d'un saut détecté (temps de vol plausible), ce module vérifie la
// FIABILITÉ de la capture elle-même, sur toute la séquence — exactement les
// trois points listés au §6 de l'architecture :
//
//   1. Confiance des landmarks (hanches, genoux, chevilles) au-dessus d'un
//      seuil pendant toute la séquence
//   2. Présence continue dans le cadre (bounding box stable, pas de sortie
//      de champ)
//   3. Continuité du suivi (pas de décrochage prolongé de la détection de
//      pose — ex. l'athlète sort du cadre puis revient)
//
// Logique pure, sans dépendance caméra/UI — testable avec
// `node cmj/qualityControl.test.js`, même esprit que jumpDetector.js.
//
// Ce module ne remplace pas jumpDetector.js : il vient EN PLUS, pour
// dégrader un saut physiquement plausible (temps de vol correct) mais capté
// dans de mauvaises conditions (athlète à moitié hors cadre, tracking
// instable) — voir applyQualityControl() en bas de fichier, qui combine
// les deux verdicts.
// ============================================================================

const round2 = (v) => Math.round(v * 100) / 100;

// Landmarks utilisés pour le cadrage/visibilité — un sous-ensemble du
// squelette complet MediaPipe, suffisant pour estimer une bounding box
// corps entier (nez en haut, épaules/hanches pour la largeur, genoux/
// chevilles en bas) sans avoir à extraire les 33 points.
export const QC_LANDMARK_KEYS = [
  "nose",
  "leftShoulder", "rightShoulder",
  "leftHip", "rightHip",
  "leftKnee", "rightKnee",
  "leftAnkle", "rightAnkle",
];

export const MIN_VISIBILITY = 0.5;
export const FRAME_MARGIN = 0.03; // 3% de marge avant de considérer le corps "coupé" par le cadre
export const MIN_IN_FRAME_RATIO = 0.9; // au moins 90% des frames évaluables doivent être bien cadrées
export const MIN_VISIBLE_LANDMARK_RATIO = 0.8; // au moins 80% des landmarks clés visibles en moyenne
export const MAX_DROPOUT_RATIO = 0.15; // au plus 15% du temps de la fenêtre en décrochage de suivi
export const GAP_THRESHOLD_MS = 150; // un écart entre deux frames au-delà de ça = décrochage (≈ 4-5 frames à 30fps)

// ============================================================================
// 1. Lecture des points d'une frame
// ----------------------------------------------------------------------------
// Format de frame attendu (produit par poseCapture.js) : champs plats
// `${key}X`, `${key}Y`, `${key}Visibility` pour chaque clé de QC_LANDMARK_KEYS
// — même convention que leftAnkleX/leftAnkleY/leftAnkleVisibility déjà
// utilisés par jumpDetector.js pour les chevilles.
// ============================================================================
function getPoint(frame, key) {
  const x = frame[`${key}X`];
  const y = frame[`${key}Y`];
  const visibility = frame[`${key}Visibility`];
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, visibility: Number.isFinite(visibility) ? visibility : 0 };
}

export function computeVisibilityRatio(frame, keys = QC_LANDMARK_KEYS) {
  let visibleCount = 0;
  let total = 0;
  for (const key of keys) {
    const p = getPoint(frame, key);
    if (!p) continue;
    total++;
    if (p.visibility >= MIN_VISIBILITY) visibleCount++;
  }
  if (total === 0) return 0;
  return visibleCount / total;
}

// ============================================================================
// 2. Bounding box corps entier d'une frame
// ----------------------------------------------------------------------------
// Ne considère que les points suffisamment visibles — un point occlus/
// halluciné par le modèle ne doit pas fausser le cadrage détecté.
// ============================================================================
export function computeBoundingBox(frame, keys = QC_LANDMARK_KEYS) {
  const points = keys.map((k) => getPoint(frame, k)).filter((p) => p && p.visibility >= MIN_VISIBILITY);
  if (points.length < 3) return null; // trop peu de points fiables pour un cadrage exploitable
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), pointCount: points.length };
}

export function isFramingOk(bbox, margin = FRAME_MARGIN) {
  if (!bbox) return false;
  return bbox.minX >= margin && bbox.maxX <= 1 - margin && bbox.minY >= margin && bbox.maxY <= 1 - margin;
}

// ============================================================================
// 3. Évaluations sur toute la séquence
// ============================================================================
export function assessVisibility(frames, options = {}) {
  const minRatio = options.minVisibleLandmarkRatio ?? MIN_VISIBLE_LANDMARK_RATIO;
  if (!frames || frames.length === 0) return { ok: false, avgVisibilityRatio: 0 };
  const ratios = frames.map((f) => computeVisibilityRatio(f));
  const avgVisibilityRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return { ok: avgVisibilityRatio >= minRatio, avgVisibilityRatio: round2(avgVisibilityRatio) };
}

export function assessFraming(frames, options = {}) {
  const margin = options.margin ?? FRAME_MARGIN;
  const minRatio = options.minInFrameRatio ?? MIN_IN_FRAME_RATIO;
  let evaluable = 0;
  let inFrame = 0;
  for (const f of frames || []) {
    const bbox = computeBoundingBox(f);
    if (!bbox) continue;
    evaluable++;
    if (isFramingOk(bbox, margin)) inFrame++;
  }
  if (evaluable === 0) return { ok: false, inFrameRatio: null, evaluableFrames: 0 };
  const inFrameRatio = inFrame / evaluable;
  return { ok: inFrameRatio >= minRatio, inFrameRatio: round2(inFrameRatio), evaluableFrames: evaluable };
}

// Détecte les décrochages de suivi via les écarts entre timestamps
// consécutifs plutôt qu'un comptage de frames manquantes : poseCapture.js
// ne pousse que les frames où une personne a été détectée (cf. §4 étape 4),
// donc une période sans détection se traduit par un "trou" dans les
// timestamps — c'est ce trou qu'on mesure ici.
export function assessContinuity(frames, options = {}) {
  const gapThresholdMs = options.gapThresholdMs ?? GAP_THRESHOLD_MS;
  const maxDropoutRatio = options.maxDropoutRatio ?? MAX_DROPOUT_RATIO;
  const sorted = [...(frames || [])].sort((a, b) => a.timestampMs - b.timestampMs);
  if (sorted.length < 2) {
    return { ok: false, dropoutRatio: null, windowMs: null };
  }
  const windowMs = sorted[sorted.length - 1].timestampMs - sorted[0].timestampMs;
  let dropoutMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].timestampMs - sorted[i - 1].timestampMs;
    if (gap > gapThresholdMs) dropoutMs += gap;
  }
  const dropoutRatio = windowMs > 0 ? dropoutMs / windowMs : 1;
  return { ok: dropoutRatio <= maxDropoutRatio, dropoutRatio: round2(dropoutRatio), windowMs };
}

// ============================================================================
// 4. Verdict combiné
// ============================================================================
export function assessSequenceQuality(frames, options = {}) {
  if (!frames || frames.length === 0) {
    return { ok: false, issues: ["no_frames"], continuity: null, visibility: null, framing: null };
  }
  const continuity = assessContinuity(frames, options);
  const visibility = assessVisibility(frames, options);
  const framing = assessFraming(frames, options);

  const issues = [];
  if (!continuity.ok) issues.push("tracking_dropout");
  if (!visibility.ok) issues.push("low_landmark_visibility");
  if (!framing.ok) issues.push("athlete_out_of_frame");

  return { ok: issues.length === 0, issues, continuity, visibility, framing };
}

// ============================================================================
// 5. Combinaison avec le verdict physique de jumpDetector.js
// ----------------------------------------------------------------------------
// Appelée après analyzeJumpAttempt() (jumpDetector.js) sur les MÊMES frames
// (baseline + fenêtre de vol réunies). Un saut physiquement "valid" mais
// capté dans de mauvaises conditions est dégradé en "low_confidence" avec
// la raison la plus parlante pour l'athlète — jamais un échec silencieux,
// cf. §6 de l'architecture.
// ============================================================================
export function applyQualityControl(attemptResult, allFrames, options = {}) {
  const sequenceQuality = assessSequenceQuality(allFrames, options);

  if (!attemptResult || !attemptResult.detected) {
    return { ...attemptResult, sequenceQuality };
  }
  if (attemptResult.quality === "valid" && !sequenceQuality.ok) {
    return {
      ...attemptResult,
      quality: "low_confidence",
      reason: sequenceQuality.issues[0],
      sequenceQuality,
    };
  }
  return { ...attemptResult, sequenceQuality };
}

// ============================================================================
// cmj/jumpDetector.js
// ----------------------------------------------------------------------------
// Étape 4 (partie logique pure) : détecte décollage/atterrissage à partir
// d'un flux de landmarks de pose et calcule la hauteur de saut. Aucune
// dépendance caméra/navigateur — testable avec `node cmj/jumpDetector.test.js`,
// exactement comme cmjEngine.js.
//
// MÉTHODE : temps de vol (flight-time method, Bosco et al. 1983 — la même
// utilisée par des apps de référence comme "My Jump"). On ne mesure PAS un
// déplacement en pixels (ce qui exigerait un étalonnage distance/zoom
// caméra) : on mesure uniquement la DURÉE entre le décollage et
// l'atterrissage, puis on applique la physique du projectile :
//
//     h (m) = g * t² / 8        (t = temps de vol total en secondes)
//
// C'est la raison pour laquelle ce module reste indépendant de la position
// de la caméra, de la distance ou du zoom — seul le temps compte.
//
// PIPELINE :
//   poseCapture.js  -> flux de frames { timestampMs, leftAnkleY, ... }
//   jumpDetector.js -> { heightCm, flightTimeMs, quality }   (ce fichier)
//   cmjEngine.js    -> summarizeJumps() agrège 3 essais (déjà en place)
//
// CONVENTION DE COORDONNÉES : landmarks MediaPipe en coordonnées image
// normalisées [0,1], y croissant vers le BAS. "Monter" = y qui DIMINUE.
// ============================================================================

// ---- Constantes physiques et seuils de détection --------------------------
export const GRAVITY_CM_S2 = 981; // accélération de la pesanteur, en cm/s²

// Plage physiologiquement plausible pour un CMJ (cf. §6 de l'architecture) :
// un temps de vol hors de cette plage indique un faux décollage/atterrissage
// plutôt qu'un vrai saut, et le résultat est marqué "low_confidence".
export const MIN_FLIGHT_TIME_MS = 200; // ~5 cm — en dessous, probablement du bruit
export const MAX_FLIGHT_TIME_MS = 1000; // ~122 cm — au-dessus, probablement une fausse détection

// Seuils de détection du décollage/atterrissage (en unités image normalisées,
// donc indépendants de la résolution de la caméra).
export const TAKEOFF_DISPLACEMENT_THRESHOLD = 0.03; // ~3% de la hauteur de l'image
export const LANDING_TOLERANCE = 0.015;
export const MIN_CONSECUTIVE_FRAMES_AIRBORNE = 3; // anti-rebond : filtre le bruit d'une frame isolée
export const MIN_CONSECUTIVE_FRAMES_LANDED = 2;

// Qualité de la baseline (phase "debout, immobile" avant le saut).
export const MIN_BASELINE_FRAMES = 10;
export const MAX_BASELINE_JITTER = 0.01; // écart-type max toléré sur la baseline

// Confiance minimale MediaPipe pour qu'un landmark soit exploitable.
export const MIN_VISIBILITY = 0.5;

const round1 = (v) => Math.round(v * 10) / 10;

// ============================================================================
// 1. Extraction de la position verticale des chevilles pour une frame
// ----------------------------------------------------------------------------
// Moyenne des deux chevilles quand les deux sont visibles ; sinon la
// cheville visible seule ; sinon null (frame inexploitable, ex. athlète
// hors cadre — cf. contrôle qualité §6 de l'architecture).
// ============================================================================
export function computeAnkleY(frame) {
  const usable = [];
  if (frame.leftAnkleVisibility >= MIN_VISIBILITY && Number.isFinite(frame.leftAnkleY)) usable.push(frame.leftAnkleY);
  if (frame.rightAnkleVisibility >= MIN_VISIBILITY && Number.isFinite(frame.rightAnkleY)) usable.push(frame.rightAnkleY);
  if (!usable.length) return null;
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

// ============================================================================
// 2. Baseline "debout, immobile"
// ----------------------------------------------------------------------------
// Calculée sur les frames de la phase de préparation (avant le signal
// "Saute !" côté UI). Un jitter élevé (athlète qui bouge, landmarks
// instables) invalide la qualité de tout le test — voir §6 de l'architecture,
// même logique que le seuil de confiance des landmarks.
// ============================================================================
export function computeBaseline(frames) {
  const ys = (frames || []).map(computeAnkleY).filter((v) => v != null);
  if (ys.length < MIN_BASELINE_FRAMES) {
    return { mean: null, jitter: null, sampleSize: ys.length, sufficientQuality: false };
  }
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const variance = ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length;
  const jitter = Math.sqrt(variance);
  return { mean, jitter, sampleSize: ys.length, sufficientQuality: jitter <= MAX_BASELINE_JITTER };
}

// ============================================================================
// 3. Physique du temps de vol
// ============================================================================
export function heightFromFlightTimeMs(flightTimeMs) {
  const t = flightTimeMs / 1000;
  return (GRAVITY_CM_S2 * t * t) / 8;
}

// ============================================================================
// 4. Détection d'un saut à partir d'un flux de frames chronologiques
// ----------------------------------------------------------------------------
// `frames` : déjà limité à la fenêtre "essai en cours" (après la baseline).
// Renvoie soit { detected:true, heightCm, flightTimeMs, quality, ... }
// soit { detected:false, reason } — le reason permet à l'UI d'afficher un
// message explicite ("recommence", pas un échec silencieux, cf. §6).
// ============================================================================
export function detectJumpFromFrames(frames, baseline, options = {}) {
  const takeoffThreshold = options.takeoffThreshold ?? TAKEOFF_DISPLACEMENT_THRESHOLD;
  const landingTolerance = options.landingTolerance ?? LANDING_TOLERANCE;
  const minAirborneFrames = options.minConsecutiveFramesAirborne ?? MIN_CONSECUTIVE_FRAMES_AIRBORNE;
  const minLandedFrames = options.minConsecutiveFramesLanded ?? MIN_CONSECUTIVE_FRAMES_LANDED;

  if (!baseline || baseline.mean == null) {
    return { detected: false, reason: "no_baseline" };
  }
  const sorted = [...(frames || [])].sort((a, b) => a.timestampMs - b.timestampMs);
  const series = sorted.map((f) => ({ timestampMs: f.timestampMs, y: computeAnkleY(f) }));

  // ---- Recherche du décollage : N frames consécutives clairement au-dessus
  // du seuil (y qui diminue = monte) ----
  let takeoffIndex = -1;
  let run = 0;
  for (let i = 0; i < series.length; i++) {
    const y = series[i].y;
    const airborne = y != null && baseline.mean - y >= takeoffThreshold;
    if (airborne) {
      run++;
      if (run === minAirborneFrames) {
        takeoffIndex = i - minAirborneFrames + 1; // première frame de la série montante
        break;
      }
    } else {
      run = 0;
    }
  }
  if (takeoffIndex === -1) {
    return { detected: false, reason: "no_liftoff_detected" };
  }

  // ---- Recherche de l'atterrissage : après décollage, N frames consécutives
  // revenues proche de la baseline ----
  let landingIndex = -1;
  run = 0;
  for (let i = takeoffIndex + minAirborneFrames; i < series.length; i++) {
    const y = series[i].y;
    const landed = y != null && Math.abs(y - baseline.mean) <= landingTolerance;
    if (landed) {
      run++;
      if (run === minLandedFrames) {
        landingIndex = i - minLandedFrames + 1; // première frame de retour au sol
        break;
      }
    } else {
      run = 0;
    }
  }
  if (landingIndex === -1) {
    return { detected: false, reason: "no_landing_detected" };
  }

  const takeoffTimestamp = series[takeoffIndex].timestampMs;
  const landingTimestamp = series[landingIndex].timestampMs;
  const flightTimeMs = landingTimestamp - takeoffTimestamp;

  const implausible = flightTimeMs < MIN_FLIGHT_TIME_MS || flightTimeMs > MAX_FLIGHT_TIME_MS;
  const quality = implausible || !baseline.sufficientQuality ? "low_confidence" : "valid";
  const reason = implausible ? "implausible_flight_time" : !baseline.sufficientQuality ? "unstable_baseline" : null;

  return {
    detected: true,
    heightCm: round1(heightFromFlightTimeMs(flightTimeMs)),
    flightTimeMs,
    quality,
    reason,
    takeoffTimestamp,
    landingTimestamp,
  };
}

// ============================================================================
// 5. Point d'entrée pour un essai complet (baseline + phase de saut)
// ----------------------------------------------------------------------------
// Combine les étapes 2-4 pour un seul essai. C'est la fonction que
// CMJTestScreen.jsx appellera pour chaque saut, avec les frames capturées
// par poseCapture.js.
// ============================================================================
export function analyzeJumpAttempt(baselineFrames, jumpFrames, options = {}) {
  const baseline = computeBaseline(baselineFrames);
  const result = detectJumpFromFrames(jumpFrames, baseline, options);
  return { ...result, baseline };
}

// Convertit le résultat d'un essai réussi vers le modèle canonique attendu
// par summarizeJumps (cmjEngine.js). Un essai non détecté est simplement
// omis par l'appelant (l'UI invite à refaire l'essai, pas d'entrée factice).
export function toJumpModel(attemptResult) {
  if (!attemptResult || !attemptResult.detected) return null;
  return {
    heightCm: attemptResult.heightCm,
    flightTimeMs: attemptResult.flightTimeMs,
    quality: attemptResult.quality,
  };
}

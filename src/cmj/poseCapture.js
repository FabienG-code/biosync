// ============================================================================
// cmj/poseCapture.js
// ----------------------------------------------------------------------------
// Étape 4 (partie caméra/navigateur) : accès webcam + pose estimation via
// @mediapipe/tasks-vision. Ce fichier ne fait QUE de la capture — aucune
// logique de décollage/atterrissage ici (ça vit dans jumpDetector.js, pur et
// testable). Séparation volontaire : si l'algorithme de détection change,
// ou si MediaPipe est un jour remplacé par une autre lib de pose estimation,
// un seul des deux fichiers bouge.
//
// ⚠️ Ce fichier utilise des API navigateur (getUserMedia, <video>,
// requestAnimationFrame) et ne peut PAS être testé unitairement en Node —
// contrairement à jumpDetector.js et cmjEngine.js. À vérifier sur un vrai
// appareil (mobile, per les contraintes iOS/Android sur le geste utilisateur
// requis avant d'ouvrir la caméra — voir §7 de l'architecture).
//
// Dépendance : @mediapipe/tasks-vision (npm install @mediapipe/tasks-vision)
// ============================================================================

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// MediaPipe héberge son WASM runtime et ses modèles pré-entraînés sur son
// propre CDN — pas besoin de les committer dans le repo. "lite" est le
// modèle le plus léger (latence mobile prioritaire sur la précision fine,
// suffisant pour suivre la position des chevilles/hanches).
const WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// Indices des landmarks MediaPipe Pose (33 points, BlazePose topology).
// Chevilles : nécessaires à jumpDetector.js (décollage/atterrissage).
// Nez/épaules/hanches/genoux : nécessaires à qualityControl.js (cadrage
// corps entier, cf. étape 5) — ajoutés à l'étape 5, n'affectent pas
// jumpDetector.js qui ne lit que les champs *AnkleY/*AnkleVisibility.
const LANDMARK = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};

let landmarkerInstance = null;
let landmarkerLoadPromise = null;

// ============================================================================
// 1. Chargement du modèle (une seule fois, réutilisé entre les 3 essais)
// ============================================================================
export async function loadPoseLandmarker() {
  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerLoadPromise) return landmarkerLoadPromise;

  landmarkerLoadPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    landmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    return landmarkerInstance;
  })();

  return landmarkerLoadPromise;
}

export function disposePoseLandmarker() {
  if (landmarkerInstance) {
    landmarkerInstance.close();
    landmarkerInstance = null;
    landmarkerLoadPromise = null;
  }
}

// ============================================================================
// 2. Accès caméra
// ----------------------------------------------------------------------------
// L'appel DOIT être déclenché par un geste utilisateur explicite (tap sur
// "Faire le test" côté UI) — getUserMedia est bloqué en arrière-plan sur
// mobile, cf. §7 de l'architecture. Caméra frontale par défaut ("user") :
// l'athlète voit son propre cadrage pendant le test, plus simple pour se
// positionner seul sans aide.
// ============================================================================
export async function startCamera(videoElement, options = {}) {
  const facingMode = options.facingMode ?? "user";
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  videoElement.srcObject = stream;
  await videoElement.play();
  return stream;
}

export function stopCamera(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

// ============================================================================
// 3. Extraction d'une frame de landmarks exploitable par jumpDetector.js
//    ET qualityControl.js
// ----------------------------------------------------------------------------
// Champs plats `${key}X`, `${key}Y`, `${key}Visibility` pour chaque point
// utile (convention partagée avec qualityControl.js, cf. QC_LANDMARK_KEYS).
// Les champs legacy leftAnkleY/leftAnkleVisibility/... (sans X) sont
// conservés à l'identique pour jumpDetector.js, qui n'a jamais eu besoin de
// la composante horizontale — aucune régression sur l'étape 4.
// Renvoie null si aucune personne détectée dans la frame (athlète hors
// cadre), pour laisser les modules avals exclure proprement la frame plutôt
// que de recevoir une valeur inventée.
// ============================================================================
function extractFrame(result, timestampMs) {
  const landmarks = result?.landmarks?.[0];
  if (!landmarks) return null;

  const pt = (idx) => landmarks[idx] || { x: null, y: null, visibility: 0 };
  const nose = pt(LANDMARK.NOSE);
  const ls = pt(LANDMARK.LEFT_SHOULDER), rs = pt(LANDMARK.RIGHT_SHOULDER);
  const lh = pt(LANDMARK.LEFT_HIP), rh = pt(LANDMARK.RIGHT_HIP);
  const lk = pt(LANDMARK.LEFT_KNEE), rk = pt(LANDMARK.RIGHT_KNEE);
  const la = pt(LANDMARK.LEFT_ANKLE), ra = pt(LANDMARK.RIGHT_ANKLE);

  return {
    timestampMs,
    // -- legacy (jumpDetector.js, étape 4) --
    leftAnkleY: la.y ?? null, leftAnkleVisibility: la.visibility ?? 0,
    rightAnkleY: ra.y ?? null, rightAnkleVisibility: ra.visibility ?? 0,
    leftHipY: lh.y ?? null, leftHipVisibility: lh.visibility ?? 0,
    rightHipY: rh.y ?? null, rightHipVisibility: rh.visibility ?? 0,
    // -- cadrage/QC (qualityControl.js, étape 5) --
    noseX: nose.x ?? null, noseY: nose.y ?? null, noseVisibility: nose.visibility ?? 0,
    leftShoulderX: ls.x ?? null, leftShoulderY: ls.y ?? null, leftShoulderVisibility: ls.visibility ?? 0,
    rightShoulderX: rs.x ?? null, rightShoulderY: rs.y ?? null, rightShoulderVisibility: rs.visibility ?? 0,
    leftHipX: lh.x ?? null, rightHipX: rh.x ?? null,
    leftKneeX: lk.x ?? null, leftKneeY: lk.y ?? null, leftKneeVisibility: lk.visibility ?? 0,
    rightKneeX: rk.x ?? null, rightKneeY: rk.y ?? null, rightKneeVisibility: rk.visibility ?? 0,
    leftAnkleX: la.x ?? null, rightAnkleX: ra.x ?? null,
  };
}

// ============================================================================
// 4. Boucle de capture temps réel
// ----------------------------------------------------------------------------
// Démarre une boucle requestAnimationFrame qui détecte la pose à chaque
// frame vidéo et transmet le résultat via onFrame (une frame extraite, ou
// null si personne détectée). Renvoie une fonction `stop()` à appeler pour
// arrêter proprement la boucle (composant démonté, essai terminé...).
// ============================================================================
export function startFrameLoop(videoElement, landmarker, onFrame) {
  let running = true;
  let rafId = null;

  function loop() {
    if (!running) return;
    if (videoElement.readyState >= 2) {
      const timestampMs = performance.now();
      const result = landmarker.detectForVideo(videoElement, timestampMs);
      onFrame(extractFrame(result, timestampMs));
    }
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  return function stop() {
    running = false;
    if (rafId != null) cancelAnimationFrame(rafId);
  };
}

// ============================================================================
// 5. Détection de disponibilité (fallback saisie manuelle)
// ----------------------------------------------------------------------------
// CMJTestScreen.jsx doit pouvoir basculer sur CMJTestForm.jsx (saisie
// manuelle déjà en place depuis l'étape 3) si la caméra n'est pas
// disponible ou si la permission est refusée — jamais d'écran bloqué.
// ============================================================================
export function isCameraSupported() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
}

// ============================================================================
// morning/cameraPpgCapture.js — BioSync
// ----------------------------------------------------------------------------
// Partie NAVIGATEUR de la capture PPG (caméra arrière + flash). Réutilise
// stopCamera() de cmj/poseCapture.js (même logique générique d'arrêt de
// flux) pour éviter un doublon. Aucune logique de détection de pics ici —
// ça vit dans cameraPpgEngine.js, pur et testable.
//
// ⚠️ getUserMedia/torch doivent être déclenchés par un geste utilisateur
// explicite (même contrainte que poseCapture.js côté CMJ, cf. §7 archi CMJ
// et §13 du cahier des charges caméra).
// ============================================================================
import { stopCamera } from "../cmj/poseCapture.js";

export function isCameraPpgSupported() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
}

// Démarre la caméra arrière et tente d'activer le flash en continu (torch).
// Si le flash n'est pas pilotable (iOS Safari selon versions, cf. §14),
// repli documenté : mesure sans flash, avec lumière ambiante forte
// recommandée dans les instructions UI — jamais de blocage silencieux.
export async function startPpgCamera(videoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 320 }, height: { ideal: 240 } },
    audio: false,
  });
  videoElement.srcObject = stream;
  await videoElement.play();

  let torchSupported = false;
  try {
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (capabilities.torch) {
      await track.applyConstraints({ advanced: [{ torch: true }] });
      torchSupported = true;
    }
  } catch (err) {
    torchSupported = false;
  }

  return { stream, torchSupported };
}

export function stopPpgCamera(stream) {
  stopCamera(stream);
}

// Échantillonnage : moyenne du canal rouge sur un carré central de l'image.
// Le doigt doit recouvrir tout le capteur donc toute l'image est
// représentative — se limiter à une petite zone réduit le coût CPU de
// getImageData() à chaque frame (important en boucle requestAnimationFrame).
export function startPpgSampling(videoElement, onSample) {
  const SAMPLE_SIZE = 40;
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let running = true;
  let rafId = null;

  function loop() {
    if (!running) return;
    if (videoElement.readyState >= 2) {
      const vw = videoElement.videoWidth || SAMPLE_SIZE;
      const vh = videoElement.videoHeight || SAMPLE_SIZE;
      const cx = Math.max(0, vw / 2 - SAMPLE_SIZE / 2);
      const cy = Math.max(0, vh / 2 - SAMPLE_SIZE / 2);
      ctx.drawImage(videoElement, cx, cy, SAMPLE_SIZE, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      let sumRed = 0;
      const pixelCount = data.length / 4;
      for (let i = 0; i < data.length; i += 4) sumRed += data[i];
      onSample({ timestampMs: performance.now(), red: sumRed / pixelCount });
    }
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  return function stop() {
    running = false;
    if (rafId != null) cancelAnimationFrame(rafId);
  };
}

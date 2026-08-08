// ============================================================================
// cmj/jumpDetector.test.js — exécuter avec : node cmj/jumpDetector.test.js
// Génère des trajectoires de landmarks SYNTHÉTIQUES pour simuler un saut sans
// caméra ni navigateur — même esprit que cmjEngine.test.js.
// ============================================================================
import assert from "node:assert/strict";
import {
  computeAnkleY,
  computeBaseline,
  heightFromFlightTimeMs,
  detectJumpFromFrames,
  analyzeJumpAttempt,
  toJumpModel,
  MIN_BASELINE_FRAMES,
} from "./jumpDetector.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  — ${name}`);
  } catch (err) {
    console.error(`FAIL  — ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log("jumpDetector — tests\n");

// ---- Générateurs de frames synthétiques ------------------------------------
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const BASELINE_Y = 0.7; // position "debout" typique des chevilles dans l'image

function standingFrame(timestampMs, y = BASELINE_Y, jitter = 0) {
  const noise = jitter ? (Math.sin(timestampMs) * jitter) : 0;
  return {
    timestampMs,
    leftAnkleY: y + noise, leftAnkleVisibility: 0.95,
    rightAnkleY: y + noise, rightAnkleVisibility: 0.95,
  };
}

// Construit un flux complet : phase debout -> décollage net -> vol -> atterrissage -> phase debout.
function buildJumpStream({ flightTimeMs, standingFramesCount = 15, peakDisplacement = 0.15, startMs = 0 }) {
  const frames = [];
  let t = startMs;

  // Phase debout (baseline)
  for (let i = 0; i < standingFramesCount; i++) {
    frames.push(standingFrame(t));
    t += FRAME_MS;
  }
  const flightStart = t;

  // Phase de vol : profil qui monte franchement au-dessus du seuil de
  // décollage dès la première frame de vol (le détecteur cherche un
  // franchissement net, pas une parabole réaliste image par image).
  const flightFrameCount = Math.max(4, Math.round(flightTimeMs / FRAME_MS));
  for (let i = 0; i < flightFrameCount; i++) {
    // profil en cloche simple : monte, reste en l'air, redescend
    const progress = i / (flightFrameCount - 1); // 0..1
    const shape = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
    const y = BASELINE_Y - peakDisplacement * Math.max(shape, 0.6); // toujours nettement au-dessus du seuil pendant le vol
    frames.push({ timestampMs: t, leftAnkleY: y, leftAnkleVisibility: 0.95, rightAnkleY: y, rightAnkleVisibility: 0.95 });
    t += FRAME_MS;
  }
  const flightEnd = t - FRAME_MS;
  // Le détecteur définit l'atterrissage comme le retour EFFECTIF à la
  // baseline, c'est-à-dire la première frame *après* la dernière frame de
  // vol (le générateur ci-dessus enchaîne directement vol -> debout, sans
  // frame de transition). C'est donc `t` (début de la phase debout
  // suivante), pas `flightEnd` (dernière frame encore en l'air), qui
  // correspond au temps de vol tel que le détecteur le mesurera.
  const detectorFlightTimeMs = t - flightStart;

  // Phase debout après atterrissage
  for (let i = 0; i < 10; i++) {
    frames.push(standingFrame(t));
    t += FRAME_MS;
  }

  return { frames, flightStart, flightEnd, actualFlightTimeMs: detectorFlightTimeMs };
}

// ---- computeAnkleY ----------------------------------------------------------
test("computeAnkleY: moyenne des deux chevilles si les deux sont visibles", () => {
  const y = computeAnkleY({ leftAnkleY: 0.6, leftAnkleVisibility: 0.9, rightAnkleY: 0.8, rightAnkleVisibility: 0.9 });
  assert.equal(y, 0.7);
});

test("computeAnkleY: ne garde que la cheville visible si l'autre est masquée", () => {
  const y = computeAnkleY({ leftAnkleY: 0.6, leftAnkleVisibility: 0.9, rightAnkleY: 0.99, rightAnkleVisibility: 0.1 });
  assert.equal(y, 0.6);
});

test("computeAnkleY: aucune cheville visible -> null", () => {
  const y = computeAnkleY({ leftAnkleY: 0.6, leftAnkleVisibility: 0.1, rightAnkleY: 0.6, rightAnkleVisibility: 0.1 });
  assert.equal(y, null);
});

// ---- computeBaseline ---------------------------------------------------------
test("computeBaseline: historique insuffisant -> sufficientQuality=false", () => {
  const frames = Array.from({ length: MIN_BASELINE_FRAMES - 1 }, (_, i) => standingFrame(i * FRAME_MS));
  const b = computeBaseline(frames);
  assert.equal(b.sufficientQuality, false);
});

test("computeBaseline: athlète parfaitement immobile -> jitter ~0, qualité suffisante", () => {
  const frames = Array.from({ length: 20 }, (_, i) => standingFrame(i * FRAME_MS));
  const b = computeBaseline(frames);
  assert.ok(b.jitter < 1e-9);
  assert.equal(b.sufficientQuality, true);
  assert.ok(Math.abs(b.mean - BASELINE_Y) < 1e-9);
});

test("computeBaseline: athlète instable (jitter élevé) -> sufficientQuality=false", () => {
  const frames = Array.from({ length: 20 }, (_, i) => standingFrame(i * FRAME_MS, BASELINE_Y, 0.05));
  const b = computeBaseline(frames);
  assert.equal(b.sufficientQuality, false);
});

// ---- heightFromFlightTimeMs (physique) --------------------------------------
test("heightFromFlightTimeMs: formule du temps de vol correcte (Bosco 1983)", () => {
  // h = g*t²/8 ; pour t=0.5s, g=981 cm/s² -> h = 981*0.25/8 = 30.65625 cm
  const h = heightFromFlightTimeMs(500);
  assert.ok(Math.abs(h - 30.65625) < 1e-6);
});

test("heightFromFlightTimeMs: un temps de vol plus long donne un saut plus haut", () => {
  assert.ok(heightFromFlightTimeMs(600) > heightFromFlightTimeMs(400));
});

// ---- detectJumpFromFrames / analyzeJumpAttempt ------------------------------
test("analyzeJumpAttempt: saut net correctement détecté avec la bonne hauteur estimée", () => {
  const { frames, actualFlightTimeMs } = buildJumpStream({ flightTimeMs: 500 });
  const baselineFrames = frames.slice(0, 15);
  const jumpFrames = frames.slice(10); // chevauchement volontaire, le détecteur doit s'y retrouver
  const result = analyzeJumpAttempt(baselineFrames, jumpFrames);

  assert.equal(result.detected, true);
  assert.equal(result.quality, "valid");
  // tolérance d'une frame (~33ms) sur le temps de vol détecté vs réel
  assert.ok(Math.abs(result.flightTimeMs - actualFlightTimeMs) <= FRAME_MS * 2);
  const expectedHeight = heightFromFlightTimeMs(actualFlightTimeMs);
  assert.ok(Math.abs(result.heightCm - expectedHeight) < 3); // tolérance raisonnable
});

test("analyzeJumpAttempt: pas de mouvement -> no_liftoff_detected", () => {
  const frames = Array.from({ length: 40 }, (_, i) => standingFrame(i * FRAME_MS));
  const result = analyzeJumpAttempt(frames.slice(0, 15), frames.slice(10));
  assert.equal(result.detected, false);
  assert.equal(result.reason, "no_liftoff_detected");
});

test("analyzeJumpAttempt: décollage franc mais pas de retour au sol -> no_landing_detected", () => {
  const { frames } = buildJumpStream({ flightTimeMs: 500 });
  // tronque juste après le décollage, avant le retour à la baseline
  const baselineFrames = frames.slice(0, 15);
  const truncated = frames.slice(10, 22);
  const result = analyzeJumpAttempt(baselineFrames, truncated);
  assert.equal(result.detected, false);
  assert.equal(result.reason, "no_landing_detected");
});

test("analyzeJumpAttempt: pas de baseline exploitable -> no_baseline", () => {
  const { frames } = buildJumpStream({ flightTimeMs: 500 });
  const result = analyzeJumpAttempt([], frames.slice(10));
  assert.equal(result.detected, false);
  assert.equal(result.reason, "no_baseline");
});

test("analyzeJumpAttempt: temps de vol implausible (trop long) -> quality=low_confidence", () => {
  const { frames } = buildJumpStream({ flightTimeMs: 1500 }); // > MAX_FLIGHT_TIME_MS
  const baselineFrames = frames.slice(0, 15);
  const result = analyzeJumpAttempt(baselineFrames, frames.slice(10));
  assert.equal(result.detected, true);
  assert.equal(result.quality, "low_confidence");
  assert.equal(result.reason, "implausible_flight_time");
});

test("analyzeJumpAttempt: temps de vol implausible (trop court, bruit) -> quality=low_confidence", () => {
  const { frames } = buildJumpStream({ flightTimeMs: 100 }); // < MIN_FLIGHT_TIME_MS
  const baselineFrames = frames.slice(0, 15);
  const result = analyzeJumpAttempt(baselineFrames, frames.slice(10));
  assert.equal(result.detected, true);
  assert.equal(result.quality, "low_confidence");
  assert.equal(result.reason, "implausible_flight_time");
});

test("analyzeJumpAttempt: baseline instable -> saut détecté mais quality=low_confidence", () => {
  const { frames } = buildJumpStream({ flightTimeMs: 500 });
  // remplace la phase debout par une phase bruitée
  const noisyBaseline = Array.from({ length: 15 }, (_, i) => standingFrame(i * FRAME_MS, BASELINE_Y, 0.05));
  const result = analyzeJumpAttempt(noisyBaseline, frames.slice(10));
  assert.equal(result.detected, true);
  assert.equal(result.quality, "low_confidence");
  assert.equal(result.reason, "unstable_baseline");
});

test("analyzeJumpAttempt: frames désordonnées dans le temps -> re-triées avant analyse", () => {
  const { frames, actualFlightTimeMs } = buildJumpStream({ flightTimeMs: 500 });
  const shuffled = [...frames.slice(10)].sort(() => Math.random() - 0.5);
  const result = analyzeJumpAttempt(frames.slice(0, 15), shuffled);
  assert.equal(result.detected, true);
  assert.ok(Math.abs(result.flightTimeMs - actualFlightTimeMs) <= FRAME_MS * 2);
});

// ---- toJumpModel --------------------------------------------------------------
test("toJumpModel: essai détecté -> modèle canonique {heightCm, flightTimeMs, quality}", () => {
  const { frames } = buildJumpStream({ flightTimeMs: 500 });
  const result = analyzeJumpAttempt(frames.slice(0, 15), frames.slice(10));
  const model = toJumpModel(result);
  assert.ok(Number.isFinite(model.heightCm));
  assert.ok(Number.isFinite(model.flightTimeMs));
  assert.equal(model.quality, "valid");
  assert.equal(Object.keys(model).length, 3); // exactement la forme attendue par summarizeJumps
});

test("toJumpModel: essai non détecté -> null", () => {
  assert.equal(toJumpModel({ detected: false, reason: "no_liftoff_detected" }), null);
  assert.equal(toJumpModel(null), null);
});

console.log(`\n${passed} test(s) passed.`);

// ============================================================================
// cmj/qualityControl.test.js — exécuter avec : node cmj/qualityControl.test.js
// ============================================================================
import assert from "node:assert/strict";
import {
  computeVisibilityRatio,
  computeBoundingBox,
  isFramingOk,
  assessVisibility,
  assessFraming,
  assessContinuity,
  assessSequenceQuality,
  applyQualityControl,
  QC_LANDMARK_KEYS,
} from "./qualityControl.js";

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

console.log("qualityControl — tests\n");

// ---- Générateur de frame "corps entier" bien cadrée -------------------------
function wellFramedFrame(timestampMs, options = {}) {
  const vis = options.visibility ?? 0.9;
  const xOffset = options.xOffset ?? 0; // pour simuler un déplacement horizontal (sortie de cadre)
  return {
    timestampMs,
    noseX: 0.5 + xOffset, noseY: 0.12, noseVisibility: vis,
    leftShoulderX: 0.42 + xOffset, leftShoulderY: 0.25, leftShoulderVisibility: vis,
    rightShoulderX: 0.58 + xOffset, rightShoulderY: 0.25, rightShoulderVisibility: vis,
    leftHipX: 0.44 + xOffset, leftHipY: 0.55, leftHipVisibility: vis,
    rightHipX: 0.56 + xOffset, rightHipY: 0.55, rightHipVisibility: vis,
    leftKneeX: 0.44 + xOffset, leftKneeY: 0.75, leftKneeVisibility: vis,
    rightKneeX: 0.56 + xOffset, rightKneeY: 0.75, rightKneeVisibility: vis,
    leftAnkleX: 0.44 + xOffset, leftAnkleY: 0.95, leftAnkleVisibility: vis,
    rightAnkleX: 0.56 + xOffset, rightAnkleY: 0.95, rightAnkleVisibility: vis,
  };
}

function buildSequence(count, fps = 30, frameFn = wellFramedFrame) {
  const frameMs = 1000 / fps;
  return Array.from({ length: count }, (_, i) => frameFn(i * frameMs));
}

// ---- computeVisibilityRatio --------------------------------------------------
test("computeVisibilityRatio: tous les landmarks bien visibles -> 1", () => {
  const ratio = computeVisibilityRatio(wellFramedFrame(0));
  assert.equal(ratio, 1);
});

test("computeVisibilityRatio: landmarks partiellement occlus -> ratio réduit", () => {
  const frame = wellFramedFrame(0);
  frame.leftKneeVisibility = 0.1;
  frame.rightKneeVisibility = 0.1;
  const ratio = computeVisibilityRatio(frame);
  assert.ok(ratio < 1 && ratio > 0);
});

// ---- computeBoundingBox / isFramingOk ----------------------------------------
test("computeBoundingBox: étendue correcte à partir des points visibles", () => {
  const bbox = computeBoundingBox(wellFramedFrame(0));
  assert.ok(Math.abs(bbox.minY - 0.12) < 1e-9);
  assert.ok(Math.abs(bbox.maxY - 0.95) < 1e-9);
  assert.ok(bbox.minX < bbox.maxX);
});

test("computeBoundingBox: moins de 3 points fiables -> null", () => {
  const frame = wellFramedFrame(0);
  QC_LANDMARK_KEYS.forEach((k) => { frame[`${k}Visibility`] = 0.1; });
  assert.equal(computeBoundingBox(frame), null);
});

test("isFramingOk: bien cadré -> true", () => {
  assert.equal(isFramingOk(computeBoundingBox(wellFramedFrame(0))), true);
});

test("isFramingOk: athlète décalé hors cadre (x proche du bord) -> false", () => {
  const frame = wellFramedFrame(0, { xOffset: 0.45 }); // pousse maxX au-delà de 0.97
  assert.equal(isFramingOk(computeBoundingBox(frame)), false);
});

test("isFramingOk: pas de bbox -> false", () => {
  assert.equal(isFramingOk(null), false);
});

// ---- assessVisibility ----------------------------------------------------------
test("assessVisibility: séquence bien visible -> ok=true", () => {
  const frames = buildSequence(20);
  assert.equal(assessVisibility(frames).ok, true);
});

test("assessVisibility: visibilité dégradée sur toute la séquence -> ok=false", () => {
  const frames = buildSequence(20, 30, (t) => wellFramedFrame(t, { visibility: 0.2 }));
  assert.equal(assessVisibility(frames).ok, false);
});

test("assessVisibility: aucune frame -> ok=false", () => {
  assert.equal(assessVisibility([]).ok, false);
});

// ---- assessFraming --------------------------------------------------------------
test("assessFraming: séquence entièrement bien cadrée -> ok=true", () => {
  const frames = buildSequence(20);
  const r = assessFraming(frames);
  assert.equal(r.ok, true);
  assert.equal(r.inFrameRatio, 1);
});

test("assessFraming: athlète sort du cadre sur une bonne partie de la séquence -> ok=false", () => {
  const frames = [
    ...buildSequence(10), // bien cadré
    ...buildSequence(15, 30, (t) => wellFramedFrame(t, { xOffset: 0.45 })), // sort du cadre
  ];
  const r = assessFraming(frames);
  assert.equal(r.ok, false);
  assert.ok(r.inFrameRatio < 0.9);
});

test("assessFraming: une brève sortie de cadre isolée ne fait pas échouer le ratio global", () => {
  const frames = [
    ...buildSequence(30), // largement bien cadré
    wellFramedFrame(31 * 33, { xOffset: 0.45 }), // 1 frame isolée hors cadre
  ];
  const r = assessFraming(frames);
  assert.equal(r.ok, true);
});

// ---- assessContinuity ------------------------------------------------------------
test("assessContinuity: frames régulières sans trou -> ok=true", () => {
  const frames = buildSequence(30); // ~33ms d'écart, aucun trou
  const r = assessContinuity(frames);
  assert.equal(r.ok, true);
});

test("assessContinuity: un décrochage prolongé -> ok=false", () => {
  const frames = [
    ...buildSequence(15),
    wellFramedFrame(15 * 33 + 1200), // trou de 1.2s = décrochage de tracking
    ...buildSequence(5).map((f) => ({ ...f, timestampMs: f.timestampMs + 15 * 33 + 1200 })),
  ];
  const r = assessContinuity(frames);
  assert.equal(r.ok, false);
});

test("assessContinuity: moins de 2 frames -> ok=false", () => {
  assert.equal(assessContinuity([wellFramedFrame(0)]).ok, false);
  assert.equal(assessContinuity([]).ok, false);
});

// ---- assessSequenceQuality (verdict combiné) -------------------------------------
test("assessSequenceQuality: séquence propre -> ok=true, aucun problème", () => {
  const frames = buildSequence(30);
  const r = assessSequenceQuality(frames);
  assert.equal(r.ok, true);
  assert.deepEqual(r.issues, []);
});

test("assessSequenceQuality: aucune frame -> ok=false, issue no_frames", () => {
  const r = assessSequenceQuality([]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues, ["no_frames"]);
});

test("assessSequenceQuality: cumule plusieurs problèmes à la fois", () => {
  const frames = buildSequence(20, 30, (t) => wellFramedFrame(t, { visibility: 0.2, xOffset: 0.45 }));
  const r = assessSequenceQuality(frames);
  assert.equal(r.ok, false);
  assert.ok(r.issues.includes("low_landmark_visibility"));
  assert.ok(r.issues.includes("athlete_out_of_frame"));
});

// ---- applyQualityControl (combinaison avec jumpDetector) -------------------------
test("applyQualityControl: saut non détecté -> inchangé, sequenceQuality ajoutée en info", () => {
  const attemptResult = { detected: false, reason: "no_liftoff_detected" };
  const r = applyQualityControl(attemptResult, buildSequence(20));
  assert.equal(r.detected, false);
  assert.equal(r.reason, "no_liftoff_detected"); // pas modifié
  assert.ok(r.sequenceQuality.ok);
});

test("applyQualityControl: saut 'valid' + séquence propre -> reste 'valid'", () => {
  const attemptResult = { detected: true, quality: "valid", heightCm: 35, flightTimeMs: 500, reason: null };
  const r = applyQualityControl(attemptResult, buildSequence(30));
  assert.equal(r.quality, "valid");
});

test("applyQualityControl: saut 'valid' physiquement mais athlète hors cadre -> dégradé en low_confidence", () => {
  const attemptResult = { detected: true, quality: "valid", heightCm: 35, flightTimeMs: 500, reason: null };
  const badFrames = buildSequence(20, 30, (t) => wellFramedFrame(t, { xOffset: 0.45 }));
  const r = applyQualityControl(attemptResult, badFrames);
  assert.equal(r.quality, "low_confidence");
  assert.equal(r.reason, "athlete_out_of_frame");
  assert.equal(r.sequenceQuality.ok, false);
});

test("applyQualityControl: saut déjà 'low_confidence' (temps de vol implausible) -> raison physique conservée si la séquence est propre", () => {
  const attemptResult = { detected: true, quality: "low_confidence", heightCm: 90, flightTimeMs: 1500, reason: "implausible_flight_time" };
  const r = applyQualityControl(attemptResult, buildSequence(30));
  assert.equal(r.quality, "low_confidence");
  assert.equal(r.reason, "implausible_flight_time"); // pas écrasée par la QC puisque déjà low_confidence
});

console.log(`\n${passed} test(s) passed.`);

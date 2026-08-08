// ============================================================================
// cmj/cmjEngine.test.js — exécuter avec : node cmj/cmjEngine.test.js
// Aucune dépendance (pas de Vitest/Jest) : Node "assert" suffit, pour rester
// runnable directement depuis mobile via l'environnement GitHub/Codespaces
// sans étape npm install préalable.
// ============================================================================
import assert from "node:assert/strict";
import {
  summarizeJumps,
  computeCMJBaselineStats,
  cmjHeightSubscore,
  computeCMJVariationPercent,
  computeRollingAverage,
  computeCMJTrend,
  CMJ_TREND,
  computeNeuromuscularStatus,
  generateNeuromuscularRecommendation,
  computeCMJReport,
} from "./cmjEngine.js";

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

console.log("cmjEngine — tests\n");

// ---- summarizeJumps ------------------------------------------------------
test("summarizeJumps: 3 sauts valides -> best/avg corrects, qualité good", () => {
  const r = summarizeJumps([
    { heightCm: 34.2, flightTimeMs: 527, quality: "valid" },
    { heightCm: 35.8, flightTimeMs: 539, quality: "valid" },
    { heightCm: 33.1, flightTimeMs: 519, quality: "valid" },
  ]);
  assert.equal(r.bestHeightCm, 35.8);
  assert.equal(r.avgHeightCm, 34.4);
  assert.equal(r.testQuality, "good");
  assert.equal(r.validCount, 3);
});

test("summarizeJumps: exclut les sauts low_confidence du calcul", () => {
  const r = summarizeJumps([
    { heightCm: 34.2, quality: "valid" },
    { heightCm: 35.8, quality: "valid" },
    { heightCm: 50, quality: "low_confidence" }, // ne doit pas influencer le meilleur
  ]);
  assert.equal(r.bestHeightCm, 35.8);
  assert.equal(r.validCount, 2);
  assert.equal(r.testQuality, "acceptable");
});

test("summarizeJumps: aucun saut valide -> testQuality poor, valeurs null", () => {
  const r = summarizeJumps([{ heightCm: 10, quality: "low_confidence" }]);
  assert.equal(r.bestHeightCm, null);
  assert.equal(r.avgHeightCm, null);
  assert.equal(r.testQuality, "poor");
});

test("summarizeJumps: entrée vide/undefined ne plante pas", () => {
  assert.equal(summarizeJumps([]).testQuality, "poor");
  assert.equal(summarizeJumps(undefined).testQuality, "poor");
});

// ---- computeCMJBaselineStats ---------------------------------------------
function buildHistory(startDate, values) {
  const h = {};
  values.forEach((v, i) => {
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    if (v != null) h[key] = { bestHeightCm: v };
  });
  return h;
}

test("computeCMJBaselineStats: historique insuffisant -> sufficient=false", () => {
  const history = buildHistory("2026-07-01", [35, 34, 36]); // 3 points < min 5
  const stats = computeCMJBaselineStats(history, "2026-07-10");
  assert.equal(stats.sufficient, false);
  assert.equal(stats.individualMean, null);
});

test("computeCMJBaselineStats: historique suffisant -> mean/sd corrects, exclut le jour même", () => {
  const values = [34, 35, 36, 35, 34, 35, 36]; // 7 points
  const history = buildHistory("2026-07-01", values);
  // ajoute une valeur aberrante pour AUJOURD'HUI qui ne doit pas polluer la baseline
  history["2026-07-08"] = { bestHeightCm: 10 };
  const stats = computeCMJBaselineStats(history, "2026-07-08");
  assert.equal(stats.sufficient, true);
  assert.equal(stats.sampleSize, 7);
  const expectedMean = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(Math.abs(stats.individualMean - expectedMean) < 1e-9);
});

// ---- cmjHeightSubscore -----------------------------------------------------
test("cmjHeightSubscore: baseline insuffisante -> 70 (neutre-favorable)", () => {
  const score = cmjHeightSubscore(35, { sufficient: false });
  assert.equal(score, 70);
});

test("cmjHeightSubscore: valeur du jour == moyenne individuelle -> 50 (neutre, pas 100)", () => {
  const stats = { sufficient: true, individualMean: 35, individualSd: 1.5 };
  const score = cmjHeightSubscore(35, stats);
  assert.equal(score, 50);
});

test("cmjHeightSubscore: valeur du jour au-dessus de la moyenne -> score > 50", () => {
  const stats = { sufficient: true, individualMean: 35, individualSd: 1.5 };
  const score = cmjHeightSubscore(37, stats); // +1.33 SD environ
  assert.ok(score > 50 && score <= 100);
});

test("cmjHeightSubscore: baisse marquée -> score < 50", () => {
  const stats = { sufficient: true, individualMean: 35, individualSd: 1.5 };
  const score = cmjHeightSubscore(31, stats); // -2.67 SD environ
  assert.ok(score < 50);
});

test("cmjHeightSubscore: pas de valeur du jour -> null", () => {
  const stats = { sufficient: true, individualMean: 35, individualSd: 1.5 };
  assert.equal(cmjHeightSubscore(null, stats), null);
});

// ---- computeCMJVariationPercent -------------------------------------------
test("computeCMJVariationPercent: calcul correct", () => {
  const stats = { sufficient: true, individualMean: 35, individualSd: 1 };
  const pct = computeCMJVariationPercent(31.5, stats);
  assert.equal(pct, -10);
});

test("computeCMJVariationPercent: baseline insuffisante -> null", () => {
  assert.equal(computeCMJVariationPercent(35, { sufficient: false }), null);
});

// ---- computeRollingAverage --------------------------------------------------
test("computeRollingAverage: ignore les jours sans test (pas de zéro-remplissage)", () => {
  const history = {
    "2026-07-01": { bestHeightCm: 34 },
    "2026-07-03": { bestHeightCm: 36 },
    // 07-02 et le reste : pas de test
  };
  const avg = computeRollingAverage(history, "2026-07-03", 7);
  assert.equal(avg, 35); // (34+36)/2, pas /7
});

test("computeRollingAverage: aucune donnée -> null", () => {
  assert.equal(computeRollingAverage({}, "2026-07-03", 7), null);
});

// ---- computeCMJTrend ---------------------------------------------------------
test("computeCMJTrend: moins de 6 points -> insufficient", () => {
  const history = buildHistory("2026-07-01", [34, 35, 36]);
  const trend = computeCMJTrend(history, "2026-07-10", 30);
  assert.equal(trend.trend, CMJ_TREND.INSUFFICIENT);
});

test("computeCMJTrend: série clairement croissante -> up", () => {
  const values = [30, 31, 32, 33, 34, 35, 36, 37];
  const history = buildHistory("2026-07-01", values);
  const trend = computeCMJTrend(history, "2026-07-08", 30);
  assert.equal(trend.trend, CMJ_TREND.UP);
  assert.ok(trend.slopePercentPerWeek > 0);
});

test("computeCMJTrend: série clairement décroissante -> down", () => {
  const values = [37, 36, 35, 34, 33, 32, 31, 30];
  const history = buildHistory("2026-07-01", values);
  const trend = computeCMJTrend(history, "2026-07-08", 30);
  assert.equal(trend.trend, CMJ_TREND.DOWN);
  assert.ok(trend.slopePercentPerWeek < 0);
});

test("computeCMJTrend: série stable -> stable", () => {
  const values = [35, 35.1, 34.9, 35, 35.2, 34.8, 35];
  const history = buildHistory("2026-07-01", values);
  const trend = computeCMJTrend(history, "2026-07-07", 30);
  assert.equal(trend.trend, CMJ_TREND.STABLE);
});

// ---- computeNeuromuscularStatus ---------------------------------------------
test("computeNeuromuscularStatus: aucun facteur disponible -> null", () => {
  assert.equal(computeNeuromuscularStatus({}), null);
});

test("computeNeuromuscularStatus: un seul facteur (cmj) -> score == ce facteur, poids redistribué", () => {
  const status = computeNeuromuscularStatus({ cmjHeightScore: 42 });
  assert.equal(status.score, 42);
  const cmjSub = status.subscores.find((s) => s.key === "cmj");
  assert.equal(cmjSub.weight, 1); // tout le poids reporté sur le seul facteur dispo
});

test("computeNeuromuscularStatus: facteurs manquants marqués available=false avec score neutre 70", () => {
  const status = computeNeuromuscularStatus({ cmjHeightScore: 80 });
  const hrvSub = status.subscores.find((s) => s.key === "hrv");
  assert.equal(hrvSub.available, false);
  assert.equal(hrvSub.score, 70);
  assert.equal(hrvSub.weight, 0);
});

test("computeNeuromuscularStatus: multi-facteurs -> score pondéré cohérent", () => {
  const status = computeNeuromuscularStatus({
    cmjHeightScore: 90,
    hrv: { today: 65, individualMean: 65, individualSd: 5 }, // ~50
    sleepHours: 8, // 100
  });
  assert.ok(status.score > 50 && status.score <= 100);
  const total = status.subscores.reduce((s, x) => s + x.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9); // les poids disponibles somment à 1
});

test("computeNeuromuscularStatus: niveaux corrects selon les seuils de score", () => {
  assert.equal(computeNeuromuscularStatus({ cmjHeightScore: 90 }).level, "optimal");
  assert.equal(computeNeuromuscularStatus({ cmjHeightScore: 70 }).level, "good");
  assert.equal(computeNeuromuscularStatus({ cmjHeightScore: 55 }).level, "to_monitor");
  assert.equal(computeNeuromuscularStatus({ cmjHeightScore: 40 }).level, "probable_fatigue");
  assert.equal(computeNeuromuscularStatus({ cmjHeightScore: 10 }).level, "significant_fatigue");
});

// ---- generateNeuromuscularRecommendation ------------------------------------
test("generateNeuromuscularRecommendation: pas de statut -> run_test", () => {
  const rec = generateNeuromuscularRecommendation(null);
  assert.equal(rec.action, "run_test");
});

test("generateNeuromuscularRecommendation: fatigue significative -> postpone_intense_session + drivers", () => {
  const status = computeNeuromuscularStatus({ cmjHeightScore: 10, sleepHours: 4 });
  const rec = generateNeuromuscularRecommendation(status);
  assert.equal(rec.action, "postpone_intense_session");
  assert.equal(rec.riskLevel, "high");
  assert.ok(rec.drivers.length > 0);
});

test("generateNeuromuscularRecommendation: optimal -> maintain, pas de drivers", () => {
  const status = computeNeuromuscularStatus({ cmjHeightScore: 95 });
  const rec = generateNeuromuscularRecommendation(status);
  assert.equal(rec.action, "maintain");
  assert.deepEqual(rec.drivers, []);
});

// ---- computeCMJReport (orchestration) ---------------------------------------
test("computeCMJReport: pas de test aujourd'hui -> testedToday=false, statut basé sur les autres facteurs uniquement si fournis", () => {
  const history = buildHistory("2026-07-01", [34, 35, 36, 35, 34, 35, 36]);
  const report = computeCMJReport(history, "2026-07-20", {});
  assert.equal(report.testedToday, false);
  assert.equal(report.todayHeightCm, null);
  assert.equal(report.status, null); // aucun facteur disponible -> pas de statut
});

test("computeCMJReport: intégration complète avec test du jour + baseline suffisante", () => {
  const values = [34, 35, 36, 35, 34, 35, 36]; // baseline
  const history = buildHistory("2026-07-01", values);
  history["2026-07-08"] = { bestHeightCm: 30 }; // chute nette aujourd'hui
  const report = computeCMJReport(history, "2026-07-08", { sleepHours: 5, pain: 4 });
  assert.equal(report.testedToday, true);
  assert.equal(report.todayHeightCm, 30);
  assert.ok(report.baselineStats.sufficient);
  assert.ok(report.variationPercent < 0);
  assert.ok(report.status.score < 70);
  assert.ok(["reduce_intensity", "postpone_intense_session", "monitor"].includes(report.recommendation.action));
});

console.log(`\n${passed} test(s) passed.`);

// ============================================================================
// morning/morningReadiness.js — BioSync
// ----------------------------------------------------------------------------
// Phase 7 : agrège les 3 statuts déjà calculés par les moteurs précédents
// (autonomicScore/recoveryScore du Morning Check-in, score CMJ du jour) en
// un score de readiness global 0-100, avec tendance sur plusieurs jours —
// exactement la carte "Morning Readiness" du cahier des charges §Tableau
// de bord.
//
// Ne recalcule RIEN — combine des scores déjà produits par hrvEngine.js,
// recoveryEngine.js et cmjEngine.js. Logique pure, testable avec
// `node morning/morningReadiness.test.js`.
// ============================================================================

// ============================================================================
// 1. Score de readiness global (0-100)
// ----------------------------------------------------------------------------
// Même mécanique de pondération/redistribution que tous les moteurs
// précédents : chaque domaine disponible contribue, les poids des domaines
// absents (ex. pas de CMJ un jour où il n'était pas pertinent) sont
// redistribués sur les domaines présents plutôt que de pénaliser l'athlète
// pour une donnée qui n'a jamais été demandée.
// ============================================================================
export const DEFAULT_READINESS_DOMAIN_WEIGHTS = { autonomic: 0.4, neuromuscular: 0.3, recovery: 0.3 };

export function computeMorningReadiness(entry, cmjStatus, weights = DEFAULT_READINESS_DOMAIN_WEIGHTS) {
  if (!entry) return null;

  const domains = [
    { key: "autonomic", label: "readiness_domain_autonomic", score: entry.autonomicScore ?? null, weight: weights.autonomic },
    { key: "neuromuscular", label: "readiness_domain_neuromuscular", score: cmjStatus?.score ?? null, weight: weights.neuromuscular },
    { key: "recovery", label: "readiness_domain_recovery", score: entry.recoveryScore ?? null, weight: weights.recovery },
  ];

  const available = domains.filter((d) => d.score != null);
  if (!available.length) return null;

  const totalWeight = available.reduce((s, d) => s + d.weight, 0) || 1;
  const score = Math.round(available.reduce((s, d) => s + d.score * (d.weight / totalWeight), 0));
  const level =
    score >= 80 ? "optimal" : score >= 65 ? "good" : score >= 50 ? "to_monitor" : score >= 35 ? "probable_fatigue" : "significant_fatigue";

  const enrichedDomains = domains.map((d) => ({ ...d, available: d.score != null }));
  return { score, level, domains: enrichedDomains, confidence: entry.confidence ?? null };
}

// ============================================================================
// 2. Tendance sur plusieurs jours
// ----------------------------------------------------------------------------
// Régression linéaire simple sur les scores disponibles (jours sans
// check-in ignorés plutôt que traités comme une chute à 0) — même
// principe que computeCMJTrend (module CMJ), volontairement dupliqué
// plutôt que partagé pour garder les modules cmj/ et morning/ indépendants
// l'un de l'autre.
// ============================================================================
export const READINESS_TREND_STABLE_THRESHOLD = 0.5; // points/jour
export const READINESS_TREND_MIN_POINTS = 3;

export function computeReadinessTrend(scoresSeries) {
  const points = (scoresSeries || []).filter((p) => p.score != null);
  if (points.length < READINESS_TREND_MIN_POINTS) {
    return { trend: "insufficient", slopePerDay: null, sampleSize: points.length };
  }

  const n = points.length;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.score);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slopePerDay = den === 0 ? 0 : num / den;
  const trend =
    Math.abs(slopePerDay) < READINESS_TREND_STABLE_THRESHOLD ? "stable" : slopePerDay > 0 ? "up" : "down";
  return { trend, slopePerDay: Math.round(slopePerDay * 100) / 100, sampleSize: n };
}

// ============================================================================
// 3. Construction de la série de scores à partir de l'historique brut
// ----------------------------------------------------------------------------
// history : objet { "YYYY-MM-DD": { autonomicScore, recoveryScore, ... } }
//           — forme exactement celle renvoyée par getAthleteData
//           (champ morningCheckins, cf. Phase 6).
// cmjScoreResolver(date) : fonction fournie par l'appelant (RecoveryDashboard)
//           pour obtenir le score CMJ du jour donné, car son calcul dépend
//           d'une baseline glissante que ce module n'a pas à connaître.
// ============================================================================
export function buildReadinessSeries(history, endDate, days, cmjScoreResolver) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate + "T00:00:00");
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const entry = (history || {})[dateKey] || null;
    const cmjStatus = cmjScoreResolver ? cmjScoreResolver(dateKey) : null;
    const readiness = computeMorningReadiness(entry, cmjStatus);
    out.push({ date: dateKey, score: readiness?.score ?? null });
  }
  return out;
}

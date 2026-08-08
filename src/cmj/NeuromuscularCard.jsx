// ============================================================================
// cmj/NeuromuscularCard.jsx
// ----------------------------------------------------------------------------
// Carte collapsible pour RecoveryDashboard, même patron visuel que le bloc
// Hormonal Readiness dans App.jsx : bandeau résumé (score + niveau) qui se
// déplie sur une recommandation, des mini-métriques et les facteurs les plus
// dégradés. Consomme directement la sortie de computeCMJReport (cmjEngine.js)
// — aucune logique de calcul ici, uniquement de l'affichage.
// ============================================================================
import React, { useState } from "react";
import { Activity, ChevronDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { BG, SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, RED } from "../App.jsx";
import { CMJ_TREND } from "./cmjEngine.js";

const CMJ_LEVEL_TONE = {
  optimal: ACCENT,
  good: ACCENT,
  to_monitor: AMBER,
  probable_fatigue: RED,
  significant_fatigue: RED,
};

function TrendIcon({ trend }) {
  if (trend === CMJ_TREND.UP) return <TrendingUp size={13} color={ACCENT} />;
  if (trend === CMJ_TREND.DOWN) return <TrendingDown size={13} color={RED} />;
  if (trend === CMJ_TREND.STABLE) return <Minus size={13} color={MUTED2} />;
  return <span style={{ color: MUTED2, fontSize: 11 }}>—</span>;
}

function MiniMetric({ label, value, unit, sub, tone }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 11px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 9.5, color: MUTED2, textTransform: "uppercase", letterSpacing: 0.3, fontFamily: "'Space Grotesk', sans-serif" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600, color: tone || INK }}>{value}</span>
        {unit && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: MUTED }}>{unit}</span>}
      </div>
      {sub && <span style={{ fontSize: 9.5, color: MUTED2 }}>{sub}</span>}
    </div>
  );
}

export default function NeuromuscularCard({ report, t, onRunTest }) {
  const [expanded, setExpanded] = useState(false);
  if (!report) return null;

  const { testedToday, todayHeightCm, variationPercent, rollingAvg7d, trend30d, status, recommendation, baselineStats } = report;
  const tone = status ? CMJ_LEVEL_TONE[status.level] : MUTED2;

  const variationTone =
    variationPercent == null ? MUTED2 : variationPercent < -8 ? RED : variationPercent < -4 ? AMBER : ACCENT;

  return (
    <div>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
          background: `linear-gradient(135deg, ${tone}14, ${SURFACE})`, border: `1px solid ${tone}55`, borderRadius: 14, padding: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Activity size={18} color={tone} />
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13.5 }}>{t("cmj_title")}</div>
            <div style={{ fontSize: 11, color: MUTED }}>{status ? t(`cmj_level_${status.level}`) : t("cmj_no_test_today")}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {status && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: tone }}>{status.score}</span>}
          <ChevronDown size={15} color={MUTED2} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {!testedToday && (
            <div style={{
              background: `${AMBER}14`, border: `1px solid ${AMBER}44`, borderRadius: 10, padding: "10px 12px",
              fontSize: 11.5, color: MUTED, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}>
              <span>{t("cmj_no_test_today_hint")}</span>
              {onRunTest && (
                <button onClick={onRunTest} style={{
                  background: ACCENT, border: "none", color: "#06251A", borderRadius: 8, padding: "6px 12px",
                  fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                }}>{t("cmj_run_test")}</button>
              )}
            </div>
          )}

          {recommendation && (
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>
                {t(`cmj_action_${recommendation.action}`)}
              </div>
              <div style={{ fontSize: 11.5, color: MUTED }}>
                {t(recommendation.rationaleKey).replace("{v}", (recommendation.drivers || []).map((k) => t(k)).join(", "))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
            <MiniMetric label={t("cmj_today_height")} value={todayHeightCm != null ? todayHeightCm : "—"} unit={todayHeightCm != null ? "cm" : ""} />
            <MiniMetric
              label={t("cmj_variation")}
              value={variationPercent != null ? `${variationPercent > 0 ? "+" : ""}${variationPercent}` : "—"}
              unit={variationPercent != null ? "%" : ""}
              tone={variationTone}
            />
            <MiniMetric label={t("cmj_rolling_avg")} value={rollingAvg7d != null ? rollingAvg7d : "—"} unit={rollingAvg7d != null ? "cm" : ""} />
            <MiniMetric
              label={t("cmj_trend")}
              value={<TrendIcon trend={trend30d.trend} />}
              sub={trend30d.slopePercentPerWeek != null ? `${trend30d.slopePercentPerWeek > 0 ? "+" : ""}${trend30d.slopePercentPerWeek}%/sem` : t("no_history_yet")}
            />
          </div>

          {status && (
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10.5, color: MUTED2, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("top_factors")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {status.subscores
                  .filter((s) => s.available)
                  .sort((a, b) => a.score - b.score)
                  .slice(0, 4)
                  .map((f) => (
                    <div key={f.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: MUTED, marginBottom: 3 }}>
                        <span>{t(f.label)}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(f.score)}/100</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: BORDER, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${f.score}%`, background: f.score >= 70 ? ACCENT : f.score >= 50 ? AMBER : RED, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {!baselineStats.sufficient && (
            <div style={{ fontSize: 10.5, color: MUTED2, textAlign: "center" }}>
              {t("cmj_baseline_building").replace("{n}", baselineStats.sampleSize)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

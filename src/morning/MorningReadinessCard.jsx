// ============================================================================
// morning/MorningReadinessCard.jsx
// ----------------------------------------------------------------------------
// Phase 7 : carte Dashboard "Morning Readiness" du cahier des charges.
// Même patron visuel que NeuromuscularCard.jsx (module CMJ) : bandeau
// résumé collapsible (score + niveau + code couleur vert/orange/rouge) qui
// se déplie sur le détail des 3 domaines + tendance + confiance de la
// mesure. Affichage uniquement — tout le calcul vient de morningReadiness.js.
// ============================================================================
import React, { useState } from "react";
import { Sunrise, ChevronDown, TrendingUp, TrendingDown, Minus, HeartPulse, Activity, BedDouble } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, RED } from "../theme.js";

const LEVEL_TONE = {
  optimal: ACCENT,
  good: ACCENT,
  to_monitor: AMBER,
  probable_fatigue: RED,
  significant_fatigue: RED,
};

const DOMAIN_ICON = { autonomic: HeartPulse, neuromuscular: Activity, recovery: BedDouble };

function TrendIcon({ trend }) {
  if (trend === "up") return <TrendingUp size={13} color={ACCENT} />;
  if (trend === "down") return <TrendingDown size={13} color={RED} />;
  if (trend === "stable") return <Minus size={13} color={MUTED2} />;
  return <span style={{ color: MUTED2, fontSize: 11 }}>—</span>;
}

export default function MorningReadinessCard({ readiness, trend, t }) {
  const [expanded, setExpanded] = useState(false);

  if (!readiness) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, background: SURFACE, border: `1px solid ${BORDER}`,
        borderRadius: 14, padding: 14,
      }}>
        <Sunrise size={18} color={MUTED2} />
        <div style={{ fontSize: 12, color: MUTED }}>{t("readiness_no_data_today")}</div>
      </div>
    );
  }

  const tone = LEVEL_TONE[readiness.level] ?? MUTED2;

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
          <Sunrise size={18} color={tone} />
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13.5 }}>{t("readiness_title")}</div>
            <div style={{ fontSize: 11, color: MUTED, display: "flex", alignItems: "center", gap: 6 }}>
              {t(`readiness_level_${readiness.level}`)}
              <TrendIcon trend={trend?.trend} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: tone }}>{readiness.score}</span>
          <ChevronDown size={15} color={MUTED2} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            {readiness.domains.map((d) => {
              const Icon = DOMAIN_ICON[d.key] || Activity;
              const domainTone = !d.available ? MUTED2 : d.score >= 70 ? ACCENT : d.score >= 50 ? AMBER : RED;
              return (
                <div key={d.key} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 11px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Icon size={12} color={domainTone} />
                    <span style={{ fontSize: 9.5, color: MUTED2, textTransform: "uppercase", letterSpacing: 0.3, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {t(d.label)}
                    </span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 600, color: domainTone }}>
                    {d.available ? d.score : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MUTED }}>
              <TrendIcon trend={trend?.trend} />
              <span>{trend?.trend ? t(`readiness_trend_${trend.trend}`) : t("readiness_trend_insufficient")}</span>
            </div>
            {readiness.confidence != null && (
              <div style={{ fontSize: 11.5, color: MUTED }}>
                {t("readiness_confidence")}: <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{readiness.confidence}%</b>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

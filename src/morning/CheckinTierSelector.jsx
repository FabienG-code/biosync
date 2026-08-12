// ============================================================================
// morning/CheckinTierSelector.jsx
// ----------------------------------------------------------------------------
// Phase 4 : écran de choix du niveau de check-in, à l'entière discrétion de
// l'athlète (cf. demande explicite : "3 Check-in possible à leur choix").
// Point d'entrée de MorningCheckinFlow.jsx.
// ============================================================================
import React from "react";
import { Zap, HeartPulse, Activity, ChevronRight } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, BLUE } from "../theme.js";

const TIERS = [
  { id: "quick", icon: Zap, tone: BLUE, nameKey: "tier_quick_name", durationKey: "tier_quick_duration", descKey: "tier_quick_desc" },
  { id: "standard", icon: HeartPulse, tone: ACCENT, nameKey: "tier_standard_name", durationKey: "tier_standard_duration", descKey: "tier_standard_desc" },
  { id: "advanced", icon: Activity, tone: AMBER, nameKey: "tier_advanced_name", durationKey: "tier_advanced_duration", descKey: "tier_advanced_desc" },
];

export default function CheckinTierSelector({ onSelect, t }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: INK, marginBottom: 2 }}>
        {t("tier_select_title")}
      </div>
      {TIERS.map((tier) => {
        const Icon = tier.icon;
        return (
          <button
            key={tier.id}
            onClick={() => onSelect(tier.id)}
            style={{
              display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer",
              background: `linear-gradient(135deg, ${tier.tone}14, ${SURFACE})`, border: `1px solid ${tier.tone}44`,
              borderRadius: 14, padding: "14px 16px",
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${tier.tone}1E`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={18} color={tier.tone} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14, color: INK }}>{t(tier.nameKey)}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: tier.tone }}>{t(tier.durationKey)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{t(tier.descKey)}</div>
            </div>
            <ChevronRight size={16} color={MUTED2} style={{ flexShrink: 0 }} />
          </button>
        );
      })}
    </div>
  );
}

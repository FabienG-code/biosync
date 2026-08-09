// ============================================================================
// cmj/CMJSuggestionBanner.jsx
// ----------------------------------------------------------------------------
// Étape 5 (partie "déclenchement suggéré") : bandeau compact, réutilisable
// partout où on veut proposer le test CMJ sans forcer la main — le tap reste
// toujours à l'initiative de l'athlète (contrainte navigateur §7 : getUserMedia
// exige un geste utilisateur explicite, aucun déclenchement automatique
// possible). Utilisé sur le Dashboard (déjà en place dans NeuromuscularCard,
// étape 3) et, à partir de cette étape, juste après le check-in matinal — le
// point de contact quotidien le plus naturel pour suggérer le test avant que
// l'athlète ne quitte l'app.
// ============================================================================
import React from "react";
import { Activity, ChevronRight } from "lucide-react";
import { AMBER, MUTED } from "../theme.js";

export default function CMJSuggestionBanner({ onOpen, t, label }) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 10, cursor: "pointer", width: "100%", textAlign: "left",
        background: `${AMBER}14`, border: `1px solid ${AMBER}44`, borderRadius: 12, padding: "12px 14px",
      }}
    >
      <Activity size={16} color={AMBER} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 11.5, color: MUTED }}>{label || t("cmj_no_test_today_hint")}</span>
      <ChevronRight size={15} color={AMBER} style={{ flexShrink: 0 }} />
    </button>
  );
}

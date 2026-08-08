// ============================================================================
// cmj/CMJTestForm.jsx
// ----------------------------------------------------------------------------
// Étape 3 : saisie MANUELLE des 3 sauts, en attendant la capture caméra
// (étape 4). Utilise summarizeJumps (cmjEngine.js) pour dériver best/avg/
// qualité exactement de la même façon que le fera plus tard jumpDetector.js
// — remplacer uniquement la source des `jumps` (saisie -> pose estimation)
// suffira à brancher la vraie capture sans toucher au reste du flux.
// ============================================================================
import React, { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { SURFACE, BORDER, MUTED, MUTED2, ACCENT, AMBER, inputStyle, btnPrimary, btnGhost, Card, TODAY, saveCMJResult } from "../App.jsx";
import { summarizeJumps, CMJ_ALGORITHM_VERSION } from "./cmjEngine.js";

const JUMP_COUNT = 3;

export default function CMJTestForm({ athleteId, setCmjHistory, onDone, t }) {
  const [heights, setHeights] = useState(Array(JUMP_COUNT).fill(""));
  const [done, setDone] = useState(false);

  function updateHeight(i, value) {
    setHeights((prev) => prev.map((h, idx) => (idx === i ? value : h)));
  }

  const parsedJumps = heights
    .map((h) => Number(String(h).replace(",", ".")))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => ({ heightCm: v, quality: "valid" }));

  function submit() {
    if (parsedJumps.length === 0) return;
    const summary = summarizeJumps(parsedJumps);
    const result = {
      ...summary,
      time: new Date().toTimeString().slice(0, 5),
      algorithmVersion: CMJ_ALGORITHM_VERSION,
      device: t("cmj_manual_entry"),
      jumps: parsedJumps,
      comments: "",
    };
    setCmjHistory((prev) => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), [TODAY]: result } }));
    saveCMJResult(athleteId, TODAY, result);
    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <CheckCircle2 size={30} color={ACCENT} style={{ marginBottom: 8 }} />
          <div style={{ color: MUTED, fontSize: 12.5, marginBottom: 14 }}>{t("cmj_test_saved")}</div>
          {onDone && <button onClick={onDone} style={btnGhost}>{t("back")}</button>}
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: `${AMBER}14`, border: `1px solid ${AMBER}44`, borderRadius: 10, padding: "10px 12px", fontSize: 11, color: MUTED }}>
        {t("cmj_manual_entry_hint")}
      </div>
      <Card label={t("cmj_title")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {heights.map((h, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("cmj_jump_n").replace("{n}", i + 1)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={h}
                  onChange={(e) => updateHeight(i, e.target.value)}
                  placeholder="—"
                  style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600 }}
                />
                <span style={{ fontSize: 12.5, color: MUTED, flexShrink: 0 }}>cm</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: "flex", gap: 8 }}>
        {onDone && <button onClick={onDone} style={{ ...btnGhost, flex: 1, justifyContent: "center" }}>{t("cancel")}</button>}
        <button onClick={submit} disabled={parsedJumps.length === 0} style={{ ...btnPrimary, flex: 1.4, opacity: parsedJumps.length === 0 ? 0.5 : 1 }}>
          <Send size={15} /> {t("save")}
        </button>
      </div>
    </div>
  );
}

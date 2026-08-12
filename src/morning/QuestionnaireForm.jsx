// ============================================================================
// morning/QuestionnaireForm.jsx
// ----------------------------------------------------------------------------
// Phase 4 : formulaire du questionnaire matinal. Curseurs 0-10, même
// convention UX que les symptômes du Hormonal Engine déjà en place dans
// App.jsx (CycleCheckinForm) — cohérence avec le reste de l'app plutôt
// qu'une nouvelle échelle à apprendre pour les athlètes.
// ============================================================================
import React, { useState } from "react";
import { Send } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, RED } from "../theme.js";
import { Card, inputStyle, btnPrimary } from "../App.jsx";
import { QUESTIONNAIRE_ITEMS } from "./recoveryEngine.js";

export default function QuestionnaireForm({ initialValues, onSubmit, t }) {
  const [values, setValues] = useState(() => ({
    sleepQuality: 5, stress: 5, fatigue: 5, motivation: 5, musclePain: 0, jointPain: 0, generalRecovery: 5,
    ...(initialValues || {}),
  }));
  const [sleepHours, setSleepHours] = useState(initialValues?.sleepHours ?? 7.5);
  const [temperatureDeltaC, setTemperatureDeltaC] = useState(initialValues?.temperatureDeltaC ?? 0);

  function updateItem(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function submit() {
    onSubmit({ ...values, sleepHours, temperatureDeltaC });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card label={t("questionnaire_sleep_hours")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="number" step="0.5" value={sleepHours} onChange={(e) => setSleepHours(+e.target.value)}
            style={{ ...inputStyle, width: 90, fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600 }}
          />
          <span style={{ fontSize: 12.5, color: MUTED }}>h</span>
        </div>
      </Card>

      <Card label={t("questionnaire_title")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {QUESTIONNAIRE_ITEMS.map((def) => {
            const val = values[def.key] ?? 0;
            const bad = def.direction === "worse" ? val >= 6 : val <= 4;
            return (
              <div key={def.key}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, color: INK }}>{t(def.labelKey)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: bad ? RED : ACCENT }}>{val}/10</span>
                </div>
                <input
                  type="range" min={0} max={10} value={val}
                  onChange={(e) => updateItem(def.key, +e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <Card label={t("questionnaire_temperature")}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600,
            color: Math.abs(temperatureDeltaC) <= 0.3 ? ACCENT : Math.abs(temperatureDeltaC) <= 0.6 ? AMBER : RED,
          }}>
            {temperatureDeltaC > 0 ? "+" : ""}{temperatureDeltaC.toFixed(1)}
          </span>
          <span style={{ fontSize: 13, color: MUTED }}>°C</span>
        </div>
        <input
          type="range" min={-1} max={1} step={0.1} value={temperatureDeltaC}
          onChange={(e) => setTemperatureDeltaC(+e.target.value)}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: MUTED2, marginTop: 4 }}>
          <span>-1°C</span><span>0</span><span>+1°C</span>
        </div>
      </Card>

      <button onClick={submit} style={btnPrimary}><Send size={16} /> {t("questionnaire_submit")}</button>
    </div>
  );
}

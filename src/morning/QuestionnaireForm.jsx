// ============================================================================
// morning/QuestionnaireForm.jsx
// ----------------------------------------------------------------------------
// Section "Hooper" (4 items, échelle 1-7, cf. Hooper Index classique) +
// section "Autres facteurs" (motivation, douleur articulaire, récupération
// générale, échelle 0-10) + durée de sommeil + température cutanée.
// ============================================================================
import React, { useState } from "react";
import { Send } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, RED } from "../theme.js";
import { Card, inputStyle, btnPrimary } from "../App.jsx";
import { HOOPER_ITEMS, QUESTIONNAIRE_ITEMS } from "./recoveryEngine.js";

export default function QuestionnaireForm({ initialValues, onSubmit, t }) {
  const [hooperValues, setHooperValues] = useState(() => ({
    hooperSleepQuality: 4, hooperFatigue: 4, hooperMusclePain: 4, hooperStress: 4,
    ...(initialValues || {}),
  }));
  const [values, setValues] = useState(() => ({
    motivation: 5, jointPain: 0, generalRecovery: 5,
    ...(initialValues || {}),
  }));
  const [bedtime, setBedtime] = useState(initialValues?.bedtime ?? "22:30");
  const [sleepHours, setSleepHours] = useState(initialValues?.sleepHours ?? 7.5);
  const [temperatureDeltaC, setTemperatureDeltaC] = useState(initialValues?.temperatureDeltaC ?? 0);

  function updateHooper(key, val) {
    setHooperValues((prev) => ({ ...prev, [key]: val }));
  }
  function updateItem(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function submit() {
    onSubmit({ ...hooperValues, ...values, bedtime, sleepHours, temperatureDeltaC });
  }

  const wakeTimeHint = (() => {
    const [h, m] = bedtime.split(":").map(Number);
    const totalMin = h * 60 + m + Math.round(sleepHours * 60);
    const wh = Math.floor((totalMin % (24 * 60)) / 60);
    const wm = totalMin % 60;
    return `${String(wh).padStart(2, "0")}:${String(wm).padStart(2, "0")}`;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card label={t("questionnaire_sleep_hours")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("questionnaire_bedtime")}</div>
            <input
              type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)}
              style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600, width: 130 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("questionnaire_sleep_duration")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number" step="0.5" value={sleepHours} onChange={(e) => setSleepHours(+e.target.value)}
                style={{ ...inputStyle, width: 90, fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600 }}
              />
              <span style={{ fontSize: 12.5, color: MUTED }}>h</span>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: MUTED2 }}>{t("questionnaire_wake_time_hint").replace("{v}", wakeTimeHint)}</div>
        </div>
      </Card>

      <Card label={t("questionnaire_hooper_title")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {HOOPER_ITEMS.map((def) => {
            const val = hooperValues[def.key] ?? 4;
            const bad = val >= 5;
            return (
              <div key={def.key}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 12.5, color: INK }}>{t(def.labelKey)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: bad ? RED : ACCENT }}>{val}/7</span>
                </div>
                <div style={{ fontSize: 10.5, color: MUTED2, marginBottom: 6 }}>{t(def.hintKey)}</div>
                <input
                  type="range" min={1} max={7} value={val}
                  onChange={(e) => updateHooper(def.key, +e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <Card label={t("questionnaire_other_title")}>
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

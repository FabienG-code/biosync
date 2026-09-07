// ============================================================================
// morning/QuestionnaireForm.jsx
// ----------------------------------------------------------------------------
// Phase 4 : formulaire du questionnaire matinal. Curseurs 0-10, même
// convention UX que les symptômes du Hormonal Engine déjà en place dans
// App.jsx (CycleCheckinForm) — cohérence avec le reste de l'app plutôt
// qu'une nouvelle échelle à apprendre pour les athlètes.
//
// Champs VFC nuit / FC repos en saisie manuelle (fallback) : couvrent le
// tier "Rapide" (aucun test orthostatique BLE) ET le cas où le test a été
// sauté/refusé en Standard/Avancé. Sans eux, le Tier 1 "Décision" du
// Workload Engine perdait deux signaux fortement pondérés (cf.
// legacyCheckinBridge.js). Masqués automatiquement dès qu'une mesure
// automatique existe déjà (hasAutoHrvData), pour ne jamais imposer une
// double saisie à l'athlète.
// ============================================================================
import React, { useState } from "react";
import { Send } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, RED } from "../theme.js";
import { Card, inputStyle, btnPrimary } from "../App.jsx";
import { QUESTIONNAIRE_ITEMS } from "./recoveryEngine.js";

export default function QuestionnaireForm({ initialValues, hasAutoHrvData, onSubmit, t }) {
  const [values, setValues] = useState(() => ({
    sleepQuality: 5, stress: 5, fatigue: 5, motivation: 5, musclePain: 0, jointPain: 0, generalRecovery: 5,
    ...(initialValues || {}),
  }));
  const [bedtime, setBedtime] = useState(initialValues?.bedtime ?? "22:30");
  const [sleepHours, setSleepHours] = useState(initialValues?.sleepHours ?? 7.5);
  const [temperatureDeltaC, setTemperatureDeltaC] = useState(initialValues?.temperatureDeltaC ?? 0);
  const [vfcManual, setVfcManual] = useState(initialValues?.vfcManual ?? "");
  const [fcReposManual, setFcReposManual] = useState(initialValues?.fcReposManual ?? "");

  function updateItem(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function submit() {
    onSubmit({
      ...values,
      bedtime,
      sleepHours,
      temperatureDeltaC,
      vfcManual: vfcManual === "" ? null : Number(vfcManual),
      fcReposManual: fcReposManual === "" ? null : Number(fcReposManual),
    });
  }

  // Heure de réveil approximative, uniquement informative — la durée
  // saisie reste la source de vérité (pas de recalcul silencieux qui
  // écraserait une saisie manuelle plus précise).
  const wakeTimeHint = (() => {
    const [h, m] = bedtime.split(":").map(Number);
    const totalMin = h * 60 + m + Math.round(sleepHours * 60);
    const wh = Math.floor((totalMin % (24 * 60)) / 60);
    const wm = totalMin % 60;
    return `${String(wh).padStart(2, "0")}:${String(wm).padStart(2, "0")}`;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!hasAutoHrvData && (
        <Card label={t("hrv")}>
          <div style={{ fontSize: 10.5, color: MUTED2, marginBottom: 10 }}>{t("questionnaire_hrv_manual_hint")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("vfc_night")} (ms)</div>
              <input
                type="number" inputMode="numeric" value={vfcManual} onChange={(e) => setVfcManual(e.target.value)}
                placeholder="—"
                style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 600 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("rest_hr")} (bpm)</div>
              <input
                type="number" inputMode="numeric" value={fcReposManual} onChange={(e) => setFcReposManual(e.target.value)}
                placeholder="—"
                style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 600 }}
              />
            </div>
          </div>
        </Card>
      )}

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

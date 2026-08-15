// ============================================================================
// morning/CameraOrthostaticTestScreen.jsx
// ----------------------------------------------------------------------------
// Orchestration du test orthostatique par caméra. Miroir de
// OrthostaticTestScreen.jsx (Bluetooth) : même déroulé conceptuel (allongé
// -> transition -> debout -> analyse -> résultat), mais capture optique.
// Réutilise hrvEngine.computeOrthostaticReport/computeAutonomicStatus/
// generateAutonomicRecommendation TELS QUELS — aucune duplication du calcul
// de readiness (§7 cahier des charges).
// ============================================================================
import React, { useEffect, useRef, useState } from "react";
import { Camera, AlertTriangle, ChevronRight, RotateCcw } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, RED } from "../theme.js";
import { Card, btnPrimary, btnGhost } from "../App.jsx";
import { isCameraPpgSupported, startPpgCamera, stopPpgCamera, startPpgSampling } from "./cameraPpgCapture.js";
import { processPpgPhase, computeHeartRateAtMarks } from "./cameraPpgEngine.js";
import { computeOrthostaticReport, computeAutonomicStatus, generateAutonomicRecommendation } from "./hrvEngine.js";
import { fromCameraResult } from "./orthostaticDataSource.js";

const SUPINE_DURATION_MS = 90000; // 30s stabilisation + 60s mesure (§4) — capture continue ; hrvEngine exclut déjà les 30 premières secondes
const TRANSITION_DURATION_MS = 3500;
const STANDING_DURATION_MS_DEFAULT = 3 * 60 * 1000;
const TICK_MS = 250;

const PHASE = {
  INTRO: "intro", CAMERA_ERROR: "camera_error", SUPINE: "supine",
  TRANSITION: "transition", STANDING: "standing", ANALYZING: "analyzing",
  POOR_SIGNAL: "poor_signal", RESULT: "result",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const formatCountdown = (ms) => {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
};

export default function CameraOrthostaticTestScreen({ standingDurationMs = STANDING_DURATION_MS_DEFAULT, onComplete, onSkip, t }) {
  const [phase, setPhase] = useState(isCameraPpgSupported() ? PHASE.INTRO : PHASE.CAMERA_ERROR);
  const [errorMessage, setErrorMessage] = useState(null);
  const [torchSupported, setTorchSupported] = useState(true);
  const [remainingMs, setRemainingMs] = useState(SUPINE_DURATION_MS);
  const [report, setReport] = useState(null);
  const [autonomicStatus, setAutonomicStatus] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [heartRateMarks, setHeartRateMarks] = useState([]);
  const [lastQuality, setLastQuality] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const stopSamplingRef = useRef(null);
  const supineSamplesRef = useRef([]);
  const standingSamplesRef = useRef([]);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopSamplingRef.current?.();
      stopPpgCamera(streamRef.current);
    };
  }, []);

  function safeSet(setter, value) {
    if (mountedRef.current) setter(value);
  }

  async function startTest() {
    setErrorMessage(null);
    try {
      const { stream, torchSupported: torch } = await startPpgCamera(videoRef.current);
      if (!mountedRef.current) { stopPpgCamera(stream); return; }
      streamRef.current = stream;
      safeSet(setTorchSupported, torch);
      await runSupinePhase();
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMessage(String(err?.message || err));
      safeSet(setPhase, PHASE.CAMERA_ERROR);
    }
  }

  async function runCountdown(durationMs, runId) {
    const start = performance.now();
    while (mountedRef.current && runIdRef.current === runId) {
      const elapsed = performance.now() - start;
      const remaining = durationMs - elapsed;
      safeSet(setRemainingMs, Math.max(0, remaining));
      if (remaining <= 0) return;
      await sleep(TICK_MS);
    }
  }

  async function runSupinePhase() {
    const runId = ++runIdRef.current;
    supineSamplesRef.current = [];
    safeSet(setPhase, PHASE.SUPINE);
    stopSamplingRef.current = startPpgSampling(videoRef.current, (s) => supineSamplesRef.current.push(s));
    await runCountdown(SUPINE_DURATION_MS, runId);
    stopSamplingRef.current?.();
    if (runIdRef.current !== runId || !mountedRef.current) return;

    safeSet(setPhase, PHASE.TRANSITION);
    await sleep(TRANSITION_DURATION_MS);
    if (runIdRef.current !== runId || !mountedRef.current) return;

    runStandingPhase(runId);
  }

  async function runStandingPhase(runId) {
    standingSamplesRef.current = [];
    safeSet(setPhase, PHASE.STANDING);
    stopSamplingRef.current = startPpgSampling(videoRef.current, (s) => standingSamplesRef.current.push(s));
    await runCountdown(standingDurationMs, runId);
    stopSamplingRef.current?.();
    if (runIdRef.current !== runId || !mountedRef.current) return;

    safeSet(setPhase, PHASE.ANALYZING);
    stopPpgCamera(streamRef.current);
    analyzeTest();
  }

  function analyzeTest() {
    const supinePhase = processPpgPhase(supineSamplesRef.current);
    const standingPhase = processPpgPhase(standingSamplesRef.current);
    const worstLevel = [supinePhase.quality.level, standingPhase.quality.level].includes("poor")
      ? "poor"
      : [supinePhase.quality.level, standingPhase.quality.level].includes("acceptable")
      ? "acceptable"
      : "good";

    if (worstLevel === "poor") {
      setLastQuality({ supine: supinePhase.quality, standing: standingPhase.quality });
      safeSet(setPhase, PHASE.POOR_SIGNAL);
      return;
    }

    const orthoReport = computeOrthostaticReport(supinePhase.rawIbisMs, standingPhase.rawIbisMs);
    const status = computeAutonomicStatus(orthoReport, {});
    const rec = generateAutonomicRecommendation(status, null);
    const marks = computeHeartRateAtMarks(standingPhase.ibisMs, [1, 2, 3]);

    setReport(orthoReport);
    setAutonomicStatus(status);
    setRecommendation(rec);
    setHeartRateMarks(marks);
    setLastQuality({ supine: supinePhase.quality, standing: standingPhase.quality });
    safeSet(setPhase, PHASE.RESULT);
  }

  function retry() {
    safeSet(setPhase, PHASE.INTRO);
  }

  function finish() {
    const packaged = fromCameraResult({
      report, autonomicStatus, recommendation, heartRateMarks,
      quality: lastQuality?.standing || { level: "good" },
    });
    if (onComplete) onComplete(packaged);
  }

  if (phase === PHASE.CAMERA_ERROR) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: `${RED}14`, border: `1px solid ${RED}44`, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 8 }}>
          <AlertTriangle size={16} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11.5, color: MUTED }}>
            {t("camera_ppg_error")}
            {errorMessage && <div style={{ fontSize: 10, color: MUTED2, marginTop: 4 }}>{errorMessage}</div>}
          </div>
        </div>
        {onSkip && <button onClick={onSkip} style={btnPrimary}>{t("morning_skip_test")}</button>}
      </div>
    );
  }

  const showVideo = [PHASE.SUPINE, PHASE.TRANSITION, PHASE.STANDING].includes(phase);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <video ref={videoRef} playsInline muted style={{ width: 1, height: 1, position: "absolute", opacity: 0, pointerEvents: "none" }} />

      {phase === PHASE.INTRO && (
        <>
          <Card label={t("camera_ppg_intro_title")}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Camera size={20} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12.5, color: MUTED }}>{t("camera_ppg_intro_hint")}</div>
            </div>
          </Card>
          <Card label={t("camera_ppg_before_start")}>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: MUTED, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>{t("camera_ppg_tip_no_talking")}</li>
              <li>{t("camera_ppg_tip_relax")}</li>
              <li>{t("camera_ppg_tip_still_finger")}</li>
              <li>{t("camera_ppg_tip_same_finger")}</li>
              <li>{t("camera_ppg_tip_light_pressure")}</li>
            </ul>
          </Card>
          <button onClick={startTest} style={btnPrimary}><Camera size={16} /> {t("camera_ppg_start")}</button>
          {onSkip && <button onClick={onSkip} style={{ ...btnGhost, justifyContent: "center" }}>{t("morning_skip_test")}</button>}
        </>
      )}

      {showVideo && (
        <div style={{ background: `linear-gradient(135deg, ${ACCENT}14, ${SURFACE})`, border: `1px solid ${ACCENT}44`, borderRadius: 16, padding: 22, textAlign: "center" }}>
          {phase === PHASE.TRANSITION ? (
            <div style={{ background: `${ACCENT}E6`, color: "#06251A", borderRadius: 14, padding: "16px 22px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: 1 }}>
              {t("camera_ppg_stand_up_now")}
            </div>
          ) : (
            <>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: INK, marginBottom: 4 }}>
                {phase === PHASE.SUPINE ? t("camera_ppg_phase_supine") : t("camera_ppg_phase_standing")}
              </div>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 14 }}>
                {t("camera_ppg_keep_finger")}{!torchSupported && ` — ${t("camera_ppg_no_torch_hint")}`}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 40, fontWeight: 700, color: ACCENT }}>
                {formatCountdown(remainingMs)}
              </div>
            </>
          )}
        </div>
      )}

      {phase === PHASE.ANALYZING && (
        <Card><div style={{ textAlign: "center", padding: "20px 0", fontSize: 12.5, color: MUTED }}>{t("morning_analyzing")}</div></Card>
      )}

      {phase === PHASE.POOR_SIGNAL && (
        <>
          <div style={{ background: `${AMBER}14`, border: `1px solid ${AMBER}44`, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 8 }}>
            <AlertTriangle size={16} color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11.5, color: MUTED }}>{t("camera_ppg_poor_signal")}</div>
          </div>
          <button onClick={retry} style={btnPrimary}><RotateCcw size={16} /> {t("camera_ppg_repeat_measurement")}</button>
          {onSkip && <button onClick={onSkip} style={{ ...btnGhost, justifyContent: "center" }}>{t("morning_skip_test")}</button>}
        </>
      )}

      {phase === PHASE.RESULT && (() => {
        const tone = !autonomicStatus ? MUTED2 : ["optimal", "good"].includes(autonomicStatus.level) ? ACCENT : autonomicStatus.level === "to_monitor" ? AMBER : RED;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {autonomicStatus && (
              <div style={{ background: `linear-gradient(135deg, ${tone}14, ${SURFACE})`, border: `1px solid ${tone}55`, borderRadius: 16, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase" }}>{t("morning_autonomic_status")}</div>
                    <div style={{ fontSize: 13, color: INK, marginTop: 2 }}>{t(`autonomic_level_${autonomicStatus.level}`)}</div>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 32, fontWeight: 700, color: tone }}>{autonomicStatus.score}</span>
                </div>
                {recommendation && (
                  <div style={{ marginTop: 12, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: INK, marginBottom: 3 }}>{t(`autonomic_action_${recommendation.action}`)}</div>
                    <div style={{ fontSize: 11, color: MUTED }}>
                      {t(recommendation.rationaleKey).replace("{v}", (recommendation.drivers || []).map((k) => t(k)).join(", "))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {report && (
              <Card label={t("camera_ppg_results_title")}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    [t("morning_resting_hr"), report.restingHR, "bpm"],
                    [t("morning_standing_hr"), report.standingHR, "bpm"],
                    [t("morning_delta_hr"), report.deltaHR != null ? `+${report.deltaHR}` : "—", "bpm"],
                    [t("camera_ppg_hr_1min"), heartRateMarks[0]?.heartRate ?? "—", "bpm"],
                    [t("camera_ppg_hr_2min"), heartRateMarks[1]?.heartRate ?? "—", "bpm"],
                    [t("camera_ppg_hr_3min"), heartRateMarks[2]?.heartRate ?? "—", "bpm"],
                  ].map(([label, value, unit]) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: MUTED2 }}>{label}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: INK, fontWeight: 600 }}>
                        {value ?? "—"} <span style={{ fontSize: 10, color: MUTED }}>{unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}`, fontSize: 11, color: MUTED2 }}>
                  {t("camera_ppg_source_label")}: {t("measurement_source_camera")}
                </div>
              </Card>
            )}

            <button onClick={finish} style={btnPrimary}><ChevronRight size={16} /> {t("morning_continue")}</button>
          </div>
        );
      })()}
    </div>
  );
}

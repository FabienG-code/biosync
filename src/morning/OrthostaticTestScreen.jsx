// ============================================================================
// morning/OrthostaticTestScreen.jsx
// ----------------------------------------------------------------------------
// Phase 3 : orchestration complète du test orthostatique. Branche
// bleHeartRate.js (capture BLE) et hrvEngine.js (calcul pur) — même patron
// que CMJTestScreen.jsx pour le module CMJ (machine à états par phases,
// repli gracieux si le matériel n'est pas disponible).
//
// DÉROULÉ :
//   INTRO -> SCANNING -> (BLE_UNSUPPORTED | BLE_ERROR | CONNECTED)
//   CONNECTED -> LYING (3 min) -> TRANSITION (5s, annonce) -> STANDING (3 min)
//   -> ANALYZING -> RESULT
//
// Repli : si Bluetooth indisponible (Safari iOS notamment) ou connexion
// impossible après un essai, l'écran propose de passer le test
// (onSkip) — le Check-in bascule alors sur le niveau "Rapide"
// (questionnaire seul), cf. Phase 4.
// ============================================================================
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Bluetooth, BluetoothOff, CheckCircle2, AlertTriangle, ChevronRight, Battery, HeartPulse } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, RED } from "../theme.js";
import { Card, btnPrimary, btnGhost } from "../App.jsx";
import {
  isBluetoothSupported, requestHeartRateDevice, connectHeartRateSensor, readBatteryLevel,
  startHeartRateNotifications, attachAutoReconnect, disconnectHeartRateSensor,
  assessConnectionContinuity,
} from "./bleHeartRate.js";
import { computeOrthostaticReport, computeAutonomicStatus, generateAutonomicRecommendation } from "./hrvEngine.js";

const LYING_DURATION_MS = 3 * 60 * 1000;
const STANDING_DURATION_MS = 3 * 60 * 1000;
const TRANSITION_DURATION_MS = 5000;
const TICK_MS = 250;

const PHASE = {
  INTRO: "intro",
  SCANNING: "scanning",
  BLE_UNSUPPORTED: "ble_unsupported",
  BLE_ERROR: "ble_error",
  CONNECTED: "connected",
  LYING: "lying",
  TRANSITION: "transition",
  STANDING: "standing",
  ANALYZING: "analyzing",
  RESULT: "result",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BG_ALPHA = "rgba(11,18,32,0.5)";

function speak(text, lang) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    // La synthèse vocale est un confort, pas une dépendance — un échec ici
    // ne doit jamais interrompre le test (l'annonce visuelle suffit).
  }
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function OrthostaticTestScreen({ athleteId, onComplete, onSkip, t, lang }) {
  const [phase, setPhase] = useState(isBluetoothSupported() ? PHASE.INTRO : PHASE.BLE_UNSUPPORTED);
  const [errorMessage, setErrorMessage] = useState(null);
  const [deviceName, setDeviceName] = useState(null);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [liveHR, setLiveHR] = useState(null);
  const [sensorContact, setSensorContact] = useState(null);
  const [remainingMs, setRemainingMs] = useState(LYING_DURATION_MS);
  const [signalLost, setSignalLost] = useState(false);
  const [report, setReport] = useState(null);
  const [autonomicStatus, setAutonomicStatus] = useState(null);
  const [recommendation, setRecommendation] = useState(null);

  const mountedRef = useRef(true);
  const deviceRef = useRef(null);
  const hrCharacteristicRef = useRef(null);
  const stopNotificationsRef = useRef(null);
  const detachReconnectRef = useRef(null);
  const phaseRef = useRef(phase);
  const lyingRRRef = useRef([]);
  const standingRRRef = useRef([]);
  const beatTimestampsRef = useRef([]);
  const runIdRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopNotificationsRef.current?.();
      detachReconnectRef.current?.();
      disconnectHeartRateSensor(deviceRef.current);
    };
  }, []);

  function safeSet(setter, value) {
    if (mountedRef.current) setter(value);
  }

  // ---- Réception d'un battement : aiguillé vers le bon buffer selon la phase courante --
  const handleMeasurement = useCallback((measurement) => {
    safeSet(setLiveHR, measurement.heartRate);
    if (measurement.sensorContact != null) safeSet(setSensorContact, measurement.sensorContact);
    beatTimestampsRef.current.push(measurement.timestampMs);

    const currentPhase = phaseRef.current;
    if (currentPhase === PHASE.LYING) {
      lyingRRRef.current.push(...measurement.rrIntervalsMs);
    } else if (currentPhase === PHASE.STANDING) {
      standingRRRef.current.push(...measurement.rrIntervalsMs);
    }

    const continuity = assessConnectionContinuity(beatTimestampsRef.current.slice(-10));
    safeSet(setSignalLost, !continuity.ok);
  }, []);

  // ---- Connexion initiale --------------------------------------------------
  async function connect() {
    setErrorMessage(null);
    safeSet(setPhase, PHASE.SCANNING);
    try {
      const device = await requestHeartRateDevice();
      if (!mountedRef.current) return;
      deviceRef.current = device;
      safeSet(setDeviceName, device.name || "Capteur BLE");

      const { hrCharacteristic, batteryCharacteristic } = await connectHeartRateSensor(device);
      if (!mountedRef.current) return;
      hrCharacteristicRef.current = hrCharacteristic;

      const battery = await readBatteryLevel(batteryCharacteristic);
      safeSet(setBatteryLevel, battery);

      stopNotificationsRef.current = startHeartRateNotifications(hrCharacteristic, handleMeasurement);
      detachReconnectRef.current = attachAutoReconnect(
        device,
        ({ hrCharacteristic: newHr }) => {
          hrCharacteristicRef.current = newHr;
          stopNotificationsRef.current?.();
          stopNotificationsRef.current = startHeartRateNotifications(newHr, handleMeasurement);
          safeSet(setSignalLost, false);
        },
        () => safeSet(setSignalLost, true)
      );

      safeSet(setPhase, PHASE.CONNECTED);
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMessage(String(err?.message || err));
      safeSet(setPhase, PHASE.BLE_ERROR);
    }
  }

  // ---- Déroulé du test (3 min allongé -> annonce -> 3 min debout) ----------
  async function runTest() {
    const runId = ++runIdRef.current;
    lyingRRRef.current = [];
    standingRRRef.current = [];
    beatTimestampsRef.current = [];

    safeSet(setPhase, PHASE.LYING);
    await runCountdown(LYING_DURATION_MS, runId);
    if (runIdRef.current !== runId || !mountedRef.current) return;

    safeSet(setPhase, PHASE.TRANSITION);
    speak(t("morning_stand_up_now"), lang);
    await sleep(TRANSITION_DURATION_MS);
    if (runIdRef.current !== runId || !mountedRef.current) return;

    safeSet(setPhase, PHASE.STANDING);
    await runCountdown(STANDING_DURATION_MS, runId);
    if (runIdRef.current !== runId || !mountedRef.current) return;

    safeSet(setPhase, PHASE.ANALYZING);
    stopNotificationsRef.current?.();
    detachReconnectRef.current?.();
    disconnectHeartRateSensor(deviceRef.current);

    const orthoReport = computeOrthostaticReport(lyingRRRef.current, standingRRRef.current);
    const status = computeAutonomicStatus(orthoReport, {
      restingHR: null, // baseline individuelle branchée en Phase 6 (historique Sheet)
      rmssdLying: null,
    });
    const rec = generateAutonomicRecommendation(status, null);

    if (!mountedRef.current) return;
    setReport(orthoReport);
    setAutonomicStatus(status);
    setRecommendation(rec);
    safeSet(setPhase, PHASE.RESULT);
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

  function finish() {
    if (onComplete) onComplete({ report, autonomicStatus, recommendation });
  }

  // ============================================================================
  // Rendu
  // ============================================================================
  if (phase === PHASE.BLE_UNSUPPORTED) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: `${AMBER}14`, border: `1px solid ${AMBER}44`, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <BluetoothOff size={16} color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11.5, color: MUTED }}>
            <div>{t("morning_ble_unsupported")}</div>
            <div style={{ marginTop: 4, color: MUTED2 }}>{t("morning_ble_unsupported_hint")}</div>
          </div>
        </div>
        <button onClick={onSkip} style={btnPrimary}><ChevronRight size={16} /> {t("morning_skip_test")}</button>
      </div>
    );
  }

  if (phase === PHASE.BLE_ERROR) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: `${RED}14`, border: `1px solid ${RED}44`, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertTriangle size={16} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11.5, color: MUTED }}>
            {t("morning_ble_error")}
            {errorMessage && <div style={{ fontSize: 10, color: MUTED2, marginTop: 4 }}>{errorMessage}</div>}
          </div>
        </div>
        <button onClick={connect} style={btnPrimary}><Bluetooth size={16} /> {t("morning_retry_connection")}</button>
        <button onClick={onSkip} style={{ ...btnGhost, justifyContent: "center" }}>{t("morning_skip_test")}</button>
      </div>
    );
  }

  if (phase === PHASE.INTRO) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Card label={t("morning_ortho_intro_title")}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <HeartPulse size={20} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12.5, color: MUTED }}>{t("morning_ortho_intro_hint")}</div>
          </div>
        </Card>
        <button onClick={connect} style={btnPrimary}><Bluetooth size={16} /> {t("morning_connect_sensor")}</button>
        {onSkip && <button onClick={onSkip} style={{ ...btnGhost, justifyContent: "center" }}>{t("morning_skip_test")}</button>}
      </div>
    );
  }

  if (phase === PHASE.SCANNING) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12.5, color: MUTED }}>
          <Bluetooth size={22} color={ACCENT} style={{ marginBottom: 8 }} />
          <div>{t("morning_connect_sensor")}…</div>
        </div>
      </Card>
    );
  }

  if (phase === PHASE.CONNECTED) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: `${ACCENT}14`, border: `1px solid ${ACCENT}44`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Bluetooth size={16} color={ACCENT} />
            <span style={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>{t("morning_connected_to").replace("{device}", deviceName || "—")}</span>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: MUTED, flexWrap: "wrap" }}>
            {liveHR != null && <span style={{ display: "flex", alignItems: "center", gap: 5 }}><HeartPulse size={13} /> {liveHR} bpm</span>}
            {batteryLevel != null && <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Battery size={13} /> {batteryLevel}%</span>}
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: sensorContact === false ? AMBER : ACCENT }}>
            {sensorContact === false ? t("morning_sensor_contact_bad") : t("morning_sensor_contact_ok")}
          </div>
        </div>
        <button onClick={runTest} style={btnPrimary}><ChevronRight size={16} /> {t("morning_start_test")}</button>
        {onSkip && <button onClick={onSkip} style={{ ...btnGhost, justifyContent: "center" }}>{t("morning_skip_test")}</button>}
      </div>
    );
  }

  if (phase === PHASE.LYING || phase === PHASE.STANDING) {
    const isLying = phase === PHASE.LYING;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{
          background: `linear-gradient(135deg, ${ACCENT}14, ${SURFACE})`, border: `1px solid ${ACCENT}44`, borderRadius: 16, padding: 22, textAlign: "center",
        }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: INK, marginBottom: 4 }}>
            {isLying ? t("morning_phase_lying") : t("morning_phase_standing")}
          </div>
          <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 16 }}>
            {isLying ? t("morning_phase_lying_hint") : t("morning_phase_standing_hint")}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 42, fontWeight: 700, color: ACCENT }}>
            {formatCountdown(remainingMs)}
          </div>
          {liveHR != null && (
            <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, background: BG_ALPHA, borderRadius: 999, padding: "5px 12px" }}>
              <HeartPulse size={13} color={ACCENT} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: INK }}>{liveHR} bpm</span>
            </div>
          )}
        </div>
        {signalLost && (
          <div style={{ background: `${RED}14`, border: `1px solid ${RED}44`, borderRadius: 10, padding: "9px 12px", fontSize: 11, color: RED, textAlign: "center" }}>
            {t("morning_signal_lost")}
          </div>
        )}
      </div>
    );
  }

  if (phase === PHASE.TRANSITION) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "50px 0", gap: 10,
      }}>
        <div style={{
          background: `${ACCENT}E6`, color: "#06251A", borderRadius: 16, padding: "20px 30px",
          fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: 1, textAlign: "center",
        }}>
          {t("morning_stand_up_now")}
        </div>
      </div>
    );
  }

  if (phase === PHASE.ANALYZING) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12.5, color: MUTED }}>{t("morning_analyzing")}</div>
      </Card>
    );
  }

  if (phase === PHASE.RESULT) {
    const tone = !autonomicStatus ? MUTED2 : autonomicStatus.level === "optimal" || autonomicStatus.level === "good" ? ACCENT : autonomicStatus.level === "to_monitor" ? AMBER : RED;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {report && !report.signalQuality.ok && (
          <div style={{ background: `${AMBER}14`, border: `1px solid ${AMBER}44`, borderRadius: 10, padding: "9px 12px", fontSize: 11, color: MUTED }}>
            {t("morning_low_quality_warning")}
          </div>
        )}

        {autonomicStatus && (
          <div style={{ background: `linear-gradient(135deg, ${tone}14, ${SURFACE})`, border: `1px solid ${tone}55`, borderRadius: 16, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4 }}>{t("morning_autonomic_status")}</div>
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
          <Card label={t("morning_results_title")}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                [t("morning_resting_hr"), report.restingHR, "bpm"],
                [t("morning_standing_hr"), report.standingHR, "bpm"],
                [t("morning_delta_hr"), report.deltaHR != null ? `+${report.deltaHR}` : "—", "bpm"],
                [t("morning_rmssd_lying"), report.rmssdLying, "ms"],
                [t("morning_rmssd_standing"), report.rmssdStanding, "ms"],
                [t("morning_rmssd_ratio"), report.rmssdRatio, ""],
                [t("morning_stabilization_time"), report.stabilizationTimeMs != null ? Math.round(report.stabilizationTimeMs / 1000) : "—", "s"],
              ].map(([label, value, unit]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: MUTED2 }}>{label}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: INK, fontWeight: 600 }}>
                    {value ?? "—"} <span style={{ fontSize: 10, color: MUTED }}>{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <button onClick={finish} style={btnPrimary}><ChevronRight size={16} /> {t("morning_continue")}</button>
      </div>
    );
  }

  return null;
}

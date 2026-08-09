// ============================================================================
// cmj/CMJTestScreen.jsx
// ----------------------------------------------------------------------------
// Étape 4 : écran de capture caméra. Orchestre poseCapture.js (caméra +
// landmarks) et jumpDetector.js (analyse pure) pour 3 essais, avec repli
// automatique sur CMJTestForm.jsx (saisie manuelle, étape 3) si la caméra
// est indisponible/refusée ou si le modèle ne charge pas — jamais d'écran
// bloqué, cf. §7 de l'architecture.
//
// DÉROULÉ D'UN ESSAI (fenêtre de capture, pas de détection live du décollage
// pendant la boucle vidéo — plus simple et robuste qu'un arrêt en temps réel) :
//   1. BASELINE   (1.5s) — l'athlète reste immobile, on capture la position
//                  de référence des chevilles
//   2. PROMPT     (0.4s) — signal visuel "SAUTE !"
//   3. CAPTURING  (2.2s) — fenêtre large qui couvre largement le temps de vol
//                  maximum plausible (MAX_FLIGHT_TIME_MS côté jumpDetector)
//   4. ATTEMPT_RESULT — analyzeJumpAttempt() tourne sur les frames capturées
//
// Après 3 essais détectés (valides ou non — summarizeJumps exclut les
// "low_confidence" du calcul final, cf. cmjEngine.js), résumé + sauvegarde
// via saveCMJResult, exactement comme CMJTestForm.jsx.
// ============================================================================
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CheckCircle2, Send, AlertTriangle, Keyboard, RotateCcw, ChevronRight } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, RED } from "../theme.js";
import { btnPrimary, btnGhost, Card, TODAY, saveCMJResult } from "../App.jsx";
import { summarizeJumps, CMJ_ALGORITHM_VERSION } from "./cmjEngine.js";
import { analyzeJumpAttempt, toJumpModel } from "./jumpDetector.js";
import { applyQualityControl } from "./qualityControl.js";
import { loadPoseLandmarker, disposePoseLandmarker, startCamera, stopCamera, startFrameLoop, isCameraSupported } from "./poseCapture.js";
import CMJTestForm from "./CMJTestForm.jsx";

const BASELINE_DURATION_MS = 1500;
const PROMPT_DURATION_MS = 400;
const CAPTURE_WINDOW_MS = 2200; // couvre largement MAX_FLIGHT_TIME_MS (1000ms) + marge de réaction
const REQUIRED_JUMPS = 3;

const PHASE = {
  INTRO: "intro",
  LOADING: "loading",
  CAMERA_ERROR: "camera_error",
  BASELINE: "baseline",
  PROMPT: "prompt",
  CAPTURING: "capturing",
  ATTEMPT_RESULT: "attempt_result",
  SUMMARY: "summary",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function CMJTestScreen({ athleteId, setCmjHistory, onDone, t }) {
  const [manualFallback, setManualFallback] = useState(!isCameraSupported());
  const [phase, setPhase] = useState(PHASE.INTRO);
  const [errorMessage, setErrorMessage] = useState(null);
  const [attempts, setAttempts] = useState([]); // résultats detected:true (valid ou low_confidence)
  const [lastResult, setLastResult] = useState(null);
  const [saved, setSaved] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const stopLoopRef = useRef(null);
  const framesRef = useRef([]);
  const baselineCutoffRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (stopLoopRef.current) stopLoopRef.current();
      stopCamera(streamRef.current);
      disposePoseLandmarker();
    };
  }, []);

  const handleFrame = useCallback((frame) => {
    if (frame) framesRef.current.push(frame);
  }, []);

  function safeSetPhase(p) {
    if (mountedRef.current) setPhase(p);
  }

  // ---- Cycle complet d'un essai (baseline -> signal -> capture -> analyse) --
  async function runAttempt() {
    framesRef.current = [];
    safeSetPhase(PHASE.BASELINE);
    await sleep(BASELINE_DURATION_MS);
    if (!mountedRef.current) return;
    baselineCutoffRef.current = performance.now();

    safeSetPhase(PHASE.PROMPT);
    await sleep(PROMPT_DURATION_MS);
    if (!mountedRef.current) return;

    safeSetPhase(PHASE.CAPTURING);
    await sleep(CAPTURE_WINDOW_MS);
    if (!mountedRef.current) return;

    const cutoff = baselineCutoffRef.current;
    const allFrames = framesRef.current;
    const baselineFrames = allFrames.filter((f) => f.timestampMs <= cutoff);
    // léger chevauchement volontaire autour de la coupure (cf. jumpDetector.test.js) :
    // le détecteur re-trie et retrouve le décollage même si la fenêtre "vol"
    // inclut encore quelques frames de la fin de la phase debout.
    const jumpFrames = allFrames.filter((f) => f.timestampMs > cutoff - 200);

    const result = applyQualityControl(analyzeJumpAttempt(baselineFrames, jumpFrames), allFrames);
    if (!mountedRef.current) return;
    setLastResult(result);
    if (result.detected) setAttempts((prev) => [...prev, result]);
    safeSetPhase(PHASE.ATTEMPT_RESULT);
  }

  // ---- Démarrage : chargement modèle + caméra, puis premier essai ----------
  async function startTest() {
    setErrorMessage(null);
    safeSetPhase(PHASE.LOADING);
    try {
      const landmarker = await loadPoseLandmarker();
      if (!mountedRef.current) return;
      landmarkerRef.current = landmarker;
      const stream = await startCamera(videoRef.current);
      if (!mountedRef.current) {
        stopCamera(stream);
        return;
      }
      streamRef.current = stream;
      stopLoopRef.current = startFrameLoop(videoRef.current, landmarker, handleFrame);
      await runAttempt();
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMessage(String(err?.message || err));
      safeSetPhase(PHASE.CAMERA_ERROR);
    }
  }

  function nextStep() {
    if (attempts.length >= REQUIRED_JUMPS) {
      stopLoopRef.current?.();
      stopCamera(streamRef.current);
      safeSetPhase(PHASE.SUMMARY);
    } else {
      runAttempt();
    }
  }

  function saveTest() {
    const jumps = attempts.map(toJumpModel).filter(Boolean);
    const summary = summarizeJumps(jumps);
    const result = {
      ...summary,
      time: new Date().toTimeString().slice(0, 5),
      algorithmVersion: CMJ_ALGORITHM_VERSION,
      device: "camera",
      jumps,
      comments: "",
    };
    setCmjHistory((prev) => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), [TODAY]: result } }));
    saveCMJResult(athleteId, TODAY, result);
    setSaved(true);
  }

  // ---- Repli saisie manuelle (à tout moment) -------------------------------
  if (manualFallback) {
    return <CMJTestForm athleteId={athleteId} setCmjHistory={setCmjHistory} onDone={onDone} t={t} />;
  }

  if (saved) {
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

  // Le <video> doit être monté dans le DOM dès le TOUT PREMIER rendu (phase
  // INTRO comprise), sinon `videoRef.current` vaut encore null au moment où
  // startTest() appelle startCamera() pendant la phase LOADING — c'était
  // exactement la cause du crash "e.srcObject=r" (e = null). On le garde
  // donc toujours dans l'arbre JSX, simplement masqué via CSS `display`
  // selon la phase, plutôt que conditionnellement absent du DOM.
  const showVideo = [PHASE.BASELINE, PHASE.PROMPT, PHASE.CAPTURING].includes(phase);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ position: "relative" }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: "100%", borderRadius: 14, background: "#000",
            display: showVideo ? "block" : "none",
            transform: "scaleX(-1)", // effet miroir, plus naturel en caméra frontale
          }}
        />
        {showVideo && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            {phase === PHASE.BASELINE && (
              <span style={{ background: "rgba(11,18,32,0.72)", color: INK, borderRadius: 10, padding: "10px 16px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 14 }}>
                {t("cmj_stand_still")}
              </span>
            )}
            {(phase === PHASE.PROMPT || phase === PHASE.CAPTURING) && (
              <span style={{
                background: `${ACCENT}E6`, color: "#06251A", borderRadius: 14, padding: "16px 26px",
                fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: 1,
              }}>
                {t("cmj_jump_now")}
              </span>
            )}
          </div>
        )}
      </div>

      {phase === PHASE.INTRO && (
        <>
          <Card label={t("cmj_camera_intro_title")}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Camera size={20} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12.5, color: MUTED }}>{t("cmj_camera_intro_hint")}</div>
            </div>
          </Card>
          <button onClick={startTest} style={btnPrimary}><Camera size={16} /> {t("cmj_start_camera_test")}</button>
          <button onClick={() => setManualFallback(true)} style={{ ...btnGhost, justifyContent: "center", gap: 8 }}>
            <Keyboard size={14} /> {t("cmj_switch_to_manual")}
          </button>
          {onDone && <button onClick={onDone} style={{ ...btnGhost, justifyContent: "center" }}>{t("cancel")}</button>}
        </>
      )}

      {phase === PHASE.CAMERA_ERROR && (
        <>
          <div style={{ background: `${RED}14`, border: `1px solid ${RED}44`, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={16} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11.5, color: MUTED }}>
              {t("cmj_camera_error")}
              {errorMessage && <div style={{ fontSize: 10, color: MUTED2, marginTop: 4 }}>{errorMessage}</div>}
            </div>
          </div>
          <button onClick={() => setManualFallback(true)} style={btnPrimary}><Keyboard size={16} /> {t("cmj_switch_to_manual")}</button>
        </>
      )}

      {phase === PHASE.LOADING && (
        <Card>
          <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12.5, color: MUTED }}>{t("cmj_loading_model")}</div>
        </Card>
      )}

      {showVideo && (
        <div style={{ fontSize: 11.5, color: MUTED, textAlign: "center" }}>
          {t("cmj_attempt_n_of_m").replace("{n}", attempts.length + 1).replace("{m}", REQUIRED_JUMPS)}
        </div>
      )}

      {phase === PHASE.ATTEMPT_RESULT && (() => {
        const detected = lastResult?.detected;
        const quality = lastResult?.quality;
        const tone = !detected ? RED : quality === "valid" ? ACCENT : AMBER;
        return (
          <>
            <div style={{ fontSize: 11.5, color: MUTED, textAlign: "center" }}>
              {t("cmj_attempt_n_of_m").replace("{n}", attempts.length || 1).replace("{m}", REQUIRED_JUMPS)}
            </div>
            <div style={{ background: `linear-gradient(135deg, ${tone}14, ${SURFACE})`, border: `1px solid ${tone}55`, borderRadius: 14, padding: 18, textAlign: "center" }}>
              {detected ? (
                <>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 34, fontWeight: 700, color: tone }}>{lastResult.heightCm}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>cm</div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${tone}18`, border: `1px solid ${tone}55`, borderRadius: 999, padding: "4px 11px" }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: tone }} />
                    <span style={{ fontSize: 11.5, color: tone, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>
                      {quality === "valid" ? t("cmj_quality_valid") : t("cmj_quality_low_confidence")}
                    </span>
                  </div>
                  {lastResult.reason && (
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 10 }}>{t(`cmj_reason_${lastResult.reason}`)}</div>
                  )}
                </>
              ) : (
                <>
                  <AlertTriangle size={22} color={RED} style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 12.5, color: MUTED }}>{t(`cmj_reason_${lastResult?.reason || "no_liftoff_detected"}`)}</div>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={runAttempt} style={{ ...btnGhost, flex: 1, justifyContent: "center" }}>
                <RotateCcw size={14} /> {t("cmj_retry_attempt")}
              </button>
              <button onClick={nextStep} style={{ ...btnPrimary, flex: 1.4 }} disabled={!detected && attempts.length === 0}>
                <ChevronRight size={16} /> {attempts.length >= REQUIRED_JUMPS ? t("cmj_review_summary") : t("cmj_next_attempt")}
              </button>
            </div>
          </>
        );
      })()}

      {phase === PHASE.SUMMARY && (() => {
        const jumps = attempts.map(toJumpModel).filter(Boolean);
        const summary = summarizeJumps(jumps);
        return (
          <>
            <Card label={t("cmj_summary_title")}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {attempts.map((a, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: MUTED }}>
                    <span>{t("cmj_attempt_n_of_m").replace("{n}", i + 1).replace("{m}", attempts.length)}</span>
                    <b style={{ color: a.quality === "valid" ? INK : MUTED2, fontFamily: "'JetBrains Mono', monospace" }}>
                      {a.heightCm} cm {a.quality !== "valid" ? `· ${t("cmj_quality_low_confidence")}` : ""}
                    </b>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12.5, color: MUTED }}>{t("cmj_today_height")}</span>
                <b style={{ fontFamily: "'JetBrains Mono', monospace", color: ACCENT, fontSize: 15 }}>{summary.bestHeightCm ?? "—"} cm</b>
              </div>
            </Card>
            <button onClick={saveTest} style={btnPrimary}><Send size={16} /> {t("cmj_save_test")}</button>
          </>
        );
      })()}
    </div>
  );
}

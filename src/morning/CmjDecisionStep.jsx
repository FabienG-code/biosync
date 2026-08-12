// ============================================================================
// morning/CmjDecisionStep.jsx
// ----------------------------------------------------------------------------
// Phase 5 : comble le point d'extension `cmjStep` laissé par
// MorningCheckinFlow.jsx (Phase 4). Évalue shouldSuggestCMJTest() au
// montage :
//   - non pertinent -> passe automatiquement (cahier des charges §5 :
//     "Sinon le Morning Check-in est terminé") — aucune interaction requise
//   - pertinent -> affiche le message de suggestion, puis lance
//     CMJTestScreen.jsx (module CMJ existant, réutilisé tel quel) si
//     l'athlète accepte
//
// Reçoit exactement les props que MorningCheckinFlow.jsx transmet à
// `cmjStep` : { athleteId, autonomicStatus, recoveryStatus, onComplete,
// onSkip, t } — plus sessionType/loadDeltaPercent/adaptiveReadinessScore/
// cmjHistory/setCmjHistory, à transmettre depuis l'app hôte (cf. patch
// MorningCheckinFlow ci-dessous).
// ============================================================================
import React, { useEffect, useState } from "react";
import { Activity, ChevronRight } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, ACCENT, AMBER } from "../theme.js";
import { btnPrimary, btnGhost, TODAY } from "../App.jsx";
import CMJTestScreen from "../cmj/CMJTestScreen.jsx";
import { computeCMJReport } from "../cmj/cmjEngine.js";
import { shouldSuggestCMJTest } from "./dailyDecisionEngine.js";

const STEP = { EVALUATING: "evaluating", SUGGESTED: "suggested", TESTING: "testing" };

export default function CmjDecisionStep({
  athleteId, autonomicStatus, recoveryStatus, sessionType, loadDeltaPercent, adaptiveReadinessScore,
  cmjHistory, setCmjHistory, onComplete, onSkip, t,
}) {
  const [step, setStep] = useState(STEP.EVALUATING);
  const [decision, setDecision] = useState(null);

  useEffect(() => {
    const result = shouldSuggestCMJTest({ sessionType, autonomicStatus, recoveryStatus, loadDeltaPercent, adaptiveReadinessScore });
    setDecision(result);
    setStep(result.suggested ? STEP.SUGGESTED : STEP.EVALUATING);
    if (!result.suggested) {
      // Cahier des charges §5 : rien à afficher, le check-in se termine
      // simplement — pas d'interaction requise pour un test jugé non pertinent.
      onSkip();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCmjTestComplete(result) {
    const mergedHistory = { ...(cmjHistory?.[athleteId] || {}), [TODAY]: result };
    const report = computeCMJReport(mergedHistory, TODAY, {});
    onComplete({ result, report, status: report.status });
  }

  if (step === STEP.EVALUATING) return null; // transition immédiate, rien à afficher

  if (step === STEP.SUGGESTED) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{
          background: `linear-gradient(135deg, ${AMBER}14, ${SURFACE})`, border: `1px solid ${AMBER}44`,
          borderRadius: 14, padding: 16, display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <Activity size={20} color={AMBER} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12.5, color: MUTED }}>{t("cmj_suggested_message")}</div>
        </div>
        <button onClick={() => setStep(STEP.TESTING)} style={btnPrimary}>
          <ChevronRight size={16} /> {t("cmj_run_test")}
        </button>
        <button onClick={onSkip} style={{ ...btnGhost, justifyContent: "center" }}>{t("cmj_skip_suggestion")}</button>
      </div>
    );
  }

  if (step === STEP.TESTING) {
    return (
      <CMJTestScreen
        athleteId={athleteId}
        setCmjHistory={setCmjHistory || (() => {})}
        onTestComplete={handleCmjTestComplete}
        onDone={onSkip}
        t={t}
      />
    );
  }

  return null;
}

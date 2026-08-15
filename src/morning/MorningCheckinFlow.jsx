// ============================================================================
// morning/MorningCheckinFlow.jsx
// ----------------------------------------------------------------------------
// Ajout : après le choix de niveau Standard/Avancé, un écran de sélection
// de méthode de mesure (Bluetooth / Caméra) s'intercale avant le test
// orthostatique. Le Bluetooth (OrthostaticTestScreen.jsx) N'EST PAS modifié
// dans son comportement — seul son résultat est désormais enveloppé via
// fromBluetoothResult() pour porter la même forme `measurement` que la
// caméra (orthostaticDataSource.js).
// ============================================================================
import React, { useState } from "react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, RED } from "../theme.js";
import { Card, btnPrimary, btnGhost } from "../App.jsx";
import CheckinTierSelector from "./CheckinTierSelector.jsx";
import QuestionnaireForm from "./QuestionnaireForm.jsx";
import OrthostaticTestScreen from "./OrthostaticTestScreen.jsx";
import CameraOrthostaticTestScreen from "./CameraOrthostaticTestScreen.jsx";
import MeasurementMethodSelector from "./MeasurementMethodSelector.jsx";
import { fromBluetoothResult } from "./orthostaticDataSource.js";
import { computeRecoveryStatus, generateRecoveryRecommendation } from "./recoveryEngine.js";
import { classifyFatigueProfile } from "./hrvEngine.js";

const STEP = {
  TIER_SELECT: "tier_select",
  METHOD_SELECT: "method_select",
  ORTHOSTATIC: "orthostatic",
  CAMERA_ORTHOSTATIC: "camera_orthostatic",
  QUESTIONNAIRE: "questionnaire",
  CMJ: "cmj",
  DONE: "done",
};

const FATIGUE_PROFILE_TONE = {
  optimal_recovery: ACCENT, autonomic_fatigue: AMBER, neuromuscular_fatigue: AMBER,
  mixed_fatigue: RED, systemic_fatigue: RED, insufficient_data: MUTED2,
};

export default function MorningCheckinFlow({ athleteId, onComplete, cmjStep: CmjStep, sessionType, loadDeltaPercent, adaptiveReadinessScore, cmjHistory, setCmjHistory, t, lang }) {
  const [step, setStep] = useState(STEP.TIER_SELECT);
  const [tier, setTier] = useState(null);
  const [orthostaticResult, setOrthostaticResult] = useState(null); // { report, autonomicStatus, recommendation, measurement }
  const [questionnaireValues, setQuestionnaireValues] = useState(null);
  const [cmjResult, setCmjResult] = useState(null);

  function selectTier(chosenTier) {
    setTier(chosenTier);
    setStep(chosenTier === "quick" ? STEP.QUESTIONNAIRE : STEP.METHOD_SELECT);
  }

  function selectMethod(method) {
    setStep(method === "camera" ? STEP.CAMERA_ORTHOSTATIC : STEP.ORTHOSTATIC);
  }

  function handleOrthostaticComplete(result) {
    setOrthostaticResult(fromBluetoothResult(result));
    setStep(STEP.QUESTIONNAIRE);
  }

  function handleCameraOrthostaticComplete(packaged) {
    setOrthostaticResult(packaged);
    setStep(STEP.QUESTIONNAIRE);
  }

  function handleOrthostaticSkip() {
    setOrthostaticResult(null);
    setStep(STEP.QUESTIONNAIRE);
  }

  function handleQuestionnaireSubmit(values) {
    setQuestionnaireValues(values);
    if (tier === "advanced" && CmjStep) setStep(STEP.CMJ);
    else setStep(STEP.DONE);
  }

  function handleCmjComplete(result) {
    setCmjResult(result);
    setStep(STEP.DONE);
  }

  function handleCmjSkip() {
    setCmjResult(null);
    setStep(STEP.DONE);
  }

  const recoveryStatus = questionnaireValues
    ? computeRecoveryStatus(questionnaireValues, questionnaireValues.sleepHours, questionnaireValues.temperatureDeltaC)
    : null;
  const recoveryRecommendation = step === STEP.DONE && recoveryStatus ? generateRecoveryRecommendation(recoveryStatus) : null;
  const fatigueProfile =
    step === STEP.DONE ? classifyFatigueProfile(orthostaticResult?.autonomicStatus ?? null, cmjResult?.status ?? null, recoveryStatus) : null;

  function finish() {
    if (onComplete) {
      onComplete({
        tier,
        orthostatic: orthostaticResult,
        questionnaire: questionnaireValues,
        cmj: cmjResult,
        recoveryStatus,
        recoveryRecommendation,
        fatigueProfile,
      });
    }
  }

  if (step === STEP.TIER_SELECT) return <CheckinTierSelector onSelect={selectTier} t={t} />;

  if (step === STEP.METHOD_SELECT) return <MeasurementMethodSelector onSelect={selectMethod} onSkip={handleOrthostaticSkip} t={t} />;

  if (step === STEP.ORTHOSTATIC) {
    return <OrthostaticTestScreen athleteId={athleteId} onComplete={handleOrthostaticComplete} onSkip={handleOrthostaticSkip} t={t} lang={lang} />;
  }

  if (step === STEP.CAMERA_ORTHOSTATIC) {
    return <CameraOrthostaticTestScreen onComplete={handleCameraOrthostaticComplete} onSkip={handleOrthostaticSkip} t={t} />;
  }

  if (step === STEP.QUESTIONNAIRE) return <QuestionnaireForm onSubmit={handleQuestionnaireSubmit} t={t} />;

  if (step === STEP.CMJ && CmjStep) {
    return (
      <CmjStep
        athleteId={athleteId}
        autonomicStatus={orthostaticResult?.autonomicStatus}
        recoveryStatus={recoveryStatus}
        sessionType={sessionType}
        loadDeltaPercent={loadDeltaPercent}
        adaptiveReadinessScore={adaptiveReadinessScore}
        cmjHistory={cmjHistory}
        setCmjHistory={setCmjHistory}
        onComplete={handleCmjComplete}
        onSkip={handleCmjSkip}
        t={t}
      />
    );
  }

  if (step === STEP.DONE) {
    const tone = fatigueProfile ? FATIGUE_PROFILE_TONE[fatigueProfile.profile] ?? MUTED2 : MUTED2;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <CheckCircle2 size={30} color={ACCENT} style={{ marginBottom: 8 }} />
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: INK }}>{t("morning_checkin_done")}</div>
        </div>

        {recoveryStatus && (
          <Card label={t("recovery_factor_general_recovery")}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: MUTED }}>{t(`recovery_level_${recoveryStatus.level}`)}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: tone }}>{recoveryStatus.score}</span>
            </div>
          </Card>
        )}

        {fatigueProfile && fatigueProfile.profile !== "insufficient_data" && (
          <div style={{ background: `${tone}14`, border: `1px solid ${tone}44`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: MUTED2, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{t("fatigue_profile_label")}</div>
            <div style={{ fontSize: 13, color: INK, fontWeight: 600 }}>{t(`fatigue_profile_${fatigueProfile.profile}`)}</div>
          </div>
        )}

        <button onClick={finish} style={btnPrimary}><ChevronRight size={16} /> {t("morning_continue")}</button>
      </div>
    );
  }

  return null;
}

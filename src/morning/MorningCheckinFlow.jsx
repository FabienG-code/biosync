// ============================================================================
// morning/MorningCheckinFlow.jsx
// ----------------------------------------------------------------------------
// Phase 4 : orchestrateur du nouveau Morning Check-in. Branche
// CheckinTierSelector -> (OrthostaticTestScreen si Standard/Avancé) ->
// QuestionnaireForm -> synthèse (recoveryEngine + hrvEngine.classifyFatigueProfile).
//
// Le niveau "Avancé" prévoit une étape CMJ après le questionnaire, pilotée
// par le Daily Decision Engine — cette étape n'est PAS encore implémentée
// ici (Phase 5 du plan). Le prop `cmjStep` est le point d'extension prévu :
// s'il est fourni, MorningCheckinFlow l'utilise ; sinon le niveau Avancé se
// comporte comme le niveau Standard (le questionnaire termine le check-in),
// pour que ce fichier reste fonctionnel et testable dès maintenant sans
// bloquer sur une pièce pas encore construite.
// ============================================================================
import React, { useState } from "react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, AMBER, RED } from "../theme.js";
import { Card, btnPrimary, btnGhost } from "../App.jsx";
import CheckinTierSelector from "./CheckinTierSelector.jsx";
import QuestionnaireForm from "./QuestionnaireForm.jsx";
import OrthostaticTestScreen from "./OrthostaticTestScreen.jsx";
import { computeRecoveryStatus, generateRecoveryRecommendation } from "./recoveryEngine.js";
import { classifyFatigueProfile } from "./hrvEngine.js";

const STEP = {
  TIER_SELECT: "tier_select",
  ORTHOSTATIC: "orthostatic",
  QUESTIONNAIRE: "questionnaire",
  CMJ: "cmj", // point d'extension Phase 5
  DONE: "done",
};

const FATIGUE_PROFILE_TONE = {
  optimal_recovery: ACCENT,
  autonomic_fatigue: AMBER,
  neuromuscular_fatigue: AMBER,
  mixed_fatigue: RED,
  systemic_fatigue: RED,
  insufficient_data: MUTED2,
};

export default function MorningCheckinFlow({ athleteId, onComplete, cmjStep: CmjStep, sessionType, loadDeltaPercent, adaptiveReadinessScore, cmjHistory, setCmjHistory, t, lang }) {
  const [step, setStep] = useState(STEP.TIER_SELECT);
  const [tier, setTier] = useState(null);
  const [orthostaticResult, setOrthostaticResult] = useState(null);
  const [questionnaireValues, setQuestionnaireValues] = useState(null);
  const [cmjResult, setCmjResult] = useState(null);

  function selectTier(chosenTier) {
    setTier(chosenTier);
    setStep(chosenTier === "quick" ? STEP.QUESTIONNAIRE : STEP.ORTHOSTATIC);
  }

  function handleOrthostaticComplete(result) {
    setOrthostaticResult(result);
    setStep(STEP.QUESTIONNAIRE);
  }

  function handleOrthostaticSkip() {
    // Repli gracieux (Bluetooth indisponible/refusé) : le check-in continue
    // sans données orthostatiques plutôt que de bloquer l'athlète.
    setOrthostaticResult(null);
    setStep(STEP.QUESTIONNAIRE);
  }

  function handleQuestionnaireSubmit(values) {
    setQuestionnaireValues(values);
    if (tier === "advanced" && CmjStep) {
      setStep(STEP.CMJ);
    } else {
      setStep(STEP.DONE);
    }
  }

  function handleCmjComplete(result) {
    setCmjResult(result);
    setStep(STEP.DONE);
  }

  function handleCmjSkip() {
    setCmjResult(null);
    setStep(STEP.DONE);
  }

  // ---- Synthèse — recoveryStatus doit être prêt dès l'étape CMJ (le moteur
  // de décision en a besoin comme facteur d'entrée), pas seulement à DONE ----
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

  if (step === STEP.TIER_SELECT) {
    return <CheckinTierSelector onSelect={selectTier} t={t} />;
  }

  if (step === STEP.ORTHOSTATIC) {
    return <OrthostaticTestScreen athleteId={athleteId} onComplete={handleOrthostaticComplete} onSkip={handleOrthostaticSkip} t={t} lang={lang} />;
  }

  if (step === STEP.QUESTIONNAIRE) {
    return <QuestionnaireForm onSubmit={handleQuestionnaireSubmit} t={t} />;
  }

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

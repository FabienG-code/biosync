// ============================================================================
// morning/confidenceScore.js — BioSync
// ----------------------------------------------------------------------------
// Phase 6 : "Confiance de la mesure" (colonne Sheet du cahier des charges).
// Combine la présence ET la qualité des différentes sources de données
// collectées, pondérées selon le niveau de check-in choisi — un check-in
// "Rapide" complet et propre doit afficher une confiance de 100%, même s'il
// ne contient ni test orthostatique ni CMJ (ils n'étaient pas requis).
//
// Logique pure — testable avec `node morning/confidenceScore.test.js`.
// ============================================================================
export function computeMeasurementConfidence({
  tier,
  questionnaireComplete,
  orthostaticSignalQualityOk,
  cmjTested,
  cmjQuality,
} = {}) {
  let score = 0;
  let maxScore = 0;

  // Le questionnaire est toujours requis, quel que soit le niveau.
  maxScore += 30;
  if (questionnaireComplete) score += 30;

  if (tier !== "quick") {
    maxScore += 50;
    if (orthostaticSignalQualityOk === true) score += 50;
    else if (orthostaticSignalQualityOk === false) score += 20; // données présentes mais dégradées
    // null/undefined (test passé/sauté) : aucune contribution, ni positive ni de malus supplémentaire
  }

  if (tier === "advanced" && cmjTested) {
    maxScore += 20;
    if (cmjQuality === "valid") score += 20;
    else if (cmjQuality === "acceptable") score += 14;
    else if (cmjQuality === "low_confidence" || cmjQuality === "poor") score += 8;
  }

  if (maxScore === 0) return 0;
  return Math.round((score / maxScore) * 100);
}

import React, { useState, useMemo, useEffect } from "react";
import { AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from "recharts";
import {
  LogOut, Lock, User, Users, Calendar as CalIcon, Activity, MessageSquare, Plus, Trash2,
  ChevronLeft, ChevronRight, Send, CheckCircle2, Circle, Moon, HeartPulse, Thermometer,
  Gauge, Zap, BedDouble, BrainCircuit, UploadCloud, FileText, X, Waves, Bike, Dumbbell,
  Timer, Bell, Pencil, Image as ImageIcon, Film, Globe, Apple, Flame, Salad, ChevronDown,
  TrendingUp, TrendingDown, Minus, Info, AlertTriangle, ChevronUp, LineChart as LineChartIcon, Wind,
} from "lucide-react";

// ============================================================
// Tokens
// ============================================================
const BG = "#0B1220", SURFACE = "#131B2C", BORDER = "#1E2A40", INK = "#E8EDF5";
const MUTED = "#7C8AA3", MUTED2 = "#5B6883", ACCENT = "#3DDC97", AMBER = "#F5A623", RED = "#F0554B", BLUE = "#4EA1F5";
const TONE = { green: ACCENT, amber: AMBER, red: RED, muted: MUTED2 };
const uid = () => Math.random().toString(36).slice(2, 9);
const TODAY = "2026-07-16";
const LOCALE_MAP = { fr: "fr-FR", en: "en-US", es: "es-ES" };
const fmtDate = (k, lang = "fr") => new Date(k + "T00:00:00").toLocaleDateString(LOCALE_MAP[lang] || "fr-FR", { day: "numeric", month: "short" });

// ============================================================
// Google Sheets sync layer
// ============================================================
// Colle ici l'URL /exec obtenue après déploiement du Google Apps Script
// (voir biosync-apps-script.gs). Laisser vide pour rester en mode local
// uniquement (aucune synchronisation, données en mémoire seulement).
const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbxhUBsq1aJOn9c4lvYo36Jt4S1RQDlIFDEs6gl8ol3ScMmEaSRvsJNOlpeVnA4JU6Gw/exec";

async function sheetsGet(params) {
  if (!SHEETS_API_URL) return null;
  try {
    const url = SHEETS_API_URL + "?" + new URLSearchParams(params).toString();
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    console.error("BioSync sync (GET) error:", err);
    return null;
  }
}

async function sheetsPost(body) {
  if (!SHEETS_API_URL) return null;
  try {
    const res = await fetch(SHEETS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite le preflight CORS
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.error("BioSync sync (POST) error:", err);
    return null;
  }
}

// Point unique de synchronisation du profil athlète (nutrition + suivi
// hormonal) vers Google Sheets. La sauvegarde côté backend réécrit toute la
// ligne "Profil" — donc chaque appel doit envoyer l'objet athlete COMPLET,
// jamais un sous-ensemble de champs, pour éviter qu'un écran (ex. Cycle)
// n'écrase silencieusement les données saisies sur un autre écran (ex. Nutrition).
function syncAthleteProfile(athlete) {
  if (!athlete) return;
  sheetsPost({
    action: "saveAthleteProfile", athleteId: athlete.id,
    profile: {
      weight: athlete.profile.weight, height: athlete.profile.height, age: athlete.profile.age,
      sex: athlete.profile.sex, goal: athlete.profile.goal, diet: athlete.diet || [],
      nutritionEnabled: !!athlete.nutritionEnabled, raceMode: athlete.raceMode || "none",
      trainingTime: athlete.trainingTime || "07:00", raceDurationHours: athlete.raceDurationHours || 3.5,
      mealOverrides: athlete.mealOverrides || {}, carbsPerHourTarget: athlete.carbsPerHourTarget || 60,
      hormonalTrackingEnabled: !!athlete.hormonalTrackingEnabled,
      cycleInfo: athlete.cycleInfo || { averageCycleLengthDays: 28, regularity: "regular", contraception: "none", isPregnantOrPostpartum: false, isPerimenopausal: false },
      enabledSymptoms: athlete.enabledSymptoms || DEFAULT_ENABLED_SYMPTOMS,
    },
  });
}

function SyncIndicator({ status }) {
  if (!SHEETS_API_URL) return null;
  const map = {
    idle: { color: MUTED2, label: "" },
    syncing: { color: AMBER, label: "Synchronisation…" },
    ok: { color: ACCENT, label: "Synchronisé" },
    error: { color: RED, label: "Erreur de synchronisation" },
  };
  const s = map[status] || map.idle;
  if (!s.label) return null;
  return <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: s.color }}>
    <span style={{ width: 6, height: 6, borderRadius: 3, background: s.color }} /> {s.label}
  </div>;
}

// ============================================================
// i18n
// ============================================================
const DICT = {
  fr: {
    login_title: "Connexion", login_id: "Identifiant", login_pw: "Mot de passe", login_submit: "Se connecter",
    login_err: "Identifiants incorrects",
    space_coach: "Espace entraîneur", space_athlete: "Espace athlète",
    nav_athletes: "Athlètes", nav_sessions: "Séances", nav_dashboard: "Dashboard", nav_inbox: "Reçu", nav_messages: "Messages",
    nav_calendar: "Calendrier", nav_checkin: "Check-in", nav_debrief: "Debrief",
    athletes_count: "Athlètes", add_athlete: "Ajouter un athlète", full_name: "Nom complet", username: "Identifiant",
    password: "Mot de passe", add: "Ajouter", no_athletes: "Aucun athlète pour l'instant.", pick_athlete: "Sélectionne un athlète.",
    session_type: "Type de séance", swim: "Natation", bike: "Vélo", run: "Course", strength: "Renforcement musculaire",
    add_session: "Ajouter une séance", edit: "Modifier", back: "Retour", save: "Enregistrer", delete: "Supprimer",
    comment: "Commentaire", attachments: "Pièces jointes", add_file: "Ajouter un fichier", no_file: "Aucun fichier",
    series: "Séries", reps: "Répétitions", time_min: "Temps (min)", intensity: "Intensité", recovery_s: "Récup. (s)",
    exercise_name: "Nom de l'exercice", video: "Vidéo", add_block: "Ajouter un bloc",
    section_warmup: "Échauffement", section_main: "Corps de séance", section_cooldown: "Retour au calme", add_exercise_block: "Ajouter un exercice",
    send_debrief: "Envoyer le debrief", send_checkin: "Envoyer le check-in", rpe: "Effort perçu (RPE)",
    duration: "Durée réelle", sensations: "Sensations", pain_intensity: "Intensité de douleur", zone: "Zone concernée",
    notes: "Notes libres", session_file: "Fichier de séance", no_sessions_today: "Rien de prévu ce jour.",
    rest: "Repos", planned: "Planifiée", done: "Réalisée", notifications: "Notifications", no_notifications: "Aucune notification.",
    mark_read: "Tout marquer comme lu", make_debrief: "Faire le debrief", logout: "Déconnexion", minutes: "minutes",
    vfc_night: "VFC nuit", rest_hr: "FC repos", hooper_score: "Score Hooper", sleep: "Sommeil", last_rpe: "Dernier RPE",
    pain: "Douleur", sleep_hooper_trend: "Sommeil & score Hooper", green_light: "Feu vert", amber_light: "Correct — reste attentif",
    red_light: "Vigilance recommandée", quality: "Qualité", hours: "Heures", value: "Valeur", session_name: "Nom de la séance",
    no_data: "Aucune donnée pour l'instant.", latest_checkin: "Dernier check-in", hrv: "VFC",
    hooper_fatigue: "Fatigue", hooper_stress: "Stress", hooper_courbatures: "Courbatures", hooper_sommeil: "Qualité de sommeil",
    good_shape: "Bonne forme", tired: "Fatigué", breathless: "Essoufflé", stiffness: "Raideur", motivated: "Motivé", acute_pain: "Douleur aiguë",
    shoulder_l: "Épaule G", shoulder_r: "Épaule D", low_back: "Lombaires", knee_l: "Genou G", knee_r: "Genou D", ankle_l: "Cheville G", ankle_r: "Cheville D", other: "Autre",
    nav_nutrition: "Nutrition", nutrition_toggle: "Nutrition", nutrition_on: "Activée", nutrition_off: "Désactivée",
    profile: "Profil", weight: "Poids (kg)", height: "Taille (cm)", age: "Âge", sex: "Sexe", male: "Homme", female: "Femme",
    goal: "Objectif", goal_perf: "Performance", goal_lean: "Sèche", goal_maintenance: "Maintien",
    diet_prefs: "Préférences alimentaires", vegetarian: "Végétarien", gluten_free: "Sans gluten", dairy_free: "Sans lactose",
    daily_targets: "Objectifs du jour", kcal: "kcal", carbs: "Glucides", protein: "Protéines", fat: "Lipides",
    load_rest: "Repos", load_moderate: "Modérée", load_high: "Élevée", load_very_high: "Très élevée", training_load: "Charge du jour",
    meal_plan: "Plan du jour", breakfast: "Petit-déjeuner", lunch: "Déjeuner", dinner: "Dîner", snack: "Collation",
    swap_meal: "Changer", no_recipe: "Aucune recette disponible avec ces filtres", save_profile: "Enregistrer le profil",
    nutrition_disabled_athlete: "Nutrition non activée pour cet athlète.", enable_nutrition_hint: "Active-la depuis l'onglet Athlètes.",
    total_vs_target: "Total du jour vs objectif",
    fueling_window: "Fenêtre nutritionnelle de la séance", pre_session: "Avant", during_session: "Pendant", post_session: "Après",
    hours_before: "h avant", per_hour: "/h", fluid: "Fluides", easy_run: "Footing", quality_session: "Séance qualité", long_run: "Sortie longue",
    carb_loading_note: "Sortie >2h : pense à charger en glucides la veille (10-12 g/kg/j) — voir le guide SiS.",
    guide_source: "Repères issus du guide SiS Marathon Fuelling", no_endurance_today: "Aucune séance d'endurance aujourd'hui.",
    based_on_debrief: "Ajusté sur le debrief réel",
    during_fuel_plan: "Nutrition pendant l'effort", fuel_gel: "Gels", fuel_drink: "Boisson", fuel_bar: "Barres/chews",
    units_needed: "unités", total_fluid: "Fluides totaux", fuel_timeline: "Prises pendant l'effort", at_minute: "à",
    choose_ingredients: "Choisir des aliments", validate: "Valider", cancel: "Annuler", to_prepare: "à préparer",
    select_ingredients_hint: "Sélectionne 1 à 4 aliments — l'app calcule la quantité pour chacun.", custom_meal: "Repas personnalisé",
    training_time: "Heure d'entraînement", pre_meal_tag: "Repas pré-séance", post_meal_tag: "Repas post-séance",
    meal_time_hint: "La répartition des repas s'ajuste selon cette heure.",
    race_objective: "Objectif course", race_mode_none: "Normal", race_mode_carb_load: "Charge glucidique",
    race_mode_race_day: "Jour de course", carb_load_active_note: "Charge glucidique active : 12 g/kg/j de glucides pendant au moins 2 jours (aliments pauvres en fibres, boissons/collations glucidiques conseillées).",
    race_day_plan: "Plan jour de course", pre_race_meal: "Repas pré-course", in_race_fueling: "Ravitaillement pendant la course",
    post_race_recovery: "Récupération post-course", race_duration: "Durée prévue de la course",
    dual_source_note: "Formulation double source (maltodextrine + fructose) recommandée au-delà de 80g/h.",
    tier1_decision: "Décision", tier2_determinants: "Déterminants", tier3_analysis: "Analyse avancée",
    readiness_score: "Readiness Score", risk_low: "Risque faible", risk_moderate: "Risque modéré", risk_high: "Risque élevé",
    load_label: "Charge (aiguë vs chronique)", hrv_label: "VFC", rhr_label: "FC repos", sleep_label: "Sommeil",
    temp_label: "Température nocturne", pain_label: "Douleur", rpe_label: "RPE de la veille", monotony_label: "Monotonie",
    action_maintain: "Maintenir la séance", action_reduce_volume_20: "Réduire le volume de 20 %", action_reduce_intensity: "Réduire l'intensité",
    action_active_recovery: "Remplacer par récupération active", action_rest: "Repos conseillé",
    rationale_acute_pain: "Douleur aiguë ou intensité élevée rapportée — priorité à la protection tissulaire.",
    rationale_spike: "Charge hebdomadaire en hausse de {v} % par rapport à la semaine précédente.",
    rationale_ok: "Indicateurs de récupération et de charge dans la plage habituelle de l'athlète.",
    rationale_drivers: "Signal(aux) le(s) plus dégradé(s) : {v}.",
    acute_load_label: "Charge aiguë (EWMA 7j)", chronic_load_label: "Charge chronique (EWMA {n}j)", weekly_change_label: "Variation hebdo.",
    vs_individual_avg: "vs moyenne indiv.", monthly_load: "Charge mensuelle", weekly_load: "Charge hebdomadaire",
    discipline_breakdown: "Répartition par discipline", no_history_yet: "Historique insuffisant pour ce calcul.",
    chronic_window: "Fenêtre charge chronique", show_analysis: "Voir l'analyse avancée", hide_analysis: "Masquer l'analyse avancée",
    trend_up: "En hausse", trend_down: "En baisse", trend_stable: "Stable",
    tooltip_acute: "Charge d'entraînement récente (7 derniers jours), lissée par moyenne mobile exponentielle.",
    tooltip_chronic: "Charge d'entraînement de fond, lissée sur {n} jours — reflète le niveau de forme accumulé.",
    tooltip_weekly_change: "Variation de la charge totale de cette semaine par rapport à la semaine précédente.",
    tooltip_monotony: "Rapport charge moyenne / écart-type sur 7 jours (Foster, 1998). Élevé = peu de variation jour à jour.",
    tooltip_strain: "Charge hebdomadaire × monotonie (Foster, 1998). Combine volume élevé et faible variabilité.",
    night_temp_hint: "Écart donné directement par la montre connectée par rapport à ta température de référence (typiquement entre -1 et +1°C). Un écart marqué peut signaler une fatigue ou un début d'infection.",
    hormonal_toggle: "Suivi hormonal", nav_cycle: "Cycle", hormonal_readiness: "Hormonal Readiness",
    hri_disclaimer: "Le HRI est un indicateur propriétaire, non validé cliniquement. Ce n'est ni un score médical ni un outil diagnostique. Il ne remplace jamais un avis médical.",
    level_optimal: "Optimal", level_good: "Bon", level_to_monitor: "À surveiller", level_probable_hormonal_fatigue: "Fatigue hormonale probable", level_significant_symptoms: "Symptômes importants",
    symptom_pain: "Douleurs", symptom_cramps: "Crampes", symptom_fatigue: "Fatigue", symptom_mood: "Humeur", symptom_irritability: "Irritabilité",
    symptom_motivation: "Motivation", symptom_energy: "Niveau d'énergie", symptom_concentration: "Concentration", symptom_digestive: "Troubles digestifs",
    symptom_heavy_legs: "Jambes lourdes", symptom_breast_tenderness: "Sensibilité mammaire", symptom_migraines: "Migraines", symptom_sleep_quality: "Qualité de sommeil perçue",
    hormonal_factor_hrv: "VFC", hormonal_factor_rhr: "FC repos", hormonal_factor_temp: "Température nocturne", hormonal_factor_sleep_duration: "Durée de sommeil",
    hormonal_factor_sleep_efficiency: "Efficacité du sommeil", hormonal_factor_load: "Charge (aiguë vs chronique)", hormonal_factor_weekly_change: "Variation hebdo.",
    hormonal_factor_monotony: "Monotonie", hormonal_factor_rpe: "RPE de la veille", hormonal_factor_ms_pain: "Douleur musculo-squelettique", hormonal_factor_cycle: "Contexte du cycle",
    hormonal_action_maintain: "Maintenir l'entraînement", hormonal_action_reduce_volume: "Réduire le volume", hormonal_action_reduce_intensity: "Réduire l'intensité",
    hormonal_action_split_session: "Fractionner la séance", hormonal_action_increase_recovery_time: "Augmenter le temps de récupération", hormonal_action_postpone_intense_session: "Reporter la séance intense",
    hormonal_rationale_optimal: "Symptômes, physiologie et charge tous dans la plage habituelle.", hormonal_rationale_good: "Aucun signal préoccupant aujourd'hui.",
    hormonal_rationale_monitor: "Facteur(s) à surveiller : {v}.", hormonal_rationale_fatigue: "Signes de fatigue hormonale probable liés à : {v}.", hormonal_rationale_severe: "Symptôme(s) important(s) rapporté(s) : {v}.",
    cycle_day: "Jour du cycle", cycle_length: "Longueur moyenne du cycle", cycle_regularity: "Régularité", regularity_regular: "Régulier", regularity_somewhat_irregular: "Peu régulier", regularity_irregular: "Irrégulier", regularity_unknown: "Inconnue",
    is_menstruating: "Règles en cours", contraception: "Contraception hormonale", contraception_none: "Aucune", contraception_combined_pill: "Pilule combinée", contraception_progestin_only: "Pilule progestative seule",
    contraception_iud_hormonal: "DIU hormonal", contraception_iud_copper: "DIU cuivre", contraception_implant: "Implant", contraception_patch_ring: "Patch / anneau", contraception_other: "Autre",
    pregnant_postpartum: "Grossesse / post-partum", perimenopausal: "Périménopause", symptoms_settings: "Symptômes suivis", save_cycle_checkin: "Enregistrer",
    hormonal_detail: "Détail", hormonal_symptoms_today: "Symptômes du jour", hormonal_trends: "Tendances", hormonal_biomarkers: "Biomarqueurs", hormonal_recommendation: "Recommandation",
    top_factors: "Principaux facteurs", cycle_history: "Historique du cycle", not_tracked_yet: "Pas encore de check-in aujourd'hui.",
    carbs_per_hour_strategy: "Stratégie glucides/h", outside_guide_range: "Hors de la fourchette conseillée par le guide ({min}-{max}g/h) pour ce type de séance.",
  },
  en: {
    login_title: "Sign in", login_id: "Username", login_pw: "Password", login_submit: "Sign in",
    login_err: "Incorrect credentials",
    space_coach: "Coach space", space_athlete: "Athlete space",
    nav_athletes: "Athletes", nav_sessions: "Sessions", nav_dashboard: "Dashboard", nav_inbox: "Inbox", nav_messages: "Messages",
    nav_calendar: "Calendar", nav_checkin: "Check-in", nav_debrief: "Debrief",
    athletes_count: "Athletes", add_athlete: "Add an athlete", full_name: "Full name", username: "Username",
    password: "Password", add: "Add", no_athletes: "No athletes yet.", pick_athlete: "Select an athlete.",
    session_type: "Session type", swim: "Swimming", bike: "Cycling", run: "Running", strength: "Strength training",
    add_session: "Add a session", edit: "Edit", back: "Back", save: "Save", delete: "Delete",
    comment: "Comment", attachments: "Attachments", add_file: "Add a file", no_file: "No file",
    series: "Sets", reps: "Reps", time_min: "Time (min)", intensity: "Intensity", recovery_s: "Recovery (s)",
    exercise_name: "Exercise name", video: "Video", add_block: "Add a block",
    section_warmup: "Warm-up", section_main: "Main set", section_cooldown: "Cool-down", add_exercise_block: "Add an exercise",
    send_debrief: "Send debrief", send_checkin: "Send check-in", rpe: "Perceived effort (RPE)",
    duration: "Actual duration", sensations: "Sensations", pain_intensity: "Pain intensity", zone: "Affected zone",
    notes: "Notes", session_file: "Session file", no_sessions_today: "Nothing planned today.",
    rest: "Rest", planned: "Planned", done: "Done", notifications: "Notifications", no_notifications: "No notifications.",
    mark_read: "Mark all as read", make_debrief: "Send session debrief", logout: "Log out", minutes: "minutes",
    vfc_night: "Night HRV", rest_hr: "Resting HR", hooper_score: "Hooper score", sleep: "Sleep", last_rpe: "Last RPE",
    pain: "Pain", sleep_hooper_trend: "Sleep & Hooper score", green_light: "All clear", amber_light: "OK — watch your load",
    red_light: "Caution recommended", quality: "Quality", hours: "Hours", value: "Value", session_name: "Session name",
    no_data: "No data yet.", latest_checkin: "Latest check-in", hrv: "HRV",
    hooper_fatigue: "Fatigue", hooper_stress: "Stress", hooper_courbatures: "Soreness", hooper_sommeil: "Sleep quality",
    good_shape: "Feeling good", tired: "Tired", breathless: "Breathless", stiffness: "Stiffness", motivated: "Motivated", acute_pain: "Acute pain",
    shoulder_l: "L shoulder", shoulder_r: "R shoulder", low_back: "Lower back", knee_l: "L knee", knee_r: "R knee", ankle_l: "L ankle", ankle_r: "R ankle", other: "Other",
    nav_nutrition: "Nutrition", nutrition_toggle: "Nutrition", nutrition_on: "Enabled", nutrition_off: "Disabled",
    profile: "Profile", weight: "Weight (kg)", height: "Height (cm)", age: "Age", sex: "Sex", male: "Male", female: "Female",
    goal: "Goal", goal_perf: "Performance", goal_lean: "Cutting", goal_maintenance: "Maintenance",
    diet_prefs: "Dietary preferences", vegetarian: "Vegetarian", gluten_free: "Gluten-free", dairy_free: "Dairy-free",
    daily_targets: "Today's targets", kcal: "kcal", carbs: "Carbs", protein: "Protein", fat: "Fat",
    load_rest: "Rest", load_moderate: "Moderate", load_high: "High", load_very_high: "Very high", training_load: "Today's load",
    meal_plan: "Today's plan", breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack",
    swap_meal: "Swap", no_recipe: "No recipe available with these filters", save_profile: "Save profile",
    nutrition_disabled_athlete: "Nutrition not enabled for this athlete.", enable_nutrition_hint: "Enable it from the Athletes tab.",
    total_vs_target: "Today's total vs target",
    fueling_window: "Session fueling window", pre_session: "Before", during_session: "During", post_session: "After",
    hours_before: "h before", per_hour: "/h", fluid: "Fluids", easy_run: "Easy run", quality_session: "Quality session", long_run: "Long run",
    carb_loading_note: "Session >2h: remember to carb-load the day before (10-12 g/kg/day) — see the SiS guide.",
    guide_source: "Figures from the SiS Marathon Fuelling guide", no_endurance_today: "No endurance session today.",
    based_on_debrief: "Adjusted from actual debrief",
    during_fuel_plan: "Fueling during the session", fuel_gel: "Gels", fuel_drink: "Drink", fuel_bar: "Bars/chews",
    units_needed: "units", total_fluid: "Total fluids", fuel_timeline: "Intake during the session", at_minute: "at",
    choose_ingredients: "Choose ingredients", validate: "Confirm", cancel: "Cancel", to_prepare: "to prepare",
    select_ingredients_hint: "Pick 1-4 ingredients — the app works out the amount for each.", custom_meal: "Custom meal",
    training_time: "Training time", pre_meal_tag: "Pre-session meal", post_meal_tag: "Post-session meal",
    meal_time_hint: "Meal distribution adjusts around this time.",
    race_objective: "Race objective", race_mode_none: "Normal", race_mode_carb_load: "Carb loading",
    race_mode_race_day: "Race day", carb_load_active_note: "Carb loading active: 12 g/kg/day of carbs for at least 2 days (low-fibre foods, carb drinks/snacks recommended).",
    race_day_plan: "Race day plan", pre_race_meal: "Pre-race meal", in_race_fueling: "In-race fueling",
    post_race_recovery: "Post-race recovery", race_duration: "Expected race duration",
    dual_source_note: "Dual-source formulation (maltodextrin + fructose) recommended above 80g/h.",
    tier1_decision: "Decision", tier2_determinants: "Determinants", tier3_analysis: "Advanced analysis",
    readiness_score: "Readiness Score", risk_low: "Low risk", risk_moderate: "Moderate risk", risk_high: "High risk",
    load_label: "Load (acute vs chronic)", hrv_label: "HRV", rhr_label: "Resting HR", sleep_label: "Sleep",
    temp_label: "Night temperature", pain_label: "Pain", rpe_label: "Yesterday's RPE", monotony_label: "Monotony",
    action_maintain: "Maintain the session", action_reduce_volume_20: "Reduce volume by 20%", action_reduce_intensity: "Reduce intensity",
    action_active_recovery: "Replace with active recovery", action_rest: "Rest advised",
    rationale_acute_pain: "Acute or high-intensity pain reported — prioritise tissue protection.",
    rationale_spike: "Weekly load up {v}% versus the previous week.",
    rationale_ok: "Recovery and load indicators within the athlete's usual range.",
    rationale_drivers: "Weakest signal(s): {v}.",
    acute_load_label: "Acute load (EWMA 7d)", chronic_load_label: "Chronic load (EWMA {n}d)", weekly_change_label: "Weekly change",
    vs_individual_avg: "vs individual avg.", monthly_load: "Monthly load", weekly_load: "Weekly load",
    discipline_breakdown: "Breakdown by discipline", no_history_yet: "Not enough history for this calculation.",
    chronic_window: "Chronic load window", show_analysis: "Show advanced analysis", hide_analysis: "Hide advanced analysis",
    trend_up: "Rising", trend_down: "Falling", trend_stable: "Stable",
    tooltip_acute: "Recent training load (last 7 days), smoothed with an exponential moving average.",
    tooltip_chronic: "Background training load, smoothed over {n} days — reflects accumulated fitness.",
    tooltip_weekly_change: "Change in total load this week versus the previous week.",
    tooltip_monotony: "Mean daily load / standard deviation over 7 days (Foster, 1998). High = little day-to-day variation.",
    tooltip_strain: "Weekly load × monotony (Foster, 1998). Combines high volume and low variability.",
    night_temp_hint: "Deviation given directly by your wearable versus your baseline temperature (typically -1 to +1°C). A marked deviation can signal fatigue or an early infection.",
    hormonal_toggle: "Hormonal tracking", nav_cycle: "Cycle", hormonal_readiness: "Hormonal Readiness",
    hri_disclaimer: "The HRI is a proprietary indicator, not clinically validated. It is not a medical score and not a diagnostic tool. It never replaces medical advice.",
    level_optimal: "Optimal", level_good: "Good", level_to_monitor: "To monitor", level_probable_hormonal_fatigue: "Probable hormonal fatigue", level_significant_symptoms: "Significant symptoms",
    symptom_pain: "Pain", symptom_cramps: "Cramps", symptom_fatigue: "Fatigue", symptom_mood: "Mood", symptom_irritability: "Irritability",
    symptom_motivation: "Motivation", symptom_energy: "Energy level", symptom_concentration: "Concentration", symptom_digestive: "Digestive issues",
    symptom_heavy_legs: "Heavy legs", symptom_breast_tenderness: "Breast tenderness", symptom_migraines: "Migraines", symptom_sleep_quality: "Perceived sleep quality",
    hormonal_factor_hrv: "HRV", hormonal_factor_rhr: "Resting HR", hormonal_factor_temp: "Night temperature", hormonal_factor_sleep_duration: "Sleep duration",
    hormonal_factor_sleep_efficiency: "Sleep efficiency", hormonal_factor_load: "Load (acute vs chronic)", hormonal_factor_weekly_change: "Weekly change",
    hormonal_factor_monotony: "Monotony", hormonal_factor_rpe: "Yesterday's RPE", hormonal_factor_ms_pain: "Musculoskeletal pain", hormonal_factor_cycle: "Cycle context",
    hormonal_action_maintain: "Maintain training", hormonal_action_reduce_volume: "Reduce volume", hormonal_action_reduce_intensity: "Reduce intensity",
    hormonal_action_split_session: "Split the session", hormonal_action_increase_recovery_time: "Increase recovery time", hormonal_action_postpone_intense_session: "Postpone the intense session",
    hormonal_rationale_optimal: "Symptoms, physiology and load all within the usual range.", hormonal_rationale_good: "No concerning signal today.",
    hormonal_rationale_monitor: "Factor(s) to monitor: {v}.", hormonal_rationale_fatigue: "Signs of probable hormonal fatigue linked to: {v}.", hormonal_rationale_severe: "Significant symptom(s) reported: {v}.",
    cycle_day: "Cycle day", cycle_length: "Average cycle length", cycle_regularity: "Regularity", regularity_regular: "Regular", regularity_somewhat_irregular: "Somewhat irregular", regularity_irregular: "Irregular", regularity_unknown: "Unknown",
    is_menstruating: "Currently menstruating", contraception: "Hormonal contraception", contraception_none: "None", contraception_combined_pill: "Combined pill", contraception_progestin_only: "Progestin-only pill",
    contraception_iud_hormonal: "Hormonal IUD", contraception_iud_copper: "Copper IUD", contraception_implant: "Implant", contraception_patch_ring: "Patch / ring", contraception_other: "Other",
    pregnant_postpartum: "Pregnant / postpartum", perimenopausal: "Perimenopausal", symptoms_settings: "Tracked symptoms", save_cycle_checkin: "Save",
    hormonal_detail: "Detail", hormonal_symptoms_today: "Today's symptoms", hormonal_trends: "Trends", hormonal_biomarkers: "Biomarkers", hormonal_recommendation: "Recommendation",
    top_factors: "Top factors", cycle_history: "Cycle history", not_tracked_yet: "No check-in yet today.",
    carbs_per_hour_strategy: "Carb strategy per hour", outside_guide_range: "Outside the guide's recommended range ({min}-{max}g/h) for this session type.",
  },
  es: {
    login_title: "Iniciar sesión", login_id: "Usuario", login_pw: "Contraseña", login_submit: "Entrar",
    login_err: "Credenciales incorrectas",
    space_coach: "Espacio entrenador", space_athlete: "Espacio atleta",
    nav_athletes: "Atletas", nav_sessions: "Sesiones", nav_dashboard: "Panel", nav_inbox: "Recibido", nav_messages: "Mensajes",
    nav_calendar: "Calendario", nav_checkin: "Check-in", nav_debrief: "Resumen",
    athletes_count: "Atletas", add_athlete: "Añadir atleta", full_name: "Nombre completo", username: "Usuario",
    password: "Contraseña", add: "Añadir", no_athletes: "Aún no hay atletas.", pick_athlete: "Selecciona un atleta.",
    session_type: "Tipo de sesión", swim: "Natación", bike: "Ciclismo", run: "Carrera", strength: "Fuerza",
    add_session: "Añadir sesión", edit: "Editar", back: "Volver", save: "Guardar", delete: "Eliminar",
    comment: "Comentario", attachments: "Archivos adjuntos", add_file: "Añadir archivo", no_file: "Sin archivo",
    series: "Series", reps: "Repeticiones", time_min: "Tiempo (min)", intensity: "Intensidad", recovery_s: "Recuperación (s)",
    exercise_name: "Nombre del ejercicio", video: "Vídeo", add_block: "Añadir bloque",
    section_warmup: "Calentamiento", section_main: "Cuerpo de la sesión", section_cooldown: "Vuelta a la calma", add_exercise_block: "Añadir ejercicio",
    send_debrief: "Enviar resumen", send_checkin: "Enviar check-in", rpe: "Esfuerzo percibido (RPE)",
    duration: "Duración real", sensations: "Sensaciones", pain_intensity: "Intensidad del dolor", zone: "Zona afectada",
    notes: "Notas", session_file: "Archivo de la sesión", no_sessions_today: "Nada programado hoy.",
    rest: "Descanso", planned: "Planificada", done: "Realizada", notifications: "Notificaciones", no_notifications: "Sin notificaciones.",
    mark_read: "Marcar todo como leído", make_debrief: "Enviar resumen de sesión", logout: "Cerrar sesión", minutes: "minutos",
    vfc_night: "VFC nocturna", rest_hr: "FC reposo", hooper_score: "Puntuación Hooper", sleep: "Sueño", last_rpe: "Último RPE",
    pain: "Dolor", sleep_hooper_trend: "Sueño y puntuación Hooper", green_light: "Vía libre", amber_light: "Correcto — vigila la carga",
    red_light: "Se recomienda precaución", quality: "Calidad", hours: "Horas", value: "Valor", session_name: "Nombre de la sesión",
    no_data: "Aún no hay datos.", latest_checkin: "Último check-in", hrv: "VFC",
    hooper_fatigue: "Fatiga", hooper_stress: "Estrés", hooper_courbatures: "Agujetas", hooper_sommeil: "Calidad del sueño",
    good_shape: "Buena forma", tired: "Cansado", breathless: "Sin aliento", stiffness: "Rigidez", motivated: "Motivado", acute_pain: "Dolor agudo",
    shoulder_l: "Hombro Izq.", shoulder_r: "Hombro Der.", low_back: "Lumbares", knee_l: "Rodilla Izq.", knee_r: "Rodilla Der.", ankle_l: "Tobillo Izq.", ankle_r: "Tobillo Der.", other: "Otro",
    nav_nutrition: "Nutrición", nutrition_toggle: "Nutrición", nutrition_on: "Activada", nutrition_off: "Desactivada",
    profile: "Perfil", weight: "Peso (kg)", height: "Altura (cm)", age: "Edad", sex: "Sexo", male: "Hombre", female: "Mujer",
    goal: "Objetivo", goal_perf: "Rendimiento", goal_lean: "Definición", goal_maintenance: "Mantenimiento",
    diet_prefs: "Preferencias alimentarias", vegetarian: "Vegetariano", gluten_free: "Sin gluten", dairy_free: "Sin lactosa",
    daily_targets: "Objetivos del día", kcal: "kcal", carbs: "Carbohidratos", protein: "Proteína", fat: "Grasa",
    load_rest: "Descanso", load_moderate: "Moderada", load_high: "Alta", load_very_high: "Muy alta", training_load: "Carga del día",
    meal_plan: "Plan del día", breakfast: "Desayuno", lunch: "Comida", dinner: "Cena", snack: "Tentempié",
    swap_meal: "Cambiar", no_recipe: "Ninguna receta disponible con estos filtros", save_profile: "Guardar perfil",
    nutrition_disabled_athlete: "Nutrición no activada para este atleta.", enable_nutrition_hint: "Actívala desde la pestaña Atletas.",
    total_vs_target: "Total del día vs objetivo",
    fueling_window: "Ventana nutricional de la sesión", pre_session: "Antes", during_session: "Durante", post_session: "Después",
    hours_before: "h antes", per_hour: "/h", fluid: "Fluidos", easy_run: "Rodaje suave", quality_session: "Sesión de calidad", long_run: "Tirada larga",
    carb_loading_note: "Sesión >2h: recuerda cargar carbohidratos el día antes (10-12 g/kg/día) — ver guía SiS.",
    guide_source: "Cifras de la guía SiS Marathon Fuelling", no_endurance_today: "Sin sesión de resistencia hoy.",
    based_on_debrief: "Ajustado según el resumen real",
    during_fuel_plan: "Nutrición durante el esfuerzo", fuel_gel: "Geles", fuel_drink: "Bebida", fuel_bar: "Barritas",
    units_needed: "unidades", total_fluid: "Líquidos totales", fuel_timeline: "Tomas durante el esfuerzo", at_minute: "a los",
    choose_ingredients: "Elegir alimentos", validate: "Confirmar", cancel: "Cancelar", to_prepare: "a preparar",
    select_ingredients_hint: "Elige de 1 a 4 alimentos — la app calcula la cantidad de cada uno.", custom_meal: "Comida personalizada",
    training_time: "Hora de entrenamiento", pre_meal_tag: "Comida pre-sesión", post_meal_tag: "Comida post-sesión",
    meal_time_hint: "El reparto de comidas se ajusta según esta hora.",
    race_objective: "Objetivo de carrera", race_mode_none: "Normal", race_mode_carb_load: "Carga de carbohidratos",
    race_mode_race_day: "Día de carrera", carb_load_active_note: "Carga activa: 12 g/kg/día de carbohidratos durante al menos 2 días (alimentos bajos en fibra, bebidas/snacks con carbohidratos recomendados).",
    race_day_plan: "Plan del día de carrera", pre_race_meal: "Comida pre-carrera", in_race_fueling: "Nutrición durante la carrera",
    post_race_recovery: "Recuperación post-carrera", race_duration: "Duración prevista de la carrera",
    dual_source_note: "Se recomienda una formulación de doble fuente (maltodextrina + fructosa) por encima de 80g/h.",
    tier1_decision: "Decisión", tier2_determinants: "Determinantes", tier3_analysis: "Análisis avanzado",
    readiness_score: "Readiness Score", risk_low: "Riesgo bajo", risk_moderate: "Riesgo moderado", risk_high: "Riesgo alto",
    load_label: "Carga (aguda vs crónica)", hrv_label: "VFC", rhr_label: "FC reposo", sleep_label: "Sueño",
    temp_label: "Temperatura nocturna", pain_label: "Dolor", rpe_label: "RPE del día anterior", monotony_label: "Monotonía",
    action_maintain: "Mantener la sesión", action_reduce_volume_20: "Reducir el volumen un 20 %", action_reduce_intensity: "Reducir la intensidad",
    action_active_recovery: "Sustituir por recuperación activa", action_rest: "Descanso recomendado",
    rationale_acute_pain: "Dolor agudo o de intensidad alta reportado — prioridad a la protección tisular.",
    rationale_spike: "Carga semanal un {v} % más alta que la semana anterior.",
    rationale_ok: "Indicadores de recuperación y carga dentro del rango habitual del atleta.",
    rationale_drivers: "Señal(es) más deteriorada(s): {v}.",
    acute_load_label: "Carga aguda (EWMA 7d)", chronic_load_label: "Carga crónica (EWMA {n}d)", weekly_change_label: "Variación semanal",
    vs_individual_avg: "vs media individual", monthly_load: "Carga mensual", weekly_load: "Carga semanal",
    discipline_breakdown: "Reparto por disciplina", no_history_yet: "Historial insuficiente para este cálculo.",
    chronic_window: "Ventana de carga crónica", show_analysis: "Ver análisis avanzado", hide_analysis: "Ocultar análisis avanzado",
    trend_up: "En subida", trend_down: "En bajada", trend_stable: "Estable",
    tooltip_acute: "Carga de entrenamiento reciente (últimos 7 días), suavizada con media móvil exponencial.",
    tooltip_chronic: "Carga de entrenamiento de fondo, suavizada en {n} días — refleja la forma acumulada.",
    tooltip_weekly_change: "Variación de la carga total de esta semana respecto a la anterior.",
    tooltip_monotony: "Carga media / desviación estándar en 7 días (Foster, 1998). Alta = poca variación diaria.",
    tooltip_strain: "Carga semanal × monotonía (Foster, 1998). Combina alto volumen y baja variabilidad.",
    night_temp_hint: "Desviación proporcionada directamente por tu reloj conectado respecto a tu temperatura de referencia (normalmente entre -1 y +1°C). Una desviación marcada puede indicar fatiga o el inicio de una infección.",
    hormonal_toggle: "Seguimiento hormonal", nav_cycle: "Ciclo", hormonal_readiness: "Hormonal Readiness",
    hri_disclaimer: "El HRI es un indicador propietario, no validado clínicamente. No es una puntuación médica ni una herramienta de diagnóstico. Nunca sustituye una opinión médica.",
    level_optimal: "Óptimo", level_good: "Bueno", level_to_monitor: "A vigilar", level_probable_hormonal_fatigue: "Fatiga hormonal probable", level_significant_symptoms: "Síntomas importantes",
    symptom_pain: "Dolor", symptom_cramps: "Calambres", symptom_fatigue: "Fatiga", symptom_mood: "Estado de ánimo", symptom_irritability: "Irritabilidad",
    symptom_motivation: "Motivación", symptom_energy: "Nivel de energía", symptom_concentration: "Concentración", symptom_digestive: "Molestias digestivas",
    symptom_heavy_legs: "Piernas pesadas", symptom_breast_tenderness: "Sensibilidad mamaria", symptom_migraines: "Migrañas", symptom_sleep_quality: "Calidad de sueño percibida",
    hormonal_factor_hrv: "VFC", hormonal_factor_rhr: "FC reposo", hormonal_factor_temp: "Temperatura nocturna", hormonal_factor_sleep_duration: "Duración del sueño",
    hormonal_factor_sleep_efficiency: "Eficiencia del sueño", hormonal_factor_load: "Carga (aguda vs crónica)", hormonal_factor_weekly_change: "Variación semanal",
    hormonal_factor_monotony: "Monotonía", hormonal_factor_rpe: "RPE del día anterior", hormonal_factor_ms_pain: "Dolor musculoesquelético", hormonal_factor_cycle: "Contexto del ciclo",
    hormonal_action_maintain: "Mantener el entrenamiento", hormonal_action_reduce_volume: "Reducir el volumen", hormonal_action_reduce_intensity: "Reducir la intensidad",
    hormonal_action_split_session: "Fraccionar la sesión", hormonal_action_increase_recovery_time: "Aumentar el tiempo de recuperación", hormonal_action_postpone_intense_session: "Posponer la sesión intensa",
    hormonal_rationale_optimal: "Síntomas, fisiología y carga dentro del rango habitual.", hormonal_rationale_good: "Ninguna señal preocupante hoy.",
    hormonal_rationale_monitor: "Factor(es) a vigilar: {v}.", hormonal_rationale_fatigue: "Signos de fatiga hormonal probable relacionados con: {v}.", hormonal_rationale_severe: "Síntoma(s) importante(s) reportado(s): {v}.",
    cycle_day: "Día del ciclo", cycle_length: "Duración media del ciclo", cycle_regularity: "Regularidad", regularity_regular: "Regular", regularity_somewhat_irregular: "Poco regular", regularity_irregular: "Irregular", regularity_unknown: "Desconocida",
    is_menstruating: "Menstruación en curso", contraception: "Anticoncepción hormonal", contraception_none: "Ninguna", contraception_combined_pill: "Píldora combinada", contraception_progestin_only: "Píldora solo de progestágeno",
    contraception_iud_hormonal: "DIU hormonal", contraception_iud_copper: "DIU de cobre", contraception_implant: "Implante", contraception_patch_ring: "Parche / anillo", contraception_other: "Otra",
    pregnant_postpartum: "Embarazo / posparto", perimenopausal: "Perimenopausia", symptoms_settings: "Síntomas seguidos", save_cycle_checkin: "Guardar",
    hormonal_detail: "Detalle", hormonal_symptoms_today: "Síntomas de hoy", hormonal_trends: "Tendencias", hormonal_biomarkers: "Biomarcadores", hormonal_recommendation: "Recomendación",
    top_factors: "Principales factores", cycle_history: "Historial del ciclo", not_tracked_yet: "Aún no hay check-in hoy.",
    carbs_per_hour_strategy: "Estrategia de carbohidratos/h", outside_guide_range: "Fuera del rango recomendado por la guía ({min}-{max}g/h) para este tipo de sesión.",
  },
};
function useT(lang) { return (key) => DICT[lang]?.[key] ?? DICT.fr[key] ?? key; }

// ============================================================================
// WORKLOAD / READINESS ENGINE
// ----------------------------------------------------------------------------
// JS port of the standalone, framework-agnostic TypeScript module shipped
// alongside this app (see /workload/*.ts — same functions, same tests,
// same documentation and scientific references). It's inlined here because
// this artifact runs as a single browser file with no bundler/TS build
// step; if this app is later moved into a real Next.js/Prisma project, this
// whole section can be deleted and replaced by pulling computeAthleteReadinessReport
// in from the standalone /workload module shipped alongside this file.
//
// Replaces any Acute:Chronic Workload Ratio (ACWR) approach with:
//   - EWMA-based acute (7d) / chronic (28d, switchable to 42d) load
//   - week-on-week load change (%) instead of a ratio
//   - Foster's Monotony & Strain
//   - a multivariate Athlete Readiness Engine (load + HRV + resting HR +
//     sleep + night temperature + pain + RPE + monotony), each compared to
//     the athlete's own baseline, producing one 0-100 score
//   - a rule-based recommendation layer on top of the score
//
// See workload/ewma.ts and workload/readiness.ts for the full rationale and
// references (Impellizzeri et al. 2020 IJSPP; Windt & Gabbett 2019 BJSM;
// Lolli et al. 2019 BJSM; Menaspà 2017 Sports Med; Buchheit 2014 Front
// Physiol; Foster 1998 MSSE; Bourdon et al. 2017 IOC consensus statement).
// ============================================================================

// ---- ewma.ts -----------------------------------------------------------
function calculateEWMA(data, timeConstantDays) {
  if (!data.length) return [];
  if (timeConstantDays <= 0) throw new Error("calculateEWMA: timeConstantDays must be positive");
  const lambda = 2 / (timeConstantDays + 1);
  let running = data[0].value;
  return data.map((point, i) => {
    running = i === 0 ? point.value : point.value * lambda + running * (1 - lambda);
    return { ...point, ewma: running };
  });
}
function latestEWMA(data, timeConstantDays) {
  const series = calculateEWMA(data, timeConstantDays);
  return series.length ? series[series.length - 1].ewma : 0;
}

// ---- acute.ts / chronic.ts ----------------------------------------------
const ACUTE_TIME_CONSTANT_DAYS = 7;
const DEFAULT_CHRONIC_TIME_CONSTANT_DAYS = 28;
const CHRONIC_TIME_CONSTANT_OPTIONS = [28, 42];
function computeAcuteLoad(dailyLoads) { return latestEWMA(dailyLoads, ACUTE_TIME_CONSTANT_DAYS); }
function computeAcuteLoadSeries(dailyLoads) { return calculateEWMA(dailyLoads, ACUTE_TIME_CONSTANT_DAYS); }
function computeChronicLoad(dailyLoads, config = {}) { return latestEWMA(dailyLoads, config.timeConstantDays ?? DEFAULT_CHRONIC_TIME_CONSTANT_DAYS); }
function computeChronicLoadSeries(dailyLoads, config = {}) { return calculateEWMA(dailyLoads, config.timeConstantDays ?? DEFAULT_CHRONIC_TIME_CONSTANT_DAYS); }

// ---- monotony.ts ----------------------------------------------------------
function computeMonotony(dailyLoads7d) {
  if (!dailyLoads7d.length) return { monotony: 0, mean: 0, standardDeviation: 0 };
  const mean = dailyLoads7d.reduce((s, v) => s + v, 0) / dailyLoads7d.length;
  const variance = dailyLoads7d.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyLoads7d.length;
  const sd = Math.sqrt(variance);
  const monotony = sd === 0 ? (mean === 0 ? 0 : 5) : mean / sd;
  return { monotony, mean, standardDeviation: sd };
}

// ---- strain.ts --------------------------------------------------------
function computeStrain(weeklyLoad, monotony) { return weeklyLoad * monotony; }

// ---- weeklyChange.ts ----------------------------------------------------
function computeWeeklyLoadChange(currentWeekLoad, previousWeekLoad) {
  const absoluteChange = currentWeekLoad - previousWeekLoad;
  const percentChange = previousWeekLoad === 0 ? 0 : (absoluteChange / previousWeekLoad) * 100;
  return { currentWeekLoad, previousWeekLoad, absoluteChange, percentChange };
}

// ---- readiness.ts ---------------------------------------------------------
const DEFAULT_READINESS_WEIGHTS = { load: 0.2, hrv: 0.2, restingHeartRate: 0.1, sleep: 0.15, temperature: 0.05, pain: 0.15, rpe: 0.1, monotony: 0.05 };
const rClamp = (v, min, max) => Math.min(max, Math.max(min, v));
function softPenaltyScore(absDeviation, freeZone, fullPenaltyAt) {
  const excess = Math.max(0, absDeviation - freeZone);
  const span = Math.max(1e-6, fullPenaltyAt - freeZone);
  return 100 * (1 - rClamp(excess / span, 0, 1));
}
function loadSubscore(inputs) {
  const { acuteLoad7d, chronicLoad28d, weeklyLoadChangePercent } = inputs;
  if (acuteLoad7d == null || chronicLoad28d == null) return null;
  const deltaPercent = chronicLoad28d === 0 ? 0 : ((acuteLoad7d - chronicLoad28d) / chronicLoad28d) * 100;
  const deltaScore = softPenaltyScore(Math.abs(deltaPercent), 20, 80);
  const changeScore = weeklyLoadChangePercent == null ? 100 : softPenaltyScore(Math.abs(weeklyLoadChangePercent), 15, 60);
  return Math.min(deltaScore, changeScore);
}
function baselineZScore(stat, higherIsBetter) {
  if (!stat.individualSd) return 70;
  const z = (stat.today - stat.individualMean) / stat.individualSd;
  const oriented = higherIsBetter ? z : -z;
  return rClamp(50 + oriented * 20, 0, 100);
}
function sleepSubscore(hours, quality) {
  if (hours == null && quality == null) return null;
  const hoursScore = hours == null ? 70 : rClamp(100 - Math.abs(hours - 8) * 18, 0, 100);
  const qualityScore = quality == null ? 70 : rClamp(quality * 20, 0, 100);
  return (hoursScore + qualityScore) / 2;
}
function temperatureSubscore(deltaC) { return deltaC == null ? null : softPenaltyScore(Math.abs(deltaC), 0.2, 1.0); }
function painSubscore(pain, hasAcuteFlareUp) {
  if (pain == null) return null;
  const base = rClamp(100 - pain * 10, 0, 100);
  return hasAcuteFlareUp ? Math.min(base, 30) : base;
}
function rpeSubscore(rpe) { return rpe == null ? null : rClamp(100 - Math.max(0, rpe - 6) * 15, 0, 100); }
function monotonySubscore(monotony) { return monotony == null ? null : softPenaltyScore(Math.max(0, monotony - 1.0), 0.5, 1.5); }

function computeReadiness(inputs, weights = DEFAULT_READINESS_WEIGHTS) {
  const raw = [
    { key: "load", label: "load_label", score: loadSubscore(inputs) },
    { key: "hrv", label: "hrv_label", score: inputs.hrv ? baselineZScore(inputs.hrv, true) : null },
    { key: "restingHeartRate", label: "rhr_label", score: inputs.restingHeartRate ? baselineZScore(inputs.restingHeartRate, false) : null },
    { key: "sleep", label: "sleep_label", score: sleepSubscore(inputs.sleepHours, inputs.sleepQuality) },
    { key: "temperature", label: "temp_label", score: temperatureSubscore(inputs.nightTemperatureDeltaC) },
    { key: "pain", label: "pain_label", score: painSubscore(inputs.pain, inputs.hasAcuteFlareUp) },
    { key: "rpe", label: "rpe_label", score: rpeSubscore(inputs.yesterdayRPE) },
    { key: "monotony", label: "monotony_label", score: monotonySubscore(inputs.monotony) },
  ];
  const available = raw.filter(r => r.score != null);
  const totalWeight = available.reduce((s, r) => s + weights[r.key], 0) || 1;
  const subscores = raw.map(r => ({
    key: r.key, label: r.label, score: r.score ?? 70,
    weight: r.score == null ? 0 : weights[r.key] / totalWeight,
    available: r.score != null,
  }));
  const score = Math.round(subscores.reduce((s, x) => s + x.score * x.weight, 0));
  const riskLevel = score >= 75 ? "low" : score >= 50 ? "moderate" : "high";
  return { score, riskLevel, subscores };
}

// ---- recommendations.ts ------------------------------------------------
function generateRecommendation(readiness, inputs) {
  if (inputs.hasAcuteFlareUp || (inputs.pain != null && inputs.pain >= 7)) {
    return { action: "rest", riskLevel: "high", rationaleKey: "rationale_acute_pain" };
  }
  if (inputs.weeklyLoadChangePercent != null && inputs.weeklyLoadChangePercent > 60) {
    return { action: "reduce_volume_20", riskLevel: "high", rationaleKey: "rationale_spike", rationaleValue: Math.round(inputs.weeklyLoadChangePercent) };
  }
  if (readiness.score >= 75) return { action: "maintain", riskLevel: readiness.riskLevel, rationaleKey: "rationale_ok" };
  if (readiness.score >= 60) {
    const drivenByIntensity = [inputs.yesterdayRPE, inputs.pain].some(v => v != null && v >= 6);
    return { action: drivenByIntensity ? "reduce_intensity" : "reduce_volume_20", riskLevel: readiness.riskLevel, rationaleKey: "rationale_drivers", drivers: weakestDrivers(readiness) };
  }
  if (readiness.score >= 45) return { action: "active_recovery", riskLevel: readiness.riskLevel, rationaleKey: "rationale_drivers", drivers: weakestDrivers(readiness) };
  return { action: "rest", riskLevel: "high", rationaleKey: "rationale_drivers", drivers: weakestDrivers(readiness) };
}
function weakestDrivers(readiness) {
  return readiness.subscores.filter(s => s.available).sort((a, b) => a.score - b.score).slice(0, 2).map(s => s.label);
}

// ---- index.ts (orchestration) ------------------------------------------
function computeWorkloadSnapshot(dailyLoads, chronicConfig = {}) {
  const acuteLoad7d = computeAcuteLoad(dailyLoads);
  const chronicLoad28d = computeChronicLoad(dailyLoads, chronicConfig);
  const loadDelta = acuteLoad7d - chronicLoad28d;
  const loadDeltaPercent = chronicLoad28d === 0 ? 0 : (loadDelta / chronicLoad28d) * 100;
  const last7 = dailyLoads.slice(-7).map(d => d.value);
  const previous7 = dailyLoads.slice(-14, -7).map(d => d.value);
  const currentWeekLoad = last7.reduce((a, b) => a + b, 0);
  const previousWeekLoad = previous7.reduce((a, b) => a + b, 0);
  const { percentChange } = computeWeeklyLoadChange(currentWeekLoad, previousWeekLoad);
  const { monotony } = computeMonotony(last7);
  const strain = computeStrain(currentWeekLoad, monotony);
  const last30 = dailyLoads.slice(-30).map(d => d.value);
  const monthlyLoad = last30.reduce((a, b) => a + b, 0);
  return { acuteLoad7d, chronicLoad28d, loadDelta, loadDeltaPercent, weeklyLoadChangePercent: percentChange, monotony, strain, weeklyLoad: currentWeekLoad, monthlyLoad };
}
function computeAthleteReadinessReport(dailyLoads, recoveryInputs, options = {}) {
  const snapshot = computeWorkloadSnapshot(dailyLoads, options.chronicConfig);
  const fullInputs = { ...recoveryInputs, acuteLoad7d: snapshot.acuteLoad7d, chronicLoad28d: snapshot.chronicLoad28d, weeklyLoadChangePercent: snapshot.weeklyLoadChangePercent, monotony: snapshot.monotony };
  const readiness = computeReadiness(fullInputs, options.weights ?? DEFAULT_READINESS_WEIGHTS);
  const recommendation = generateRecommendation(readiness, fullInputs);
  return { snapshot, readiness, recommendation };
}

// ============================================================================
// HORMONAL READINESS ENGINE (HRE) — option spécifique aux athlètes féminines
// ----------------------------------------------------------------------------
// JS port du module TypeScript autonome /hormonal (mêmes fonctions, mêmes
// tests — 20/20 passés — mêmes références). Inline ici pour la même raison
// que le moteur de charge : cet artifact n'a pas de bundler/étape de build.
//
// AVERTISSEMENT NON NÉGOCIABLE — à afficher partout où le HRI apparaît :
// Le Hormonal Readiness Index (HRI) est un indicateur PROPRIÉTAIRE, NON
// VALIDÉ CLINIQUEMENT. Ce n'est ni un score médical ni un outil diagnostique.
// Il s'appuie sur les connaissances scientifiques actuelles concernant les
// interactions entre cycle menstruel, symptômes, récupération et charge
// d'entraînement, dans le seul but d'aider à personnaliser l'entraînement.
// Il ne remplace jamais un avis médical.
//
// Toutes les pondérations vivent dans un seul endroit (HORMONAL_WEIGHTS,
// juste en dessous) — voir hormonal/hormonalWeights.ts pour la version
// portable et sa documentation complète, y compris pourquoi le poids de la
// phase du cycle est à 0 par défaut (aucune règle fixe basée sur la seule
// phase théorique — Elliott-Sale et al., 2021, Sports Med).
// ============================================================================

const SYMPTOM_DEFINITIONS = [
  { key: "pain", labelKey: "symptom_pain", direction: "worse" },
  { key: "cramps", labelKey: "symptom_cramps", direction: "worse" },
  { key: "fatigue", labelKey: "symptom_fatigue", direction: "worse" },
  { key: "mood", labelKey: "symptom_mood", direction: "better" },
  { key: "irritability", labelKey: "symptom_irritability", direction: "worse" },
  { key: "motivation", labelKey: "symptom_motivation", direction: "better" },
  { key: "energy", labelKey: "symptom_energy", direction: "better" },
  { key: "concentration", labelKey: "symptom_concentration", direction: "better" },
  { key: "digestive", labelKey: "symptom_digestive", direction: "worse" },
  { key: "heavyLegs", labelKey: "symptom_heavy_legs", direction: "worse" },
  { key: "breastTenderness", labelKey: "symptom_breast_tenderness", direction: "worse" },
  { key: "migraines", labelKey: "symptom_migraines", direction: "worse" },
  { key: "sleepQualityPerceived", labelKey: "symptom_sleep_quality", direction: "better" },
];

const DEFAULT_ENABLED_SYMPTOMS = { pain: true, cramps: true, fatigue: true, mood: true, irritability: true, motivation: true, energy: true, concentration: true, digestive: true, heavyLegs: true, breastTenderness: true, migraines: true, sleepQualityPerceived: true };
const DEFAULT_SYMPTOM_WEIGHTS = { pain: 1.3, cramps: 1.2, fatigue: 1.2, mood: 0.9, irritability: 0.8, motivation: 0.9, energy: 1.0, concentration: 0.7, digestive: 0.7, heavyLegs: 0.7, breastTenderness: 0.5, migraines: 1.1, sleepQualityPerceived: 1.0 };
const DEFAULT_PHYSIOLOGY_WEIGHTS_H = { hrv: 0.35, restingHeartRate: 0.2, nightTemperature: 0.2, sleepDuration: 0.15, sleepEfficiency: 0.1 };
const DEFAULT_TRAINING_CONTEXT_WEIGHTS_H = { loadDelta: 0.3, weeklyChange: 0.25, monotony: 0.15, yesterdayRPE: 0.15, musculoskeletalPain: 0.15 };
const DEFAULT_CATEGORY_WEIGHTS_H = { symptoms: 0.45, physiology: 0.3, trainingContext: 0.25, cycleContext: 0 };
const HORMONAL_WEIGHTS = { categories: DEFAULT_CATEGORY_WEIGHTS_H, symptoms: DEFAULT_SYMPTOM_WEIGHTS, enabledSymptoms: DEFAULT_ENABLED_SYMPTOMS, physiology: DEFAULT_PHYSIOLOGY_WEIGHTS_H, trainingContext: DEFAULT_TRAINING_CONTEXT_WEIGHTS_H };

const HRI_DISCLAIMER = {
  fr: "Le Hormonal Readiness Index (HRI) est un indicateur propriétaire, non validé cliniquement. Ce n'est ni un score médical ni un outil diagnostique. Il s'appuie sur les connaissances scientifiques actuelles concernant les interactions entre le cycle menstruel, les symptômes, la récupération et la charge d'entraînement, dans le seul but d'aider à personnaliser l'entraînement. Il ne remplace jamais un avis médical.",
  en: "The Hormonal Readiness Index (HRI) is a proprietary indicator, not clinically validated. It is not a medical score and not a diagnostic tool. It is based on current scientific understanding of interactions between the menstrual cycle, symptoms, recovery and training load, and is intended only to support training personalisation. It never replaces medical advice.",
  es: "El Hormonal Readiness Index (HRI) es un indicador propietario, no validado clínicamente. No es una puntuación médica ni una herramienta de diagnóstico. Se basa en el conocimiento científico actual sobre las interacciones entre el ciclo menstrual, los síntomas, la recuperación y la carga de entrenamiento, con el único fin de ayudar a personalizar el entrenamiento. Nunca sustituye una opinión médica.",
};

function symptomToScore(rawValue, direction) {
  const clamped = Math.min(10, Math.max(0, rawValue));
  return direction === "worse" ? 100 - clamped * 10 : clamped * 10;
}
function computeSymptomFactors(values, enabled, weights, labelResolver) {
  return SYMPTOM_DEFINITIONS.filter(def => enabled[def.key] && values[def.key] != null).map(def => ({
    key: def.key, label: labelResolver(def.labelKey), score: symptomToScore(values[def.key], def.direction),
    weight: weights[def.key] ?? 1, category: "symptom",
  }));
}

function hBaselineZScore(stat, higherIsBetter) {
  if (!stat.individualSd) return 70;
  const z = (stat.today - stat.individualMean) / stat.individualSd;
  const oriented = higherIsBetter ? z : -z;
  return rClamp(50 + oriented * 20, 0, 100);
}
function computePhysiologyFactorsH(inputs, weights, t) {
  const factors = [];
  if (inputs.hrv) factors.push({ key: "hrv", label: t("hormonal_factor_hrv"), score: hBaselineZScore(inputs.hrv, true), weight: weights.hrv, category: "physiology" });
  if (inputs.restingHeartRate) factors.push({ key: "restingHeartRate", label: t("hormonal_factor_rhr"), score: hBaselineZScore(inputs.restingHeartRate, false), weight: weights.restingHeartRate, category: "physiology" });
  if (inputs.nightTemperatureDeltaC != null) factors.push({ key: "nightTemperature", label: t("hormonal_factor_temp"), score: softPenaltyScore(Math.abs(inputs.nightTemperatureDeltaC), 0.2, 1.0), weight: weights.nightTemperature, category: "physiology" });
  if (inputs.sleepHours != null) factors.push({ key: "sleepDuration", label: t("hormonal_factor_sleep_duration"), score: rClamp(100 - Math.abs(inputs.sleepHours - 8) * 18, 0, 100), weight: weights.sleepDuration, category: "physiology" });
  if (inputs.sleepEfficiencyPercent != null) factors.push({ key: "sleepEfficiency", label: t("hormonal_factor_sleep_efficiency"), score: rClamp(inputs.sleepEfficiencyPercent, 0, 100), weight: weights.sleepEfficiency, category: "physiology" });
  return factors;
}

function computeTrainingContextFactorsH(inputs, weights, t) {
  const factors = [];
  if (inputs.acuteLoad7d != null && inputs.chronicLoad28d != null) {
    const deltaPercent = inputs.chronicLoad28d === 0 ? 0 : ((inputs.acuteLoad7d - inputs.chronicLoad28d) / inputs.chronicLoad28d) * 100;
    factors.push({ key: "loadDelta", label: t("hormonal_factor_load"), score: softPenaltyScore(Math.abs(deltaPercent), 20, 80), weight: weights.loadDelta, category: "training" });
  }
  if (inputs.weeklyLoadChangePercent != null) factors.push({ key: "weeklyChange", label: t("hormonal_factor_weekly_change"), score: softPenaltyScore(Math.abs(inputs.weeklyLoadChangePercent), 15, 60), weight: weights.weeklyChange, category: "training" });
  if (inputs.monotony != null) factors.push({ key: "monotony", label: t("hormonal_factor_monotony"), score: softPenaltyScore(Math.max(0, inputs.monotony - 1.0), 0.5, 1.5), weight: weights.monotony, category: "training" });
  if (inputs.yesterdayRPE != null) factors.push({ key: "yesterdayRPE", label: t("hormonal_factor_rpe"), score: rClamp(100 - Math.max(0, inputs.yesterdayRPE - 6) * 15, 0, 100), weight: weights.yesterdayRPE, category: "training" });
  if (inputs.musculoskeletalPain != null) factors.push({ key: "musculoskeletalPain", label: t("hormonal_factor_ms_pain"), score: rClamp(100 - inputs.musculoskeletalPain * 10, 0, 100), weight: weights.musculoskeletalPain, category: "training" });
  return factors;
}

function computeCycleContextScore(cycle) {
  if (!cycle) return null;
  if (cycle.regularity === "irregular") return 60;
  if (cycle.regularity === "unknown") return 65;
  return 70;
}
function estimateCyclePhaseLabel(cycle) {
  if (!cycle || cycle.currentCycleDay == null || !cycle.averageCycleLengthDays) return "unknown";
  if (cycle.isMenstruating) return "menstrual";
  const ovulationDay = cycle.averageCycleLengthDays - 14;
  if (cycle.currentCycleDay < ovulationDay - 2) return "follicular";
  if (cycle.currentCycleDay <= ovulationDay + 1) return "ovulatory";
  return "luteal";
}

const HORMONAL_LEVEL_RANK = { optimal: 0, good: 1, to_monitor: 2, probable_hormonal_fatigue: 3, significant_symptoms: 4 };
function hormonalLevelFromScore(score) {
  if (score >= 85) return "optimal";
  if (score >= 70) return "good";
  if (score >= 55) return "to_monitor";
  if (score >= 40) return "probable_hormonal_fatigue";
  return "significant_symptoms";
}
function combineHormonalFactors(symptomFactors, physiologyFactors, trainingFactors, cycleFactor, categoryWeights) {
  const categorised = [[symptomFactors, categoryWeights.symptoms], [physiologyFactors, categoryWeights.physiology], [trainingFactors, categoryWeights.trainingContext], [cycleFactor ? [cycleFactor] : [], categoryWeights.cycleContext]];
  const scaled = [];
  for (const [factors, categoryWeight] of categorised) {
    if (!factors.length || categoryWeight <= 0) continue;
    const internalSum = factors.reduce((s, f) => s + f.weight, 0) || 1;
    for (const f of factors) scaled.push({ ...f, weight: (f.weight / internalSum) * categoryWeight });
  }
  const totalWeight = scaled.reduce((s, f) => s + f.weight, 0) || 1;
  return scaled.map(f => ({ ...f, weight: f.weight / totalWeight }));
}
const HORMONAL_SEVERE_THRESHOLD = 8;
function hasSevereSymptom(values, enabled) {
  return SYMPTOM_DEFINITIONS.some(def => def.direction === "worse" && enabled[def.key] && (values[def.key] ?? 0) >= HORMONAL_SEVERE_THRESHOLD);
}
function computeHormonalReadiness(args) {
  const weights = args.weights ?? HORMONAL_WEIGHTS;
  const factors = combineHormonalFactors(args.symptomFactors, args.physiologyFactors, args.trainingFactors, args.cycleFactor, weights.categories);
  const score = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0));
  let level = hormonalLevelFromScore(score);
  let forcedBySevereSymptom = false;
  if (args.hasSevereSymptom && HORMONAL_LEVEL_RANK[level] < HORMONAL_LEVEL_RANK.significant_symptoms) {
    level = "significant_symptoms"; forcedBySevereSymptom = true;
  }
  const topNegativeFactors = [...factors].sort((a, b) => a.score - b.score).slice(0, 4);
  return { score, level, factors, topNegativeFactors, forcedBySevereSymptom };
}

function generateHormonalRecommendation(result) {
  const topFactorLabels = result.topNegativeFactors.filter(f => f.score < 60).map(f => f.label);
  if (result.level === "significant_symptoms") return { action: "postpone_intense_session", rationaleKey: "rationale_severe", topFactorLabels };
  if (result.level === "probable_hormonal_fatigue") {
    const drivenByTraining = result.topNegativeFactors.some(f => f.category === "training");
    return { action: drivenByTraining ? "reduce_volume" : "increase_recovery_time", rationaleKey: "rationale_fatigue", topFactorLabels };
  }
  if (result.level === "to_monitor") {
    const drivenByMuscular = result.topNegativeFactors.some(f => ["musculoskeletalPain", "pain", "cramps"].includes(f.key));
    return { action: drivenByMuscular ? "split_session" : "reduce_intensity", rationaleKey: "rationale_monitor", topFactorLabels };
  }
  if (result.level === "good") return { action: "maintain", rationaleKey: "rationale_good", topFactorLabels: [] };
  return { action: "maintain", rationaleKey: "rationale_optimal", topFactorLabels: [] };
}

function computeHormonalReadinessReport(inputs, weights, t) {
  const w = weights ?? HORMONAL_WEIGHTS;
  const symptomFactors = computeSymptomFactors(inputs.symptomValues, w.enabledSymptoms, w.symptoms, t);
  const physiologyFactors = computePhysiologyFactorsH(inputs.physiology, w.physiology, t);
  const trainingFactors = computeTrainingContextFactorsH(inputs.trainingContext, w.trainingContext, t);
  const cycleScore = computeCycleContextScore(inputs.cycle);
  const cycleFactor = cycleScore == null ? null : { key: "cycleContext", label: t("hormonal_factor_cycle"), score: cycleScore, weight: 1, category: "cycle" };
  const readiness = computeHormonalReadiness({ symptomFactors, physiologyFactors, trainingFactors, cycleFactor, hasSevereSymptom: hasSevereSymptom(inputs.symptomValues, w.enabledSymptoms), weights: w });
  const recommendation = generateHormonalRecommendation(readiness);
  return { readiness, recommendation };
}

// ============================================================
// Seed data
// ============================================================
const COACH = { username: "FabienG", password: "Fg421986$", name: "Fabien" };
const ATHLETES_SEED = [];

const DISCIPLINES = [
  { id: "run", icon: Activity, color: RED },
  { id: "bike", icon: Bike, color: BLUE },
  { id: "swim", icon: Waves, color: "#4EC9F5" },
  { id: "strength", icon: Dumbbell, color: ACCENT },
];
const ENDURANCE_INTENSITIES = ["RPE", "Allure", "Puissance", "VAM", "Zone FC", "FC cible"];
const STRENGTH_INTENSITIES = ["%RM", "%VBT", "RIR"];

// ------------------------------------------------------------------
// Nutrition
// ------------------------------------------------------------------
const DIET_TAGS = ["vegetarian", "gluten_free", "dairy_free"];
const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];

// Bibliothèque de recettes et produits (macros pour 1 portion). À enrichir par le coach.
const FOOD_LIBRARY = [
  // --- Petit-déjeuner (14) ---
  { id: "f1", slot: "breakfast", name: "Porridge flocons d'avoine, banane, miel", kcal: 480, carbs: 82, protein: 14, fat: 9, tags: ["vegetarian"] },
  { id: "f2", slot: "breakfast", name: "Œufs brouillés, pain complet, avocat", kcal: 520, carbs: 42, protein: 28, fat: 24, tags: ["gluten_free"] },
  { id: "f3", slot: "breakfast", name: "Skyr, granola, fruits rouges", kcal: 420, carbs: 55, protein: 30, fat: 8, tags: ["vegetarian"] },
  { id: "f4", slot: "breakfast", name: "Pancakes avoine, fruits rouges, sirop d'érable", kcal: 490, carbs: 78, protein: 16, fat: 12, tags: ["vegetarian"] },
  { id: "f5", slot: "breakfast", name: "Pain complet, beurre de cacahuète, banane", kcal: 460, carbs: 60, protein: 16, fat: 18, tags: ["vegetarian", "dairy_free"] },
  { id: "f6", slot: "breakfast", name: "Muesli, lait, fruits secs", kcal: 440, carbs: 68, protein: 16, fat: 12, tags: ["vegetarian"] },
  { id: "f7", slot: "breakfast", name: "Omelette, fromage, pain complet", kcal: 500, carbs: 38, protein: 30, fat: 24, tags: ["vegetarian"] },
  { id: "f8", slot: "breakfast", name: "Bowl açai, granola, fruits", kcal: 410, carbs: 66, protein: 10, fat: 11, tags: ["vegetarian", "dairy_free"] },
  { id: "f9", slot: "breakfast", name: "Toast avocat, œuf poché", kcal: 430, carbs: 34, protein: 20, fat: 24, tags: ["vegetarian"] },
  { id: "f10", slot: "breakfast", name: "Crêpes, confiture, compote", kcal: 470, carbs: 84, protein: 10, fat: 9, tags: ["vegetarian"] },
  { id: "f11", slot: "breakfast", name: "Yaourt grec, miel, noix", kcal: 380, carbs: 32, protein: 22, fat: 16, tags: ["vegetarian", "gluten_free"] },
  { id: "f12", slot: "breakfast", name: "Pain perdu, fruits rouges", kcal: 450, carbs: 70, protein: 14, fat: 12, tags: ["vegetarian"] },
  { id: "f13", slot: "breakfast", name: "Smoothie bowl, granola, graines de chia", kcal: 400, carbs: 62, protein: 12, fat: 10, tags: ["vegetarian", "dairy_free"] },
  { id: "f14", slot: "breakfast", name: "Bagel, saumon fumé, fromage frais", kcal: 480, carbs: 48, protein: 26, fat: 18, tags: [] },

  // --- Déjeuner (15) ---
  { id: "f15", slot: "lunch", name: "Riz, poulet, légumes sautés", kcal: 680, carbs: 78, protein: 45, fat: 16, tags: ["gluten_free", "dairy_free"] },
  { id: "f16", slot: "lunch", name: "Pâtes complètes, sauce tomate, thon", kcal: 640, carbs: 88, protein: 38, fat: 12, tags: ["dairy_free"] },
  { id: "f17", slot: "lunch", name: "Buddha bowl quinoa, pois chiches, tahini", kcal: 590, carbs: 70, protein: 22, fat: 20, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f18", slot: "lunch", name: "Wrap poulet, crudités, houmous", kcal: 560, carbs: 58, protein: 34, fat: 18, tags: ["dairy_free"] },
  { id: "f19", slot: "lunch", name: "Riz, saumon, edamame", kcal: 650, carbs: 66, protein: 40, fat: 22, tags: ["gluten_free", "dairy_free"] },
  { id: "f20", slot: "lunch", name: "Salade de lentilles, feta, légumes", kcal: 520, carbs: 54, protein: 24, fat: 20, tags: ["vegetarian", "gluten_free"] },
  { id: "f21", slot: "lunch", name: "Burger maison, pain complet, frites de patate douce", kcal: 720, carbs: 74, protein: 36, fat: 28, tags: [] },
  { id: "f22", slot: "lunch", name: "Poke bowl thon, riz, avocat", kcal: 610, carbs: 62, protein: 34, fat: 22, tags: ["gluten_free", "dairy_free"] },
  { id: "f23", slot: "lunch", name: "Couscous, poulet, légumes", kcal: 630, carbs: 76, protein: 38, fat: 14, tags: ["dairy_free"] },
  { id: "f24", slot: "lunch", name: "Sandwich dinde, pain complet, crudités", kcal: 540, carbs: 56, protein: 32, fat: 16, tags: ["dairy_free"] },
  { id: "f25", slot: "lunch", name: "Riz, tofu, curry de légumes", kcal: 580, carbs: 72, protein: 20, fat: 18, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f26", slot: "lunch", name: "Pâtes, boulettes de bœuf, sauce tomate", kcal: 700, carbs: 80, protein: 40, fat: 20, tags: ["dairy_free"] },
  { id: "f27", slot: "lunch", name: "Salade César, poulet grillé", kcal: 550, carbs: 32, protein: 38, fat: 26, tags: ["gluten_free"] },
  { id: "f28", slot: "lunch", name: "Chili con carne, riz", kcal: 660, carbs: 70, protein: 36, fat: 22, tags: ["gluten_free", "dairy_free"] },
  { id: "f29", slot: "lunch", name: "Falafels, houmous, pita, salade", kcal: 600, carbs: 78, protein: 20, fat: 20, tags: ["vegetarian", "dairy_free"] },

  // --- Dîner (15) ---
  { id: "f30", slot: "dinner", name: "Saumon, patate douce, brocolis", kcal: 610, carbs: 52, protein: 40, fat: 22, tags: ["gluten_free", "dairy_free"] },
  { id: "f31", slot: "dinner", name: "Tofu sauté, riz, légumes", kcal: 560, carbs: 68, protein: 26, fat: 16, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f32", slot: "dinner", name: "Bœuf maigre, semoule, courgettes", kcal: 630, carbs: 60, protein: 42, fat: 18, tags: ["dairy_free"] },
  { id: "f33", slot: "dinner", name: "Poulet rôti, purée, haricots verts", kcal: 600, carbs: 54, protein: 40, fat: 20, tags: ["gluten_free"] },
  { id: "f34", slot: "dinner", name: "Cabillaud, quinoa, épinards", kcal: 520, carbs: 46, protein: 38, fat: 14, tags: ["gluten_free", "dairy_free"] },
  { id: "f35", slot: "dinner", name: "Pâtes complètes, pesto, poulet", kcal: 660, carbs: 70, protein: 36, fat: 22, tags: [] },
  { id: "f36", slot: "dinner", name: "Curry de pois chiches, riz basmati", kcal: 580, carbs: 78, protein: 18, fat: 18, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f37", slot: "dinner", name: "Truite, riz sauvage, asperges", kcal: 540, carbs: 48, protein: 36, fat: 16, tags: ["gluten_free", "dairy_free"] },
  { id: "f38", slot: "dinner", name: "Risotto aux champignons, parmesan", kcal: 590, carbs: 74, protein: 18, fat: 18, tags: ["vegetarian", "gluten_free"] },
  { id: "f39", slot: "dinner", name: "Chili végétarien, riz complet", kcal: 550, carbs: 76, protein: 20, fat: 14, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f40", slot: "dinner", name: "Escalope de dinde, patates rôties, salade", kcal: 570, carbs: 50, protein: 38, fat: 16, tags: ["gluten_free", "dairy_free"] },
  { id: "f41", slot: "dinner", name: "Lasagnes aux légumes", kcal: 620, carbs: 64, protein: 24, fat: 24, tags: ["vegetarian"] },
  { id: "f42", slot: "dinner", name: "Soupe de légumes, pain complet, fromage", kcal: 460, carbs: 56, protein: 18, fat: 14, tags: ["vegetarian"] },
  { id: "f43", slot: "dinner", name: "Sauté de crevettes, nouilles, légumes", kcal: 550, carbs: 62, protein: 30, fat: 14, tags: ["dairy_free"] },
  { id: "f44", slot: "dinner", name: "Ratatouille, quinoa, œuf poché", kcal: 490, carbs: 52, protein: 18, fat: 18, tags: ["vegetarian", "gluten_free", "dairy_free"] },

  // --- Collations & nutrition sportive (16) ---
  { id: "f45", slot: "snack", name: "Barre maison flocons d'avoine, dattes", kcal: 220, carbs: 34, protein: 6, fat: 7, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f46", slot: "snack", name: "Fromage blanc, fruit, amandes", kcal: 260, carbs: 24, protein: 18, fat: 10, tags: ["vegetarian", "gluten_free"] },
  { id: "f47", slot: "snack", name: "Smoothie banane, lait végétal, beurre de cacahuète", kcal: 310, carbs: 38, protein: 10, fat: 12, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f48", slot: "snack", name: "Gel énergétique glucides", kcal: 100, carbs: 25, protein: 0, fat: 0, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f49", slot: "snack", name: "Gel énergétique + caféine", kcal: 100, carbs: 24, protein: 0, fat: 0, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f50", slot: "snack", name: "Boisson énergétique isotonique (bidon)", kcal: 140, carbs: 35, protein: 0, fat: 0, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f51", slot: "snack", name: "Boisson de récupération protéinée", kcal: 220, carbs: 26, protein: 20, fat: 2, tags: ["gluten_free"] },
  { id: "f52", slot: "snack", name: "Bonbons Haribo (type fraise Tagada)", kcal: 140, carbs: 34, protein: 1, fat: 0, tags: ["gluten_free", "dairy_free"] },
  { id: "f53", slot: "snack", name: "Barre énergétique dattes-noix", kcal: 200, carbs: 30, protein: 5, fat: 8, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f54", slot: "snack", name: "Barre de céréales chocolat", kcal: 180, carbs: 28, protein: 3, fat: 6, tags: ["vegetarian"] },
  { id: "f55", slot: "snack", name: "Compote de fruits (gourde)", kcal: 90, carbs: 21, protein: 0, fat: 0, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f56", slot: "snack", name: "Banane", kcal: 105, carbs: 27, protein: 1, fat: 0, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f57", slot: "snack", name: "Mix fruits secs et oléagineux", kcal: 250, carbs: 20, protein: 7, fat: 16, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f58", slot: "snack", name: "Pain d'épices", kcal: 210, carbs: 42, protein: 4, fat: 3, tags: ["vegetarian", "dairy_free"] },
  { id: "f59", slot: "snack", name: "Chocolat noir, amandes", kcal: 230, carbs: 18, protein: 5, fat: 16, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "f60", slot: "snack", name: "Gâteau de riz nature", kcal: 70, carbs: 15, protein: 1, fat: 0, tags: ["vegetarian", "gluten_free", "dairy_free"] },
];

const GOAL_PROTEIN = { perf: 1.8, lean: 2.2, maintenance: 1.6 };

// Répartition indicative des calories du jour par repas, pour dimensionner
// un repas composé manuellement par l'athlète.
const SLOT_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };

// Ingrédients de base (valeurs pour 100g) permettant à l'athlète de composer
// son propre repas ; l'app calcule ensuite le grammage nécessaire.
const INGREDIENT_LIBRARY = [
  { id: "i1", name: "Riz blanc cuit", kcal100: 130, carbs100: 28, protein100: 2.7, fat100: 0.3, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i2", name: "Riz complet cuit", kcal100: 123, carbs100: 26, protein100: 2.7, fat100: 1, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i3", name: "Flocons d'avoine", kcal100: 389, carbs100: 66, protein100: 17, fat100: 7, tags: ["vegetarian", "dairy_free"] },
  { id: "i4", name: "Poulet cuit", kcal100: 165, carbs100: 0, protein100: 31, fat100: 3.6, tags: ["gluten_free", "dairy_free"] },
  { id: "i5", name: "Saumon cuit", kcal100: 208, carbs100: 0, protein100: 20, fat100: 13, tags: ["gluten_free", "dairy_free"] },
  { id: "i6", name: "Thon au naturel", kcal100: 116, carbs100: 0, protein100: 26, fat100: 1, tags: ["gluten_free", "dairy_free"] },
  { id: "i7", name: "Œuf entier", kcal100: 155, carbs100: 1.1, protein100: 13, fat100: 11, tags: ["vegetarian", "gluten_free"] },
  { id: "i8", name: "Tofu", kcal100: 76, carbs100: 1.9, protein100: 8, fat100: 4.8, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i9", name: "Pois chiches cuits", kcal100: 164, carbs100: 27, protein100: 8.9, fat100: 2.6, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i10", name: "Quinoa cuit", kcal100: 120, carbs100: 21, protein100: 4.4, fat100: 1.9, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i11", name: "Pâtes complètes cuites", kcal100: 124, carbs100: 25, protein100: 5, fat100: 1.1, tags: ["vegetarian", "dairy_free"] },
  { id: "i12", name: "Pain complet", kcal100: 247, carbs100: 41, protein100: 13, fat100: 3.4, tags: ["vegetarian", "dairy_free"] },
  { id: "i13", name: "Patate douce cuite", kcal100: 86, carbs100: 20, protein100: 1.6, fat100: 0.1, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i14", name: "Avocat", kcal100: 160, carbs100: 9, protein100: 2, fat100: 15, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i15", name: "Banane", kcal100: 89, carbs100: 23, protein100: 1.1, fat100: 0.3, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i16", name: "Skyr / fromage blanc", kcal100: 63, carbs100: 4, protein100: 11, fat100: 0.2, tags: ["vegetarian", "gluten_free"] },
  { id: "i17", name: "Amandes", kcal100: 579, carbs100: 22, protein100: 21, fat100: 50, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i18", name: "Brocolis cuits", kcal100: 35, carbs100: 7, protein100: 2.4, fat100: 0.4, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i19", name: "Beurre de cacahuète", kcal100: 588, carbs100: 20, protein100: 25, fat100: 50, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i20", name: "Lait végétal (amande)", kcal100: 17, carbs100: 1, protein100: 0.6, fat100: 1.4, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i21", name: "Dinde cuite", kcal100: 135, carbs100: 0, protein100: 29, fat100: 1.7, tags: ["gluten_free", "dairy_free"] },
  { id: "i22", name: "Bœuf maigre cuit", kcal100: 182, carbs100: 0, protein100: 27, fat100: 8, tags: ["gluten_free", "dairy_free"] },
  { id: "i23", name: "Crevettes cuites", kcal100: 99, carbs100: 0.2, protein100: 24, fat100: 0.3, tags: ["gluten_free", "dairy_free"] },
  { id: "i24", name: "Cabillaud cuit", kcal100: 105, carbs100: 0, protein100: 23, fat100: 0.9, tags: ["gluten_free", "dairy_free"] },
  { id: "i25", name: "Lentilles cuites", kcal100: 116, carbs100: 20, protein100: 9, fat100: 0.4, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i26", name: "Haricots rouges cuits", kcal100: 127, carbs100: 23, protein100: 8.7, fat100: 0.5, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i27", name: "Semoule cuite", kcal100: 112, carbs100: 23, protein100: 3.8, fat100: 0.2, tags: ["vegetarian", "dairy_free"] },
  { id: "i28", name: "Pommes de terre cuites", kcal100: 87, carbs100: 20, protein100: 1.9, fat100: 0.1, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i29", name: "Fromage blanc 0%", kcal100: 47, carbs100: 4, protein100: 8, fat100: 0.2, tags: ["vegetarian", "gluten_free"] },
  { id: "i30", name: "Mozzarella", kcal100: 280, carbs100: 2.2, protein100: 22, fat100: 21, tags: ["vegetarian", "gluten_free"] },
  { id: "i31", name: "Parmesan râpé", kcal100: 392, carbs100: 3.2, protein100: 35, fat100: 26, tags: ["vegetarian", "gluten_free"] },
  { id: "i32", name: "Noix de cajou", kcal100: 553, carbs100: 30, protein100: 18, fat100: 44, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i33", name: "Graines de chia", kcal100: 486, carbs100: 42, protein100: 17, fat100: 31, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i34", name: "Miel", kcal100: 304, carbs100: 82, protein100: 0.3, fat100: 0, tags: ["gluten_free", "dairy_free"] },
  { id: "i35", name: "Pomme", kcal100: 52, carbs100: 14, protein100: 0.3, fat100: 0.2, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i36", name: "Épinards cuits", kcal100: 23, carbs100: 3.6, protein100: 2.9, fat100: 0.4, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i37", name: "Courgettes cuites", kcal100: 17, carbs100: 3.1, protein100: 1.2, fat100: 0.3, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i38", name: "Huile d'olive", kcal100: 884, carbs100: 0, protein100: 0, fat100: 100, tags: ["vegetarian", "gluten_free", "dairy_free"] },
  { id: "i39", name: "Yaourt grec nature", kcal100: 97, carbs100: 4, protein100: 9, fat100: 5, tags: ["vegetarian", "gluten_free"] },
  { id: "i40", name: "Granola maison", kcal100: 450, carbs100: 60, protein100: 10, fat100: 18, tags: ["vegetarian", "dairy_free"] },
];

// Produits de nutrition à l'effort — mêmes catégories que le guide SiS
// (gel, boisson isotonique, barre/chew solide), avec teneur en glucides
// typique par unité, pour construire un plan de prise pendant la séance.
const FUEL_PRODUCTS = [
  { id: "gel", type: "gel", name: "Gel énergétique", carbsPerUnit: 22, fluidMl: 0 },
  { id: "drink", type: "drink", name: "Boisson isotonique (bidon)", carbsPerUnit: 36, fluidMl: 500 },
  { id: "bar", type: "bar", name: "Barre / chews énergétiques", carbsPerUnit: 30, fluidMl: 0 },
];

// Durée d'une séance : réelle (debrief) si disponible, sinon planifiée (builder).
function sessionMinutes(session, debrief) {
  if (debrief && debrief.duration) return Number(debrief.duration) || 0;
  return session.items.reduce((a, it) => a + (Number(it.time) || 0) * (Number(it.series) || 1), 0);
}
// Intensité d'une séance : RPE réel (debrief) si disponible, sinon items planifiés.
function sessionIsHighIntensity(session, debrief) {
  if (debrief && debrief.rpe != null) return Number(debrief.rpe) >= 6;
  return session.items.some(isHighIntensityItem);
}

// Estimation de la charge du jour (0-3) à partir des séances — utilise le
// debrief réel une fois rempli, sinon la séance planifiée.
function dayLoadLevel(daySessions, dayDebriefs) {
  const totalMin = (daySessions || []).reduce((sum, s) => sum + sessionMinutes(s, (dayDebriefs || {})[s.id]), 0);
  if (totalMin === 0) return 0; // repos
  if (totalMin <= 60) return 1; // modérée
  if (totalMin <= 120) return 2; // élevée
  return 3; // très élevée
}

const CARB_RANGE = { 0: [3, 5], 1: [5, 7], 2: [6, 10], 3: [10, 12] }; // niveau 3 aligné sur le protocole de charge glucidique du guide SiS (10-12g/kg)
const ACTIVITY_FACTOR = { 0: 1.4, 1: 1.6, 2: 1.85, 3: 2.1 };
const CARB_LOAD_G_PER_KG = 12; // guide SiS : charge glucidique 10-12g/kg/j pendant au moins 2 jours — on retient la borne haute

function computeNutritionTargets(profile, loadLevel, raceMode) {
  const w = Number(profile.weight) || 60;
  const carbsPerKg = raceMode === "carb_load" ? CARB_LOAD_G_PER_KG : CARB_RANGE[loadLevel][1]; // borne haute, ajustable
  const carbs = Math.round(w * carbsPerKg);
  const proteinPerKg = GOAL_PROTEIN[profile.goal] || 1.8;
  const protein = Math.round(w * proteinPerKg);
  const activity = raceMode === "carb_load" ? Math.max(ACTIVITY_FACTOR[loadLevel], 1.6) : ACTIVITY_FACTOR[loadLevel]; // journée de charge = volume d'entraînement réduit (taper) mais apport élevé
  const kcal = Math.round(w * 24 * activity * 0.9); // formule simplifiée type sport-performance
  const kcalFromCarbsProtein = carbs * 4 + protein * 4;
  const fat = Math.max(40, Math.round((kcal - kcalFromCarbsProtein) / 9));
  return { kcal, carbs, protein, fat, loadLevel, raceMode };
}

// Choisit, pour chaque repas, la recette dont le kcal est le plus proche de
// l'objectif calculé pour ce créneau (objectif qui varie selon l'heure
// d'entraînement — voir computeSlotTargets).
function pickMealsForTargets(diet, slotTargets) {
  const filtered = (slot) => FOOD_LIBRARY.filter(f => f.slot === slot && diet.every(tag => f.tags.includes(tag)));
  const pick = (slot) => {
    const opts = filtered(slot); if (opts.length === 0) return null;
    const target = slotTargets[slot]?.kcal || 500;
    return opts.reduce((best, o) => Math.abs(o.kcal - target) < Math.abs(best.kcal - target) ? o : best, opts[0]);
  };
  return { breakfast: pick("breakfast"), lunch: pick("lunch"), dinner: pick("dinner"), snack: pick("snack") };
}

// ------------------------------------------------------------------
// Répartition des calories entre repas selon l'heure d'entraînement —
// reproduit le principe de FoodCoach : le repas juste avant la séance et
// celui juste après sont recalés sur les cibles du guide SiS (pré/post),
// le reste du budget calorique du jour est réparti sur les autres repas.
// ------------------------------------------------------------------
const MEAL_TIME_MINUTES = { breakfast: 7 * 60 + 30, lunch: 12 * 60 + 30, snack: 16 * 60, dinner: 19 * 60 + 30 };
const timeToMinutes = (hhmm) => { const [h, m] = String(hhmm || "07:00").split(":").map(Number); return h * 60 + (m || 0); };

function assignMealRoles(trainingTime, fueling) {
  if (!trainingTime || !fueling) return { preSlot: null, postSlot: null };
  const trainStart = timeToMinutes(trainingTime);
  const trainEnd = trainStart + (fueling.totalMin || 0);

  const beforeSlots = MEAL_SLOTS.filter(s => MEAL_TIME_MINUTES[s] < trainStart);
  let preSlot = null;
  if (beforeSlots.length) {
    const idealPreTime = trainStart - fueling.preHours * 60;
    preSlot = beforeSlots.reduce((best, s) => Math.abs(MEAL_TIME_MINUTES[s] - idealPreTime) < Math.abs(MEAL_TIME_MINUTES[best] - idealPreTime) ? s : best, beforeSlots[0]);
  } else {
    preSlot = MEAL_SLOTS[0]; // séance très tôt : on ancre quand même sur le petit-déjeuner
  }

  const afterSlots = MEAL_SLOTS.filter(s => MEAL_TIME_MINUTES[s] >= trainEnd && s !== preSlot);
  const postSlot = afterSlots.length ? afterSlots.reduce((best, s) => MEAL_TIME_MINUTES[s] < MEAL_TIME_MINUTES[best] ? s : best, afterSlots[0]) : null;

  return { preSlot, postSlot };
}

function computeSlotTargets(targets, fueling, trainingTime) {
  const base = {};
  MEAL_SLOTS.forEach(s => { base[s] = { kcal: targets.kcal * SLOT_SHARE[s], carbs: targets.carbs * SLOT_SHARE[s], protein: targets.protein * SLOT_SHARE[s], fat: targets.fat * SLOT_SHARE[s] }; });

  const { preSlot, postSlot } = assignMealRoles(trainingTime, fueling);
  if (!preSlot && !postSlot) return { slots: roundSlots(base), preSlot: null, postSlot: null };

  const slots = { ...base };
  if (preSlot) {
    const carbs = fueling.preCarbG, protein = 20, fat = 12; // repas pré-effort : facile à digérer, pauvre en fibres (guide SiS)
    slots[preSlot] = { kcal: carbs * 4 + protein * 4 + fat * 9, carbs, protein, fat };
  }
  if (postSlot) {
    const carbs = fueling.postCarbG, protein = fueling.postProteinG, fat = 12;
    slots[postSlot] = { kcal: carbs * 4 + protein * 4 + fat * 9, carbs, protein, fat };
  }

  const otherSlots = MEAL_SLOTS.filter(s => s !== preSlot && s !== postSlot);
  const usedKcal = (preSlot ? slots[preSlot].kcal : 0) + (postSlot ? slots[postSlot].kcal : 0);
  const remainderKcal = Math.max(0, targets.kcal - usedKcal);
  const baseOtherKcal = otherSlots.reduce((s, slot) => s + base[slot].kcal, 0) || 1;
  const scale = remainderKcal / baseOtherKcal;
  otherSlots.forEach(slot => { slots[slot] = { kcal: base[slot].kcal * scale, carbs: base[slot].carbs * scale, protein: base[slot].protein * scale, fat: base[slot].fat * scale }; });

  return { slots: roundSlots(slots), preSlot, postSlot };
}

function roundSlots(slots) {
  const out = {};
  Object.entries(slots).forEach(([k, v]) => { out[k] = { kcal: Math.round(v.kcal), carbs: Math.round(v.carbs), protein: Math.round(v.protein), fat: Math.round(v.fat) }; });
  return out;
}

// ------------------------------------------------------------------
// Fenêtre nutritionnelle par séance — valeurs directement issues du
// SiS Marathon Fuelling Guide (Science in Sport), reprises telles quelles :
//   Footing (Easy Run)            : 1.5 g/kg pré (2.5-3h avant), pas de CHO pendant si ≤1h, 500-600ml eau/h
//   Tempo / Fractionné / Progression : 2 g/kg pré (3h avant), 30-60g CHO/h pendant, 500-600ml eau/h
//   Sortie longue (>2h)           : 3 g/kg pré (3h avant), 60-90g CHO/h pendant (double source), 500-600ml eau/h,
//                                    post : 1 g/kg CHO + 20-30g protéines
//   Veille de course (carb loading): 10-12 g/kg/jour pendant 2 jours
//   Course (marathon)             : 80-120g CHO/h pendant (double source)
//
// Utilise la durée/intensité RÉELLE du debrief de séance une fois que
// l'athlète l'a envoyé ; sinon se base sur la séance planifiée par le coach.
// ------------------------------------------------------------------
function isHighIntensityItem(it) {
  const val = String(it.intensityValue || "").replace(",", ".");
  if (it.intensityType === "RPE") return parseFloat(val) >= 6;
  if (it.intensityType === "Zone FC" || it.intensityType === "FC cible") return /4|5|z4|z5/i.test(val);
  return false; // Allure / Puissance non interprétées automatiquement
}

function computeSessionFueling(daySessions, weight, dayDebriefs) {
  const w = Number(weight) || 60;
  const enduranceSessions = (daySessions || []).filter(s => ["run", "bike", "swim"].includes(s.discipline));
  if (enduranceSessions.length === 0) return null;

  const debriefs = dayDebriefs || {};
  const totalMin = enduranceSessions.reduce((sum, s) => sum + sessionMinutes(s, debriefs[s.id]), 0);
  const hasHighIntensity = enduranceSessions.some(s => sessionIsHighIntensity(s, debriefs[s.id]));
  const usesActualData = enduranceSessions.some(s => debriefs[s.id]);

  if (totalMin === 0) return null;

  let category, preGPerKg, preHours, duringMin, duringMax, postCarbG, postProteinG, note;
  if (totalMin > 120) {
    category = "long_run";
    preGPerKg = 3; preHours = 3; duringMin = 60; duringMax = 90;
    postCarbG = Math.round(w * 1); postProteinG = 25;
    note = "carb_loading_note";
  } else if (totalMin > 60 || hasHighIntensity) {
    category = "quality_session";
    preGPerKg = 2; preHours = 3; duringMin = 30; duringMax = 60;
    postCarbG = 20; postProteinG = 20;
    note = null;
  } else {
    category = "easy_run";
    preGPerKg = 1.5; preHours = 2.5; duringMin = 0; duringMax = 0;
    postCarbG = 20; postProteinG = 20;
    note = null;
  }

  return {
    category, totalMin, usesActualData,
    preCarbG: Math.round(w * preGPerKg), preHours,
    duringMin, duringMax, duringFluid: "500-600",
    postCarbG, postProteinG,
    note,
  };
}

// Plan concret de ravitaillement pendant la séance (gels/boisson/barres),
// dimensionné sur la fenêtre glucides/h du guide SiS pour la durée réelle
// (ou planifiée) de la séance.
// Options de stratégie glucidique pendant l'effort, sélectionnables par
// l'athlète — le guide SiS donne une fourchette (30-90g/h à l'entraînement,
// 80-120g/h en course) ; ces 4 paliers standards permettent à l'athlète de
// choisir sa cible précise plutôt que de subir un milieu de fourchette calculé.
const CARBS_PER_HOUR_OPTIONS = [30, 60, 90, 120];

function computeDuringSessionPlan(fueling, productType, carbsPerHourTarget) {
  if (!fueling || fueling.duringMax === 0) return null;
  const product = FUEL_PRODUCTS.find(p => p.type === productType) || FUEL_PRODUCTS[0];
  const hours = fueling.totalMin / 60;
  const targetCarbsPerHour = carbsPerHourTarget || (fueling.duringMin + fueling.duringMax) / 2;
  const outsideGuideRange = carbsPerHourTarget && (carbsPerHourTarget < fueling.duringMin || carbsPerHourTarget > fueling.duringMax);
  const totalCarbs = Math.round(targetCarbsPerHour * hours);
  const units = Math.max(1, Math.round(totalCarbs / product.carbsPerUnit));
  const interval = Math.max(15, Math.round(fueling.totalMin / (units + 1)));
  const timeline = Array.from({ length: units }, (_, i) => ({ minute: interval * (i + 1), product }));
  const fluidPerHour = 550; // milieu de la fourchette 500-600ml/h du guide
  const totalFluidMl = Math.round(fluidPerHour * hours);
  return { product, units, totalCarbs, totalFluidMl, timeline, hours, targetCarbsPerHour, outsideGuideRange };
}

// ------------------------------------------------------------------
// Plan "Jour de course" — valeurs reprises telles quelles du guide SiS,
// section dédiée à la course elle-même (distincte des séances d'entraînement) :
//   Repas pré-course : ~3 g/kg de corps (exemple chiffré du guide : 232g pour un
//                       coureur de 80kg), 2.5-3h avant le départ, faible en fibres
//   Pendant la course : 80-120 g CHO/h, formulation double source (maltodextrine + fructose)
//   Après la course   : 60g CHO + 30g protéines (valeurs fixes du guide)
// ------------------------------------------------------------------
const RACE_PRE_G_PER_KG = 3;
const RACE_DURING = { min: 80, max: 120 };

function computeRaceDayPlan(weight, raceDurationHours, productType, carbsPerHourTarget) {
  const w = Number(weight) || 60;
  const hours = Number(raceDurationHours) || 3.5;
  const preCarbG = Math.round(w * RACE_PRE_G_PER_KG);
  const product = FUEL_PRODUCTS.find(p => p.type === productType) || FUEL_PRODUCTS[0];
  const rate = carbsPerHourTarget || (RACE_DURING.min + RACE_DURING.max) / 2;
  const outsideGuideRange = carbsPerHourTarget && (carbsPerHourTarget < RACE_DURING.min || carbsPerHourTarget > RACE_DURING.max);
  const totalCarbs = Math.round(rate * hours);
  const units = Math.max(1, Math.round(totalCarbs / product.carbsPerUnit));
  const interval = Math.max(15, Math.round((hours * 60) / (units + 1)));
  const timeline = Array.from({ length: units }, (_, i) => ({ minute: interval * (i + 1), product }));
  const totalFluidMl = Math.round(550 * hours);
  return {
    preCarbG, preProteinG: 20, preHours: 3,
    duringMin: RACE_DURING.min, duringMax: RACE_DURING.max, totalCarbs, units, timeline, totalFluidMl, product, hours,
    postCarbG: 60, postProteinG: 30, targetCarbsPerHour: rate, outsideGuideRange,
  };
}


// Compose un repas à partir d'ingrédients choisis par l'athlète : la cible
// calorique du créneau (déjà ajustée selon l'heure d'entraînement) est
// répartie entre les ingrédients sélectionnés, puis convertie en grammes.
function composeCustomMeal(ingredientIds, slotTargets, slot) {
  const items = ingredientIds.map(id => INGREDIENT_LIBRARY.find(i => i.id === id)).filter(Boolean);
  if (items.length === 0) return null;
  const slotKcal = slotTargets[slot]?.kcal || 500;
  const perItemKcal = slotKcal / items.length;
  const composed = items.map(ing => {
    const grams = Math.max(10, Math.round((perItemKcal / ing.kcal100) * 100));
    const f = grams / 100;
    return { id: ing.id, name: ing.name, grams, kcal: Math.round(ing.kcal100 * f), carbs: Math.round(ing.carbs100 * f), protein: Math.round(ing.protein100 * f), fat: Math.round(ing.fat100 * f) };
  });
  const totals = composed.reduce((acc, it) => ({ kcal: acc.kcal + it.kcal, carbs: acc.carbs + it.carbs, protein: acc.protein + it.protein, fat: acc.fat + it.fat }), { kcal: 0, carbs: 0, protein: 0, fat: 0 });
  return { custom: true, slot, name: composed.map(i => i.name).join(", "), items: composed, ...totals };
}


function emptyItem(discipline, section = "main") {
  return discipline === "strength"
    ? { id: uid(), section, exerciseName: "", series: 3, reps: 10, time: "", intensityType: "%RM", intensityValue: "", recovery: 90, video: null }
    : { id: uid(), section, series: 1, reps: 1, time: 10, intensityType: "RPE", intensityValue: "", recovery: 60 };
}
function newSession(discipline = "run") {
  return { id: uid(), discipline, title: "", status: "planifie", comment: "", attachments: [],
    items: [emptyItem(discipline, "warmup"), emptyItem(discipline, "main"), emptyItem(discipline, "cooldown")] };
}

const SESSIONS_SEED = {
  a1: {
    "2026-07-13": [{ id: uid(), discipline: "run", title: "Sortie longue", status: "fait", comment: "", attachments: [], items: [
      { id: uid(), series: 1, reps: 1, time: 30, intensityType: "Allure", intensityValue: "5:10/km", recovery: 0 },
    ] }],
    "2026-07-16": [{ id: uid(), discipline: "strength", title: "Accessoire épaule", status: "planifie", comment: "Focus qualité d'exécution, pas de compensation.", attachments: [], items: [
      { id: uid(), exerciseName: "Rotation externe élastique", series: 3, reps: 15, time: "", intensityType: "RIR", intensityValue: "3", recovery: 45, video: null },
      { id: uid(), exerciseName: "Serratus wall slide", series: 3, reps: 12, time: "", intensityType: "RIR", intensityValue: "2", recovery: 45, video: { name: "wall_slide_demo.mp4" } },
    ] }],
    "2026-07-19": [{ id: uid(), discipline: "run", title: "Fractionné 400m", status: "planifie", comment: "", attachments: [], items: [
      { id: uid(), series: 10, reps: 1, time: 1.5, intensityType: "RPE", intensityValue: "8", recovery: 90 },
    ] }],
  },
  a2: {}, a3: {},
};
// Génère un historique déterministe de ~35 jours (check-ins + debriefs) pour
// alimenter le moteur EWMA/monotonie/strain avec des données réalistes.
// Génération reproductible (PRNG à seed fixe) plutôt que Math.random pur,
// pour que le dashboard de démo soit stable d'un chargement à l'autre.
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
function addDays(dateStr, n) { const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

function generateAthleteHistory(startDate, days, seed) {
  const rnd = seededRandom(seed);
  const checkins = {}; const debriefs = {};
  let vfcBaseline = 68;
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const dayOfWeek = new Date(date + "T00:00:00").getDay(); // 0=dim
    const isRestDay = dayOfWeek === 1; // lundi = repos fixe
    const isLongRunDay = dayOfWeek === 0; // dimanche = sortie longue
    const isQualityDay = dayOfWeek === 3 || dayOfWeek === 5; // mer/ven = séance qualité

    // Charge du jour (sRPE = RPE x durée), influence légèrement la VFC du lendemain
    let duration = 0, rpe = 0, pain = 0;
    if (isRestDay) { duration = 0; rpe = 0; }
    else if (isLongRunDay) { duration = 90 + Math.round(rnd() * 30); rpe = 6 + Math.round(rnd() * 2); }
    else if (isQualityDay) { duration = 45 + Math.round(rnd() * 15); rpe = 7 + Math.round(rnd() * 3); }
    else { duration = 35 + Math.round(rnd() * 20); rpe = 3 + Math.round(rnd() * 3); }

    if (duration > 0) {
      pain = rnd() < 0.15 ? Math.round(2 + rnd() * 4) : (rnd() < 0.05 ? Math.round(6 + rnd() * 3) : 0);
      debriefs[date] = { s1: { rpe, duration, painIntensity: pain, zone: pain > 0 ? "shoulder_r" : "", sensations: pain >= 7 ? ["acute_pain"] : [], notes: "", file: null } };
    }

    // VFC réagit (légèrement, avec retard simplifié) à la charge de la veille
    const loadStress = duration * rpe;
    vfcBaseline = rClamp(vfcBaseline - (loadStress / 500) + (isRestDay ? 2 : 0) + (rnd() - 0.5) * 4, 45, 85);
    const vfcNuit = Math.round(vfcBaseline);
    const fcRepos = Math.round(46 - (vfcNuit - 65) * 0.25 + (rnd() - 0.5) * 2);
    const sleepHours = +(6.5 + rnd() * 2 - (loadStress > 400 ? 0.6 : 0)).toFixed(1);
    const sleepQuality = rClamp(Math.round(3 + (sleepHours - 7) * 1.2 + (rnd() - 0.5)), 1, 5);
    const hooper = rClamp(Math.round(12 + (loadStress / 60) - (isRestDay ? 3 : 0) + (rnd() - 0.5) * 4), 4, 28);
    // Température nocturne : écart donné par la montre par rapport à la
    // référence de l'athlète, oscille normalement entre -1 et +1°C, avec un
    // léger pic occasionnel (fatigue/début d'inflammation) simulé aléatoirement.
    const nightTemp = rClamp(+((rnd() - 0.5) * 0.6 + (rnd() < 0.06 ? 0.4 + rnd() * 0.4 : 0)).toFixed(1), -1, 1);

    checkins[date] = { vfcNuit, vfcMoy: Math.round(vfcBaseline), fcRepos, sleepHours, sleepQuality, hooper, nightTemp };
  }
  return { checkins, debriefs };
}

const HISTORY_START = addDays(TODAY, -34); // 34 jours avant aujourd'hui -> 35 jours d'historique
const GENERATED_HISTORY = generateAthleteHistory(HISTORY_START, 35, 42);

const CHECKINS_SEED = {
  a1: { ...GENERATED_HISTORY.checkins,
    "2026-07-14": { vfcNuit: 58, vfcMoy: 70, fcRepos: 45, sleepHours: 6.1, sleepQuality: 2, hooper: 17, nightTemp: 0.6 },
    "2026-07-15": { vfcNuit: 62, vfcMoy: 68, fcRepos: 42, sleepHours: 6.8, sleepQuality: 3, hooper: 15, nightTemp: 0.2 },
    "2026-07-16": { vfcNuit: 68, vfcMoy: 67, fcRepos: 44, sleepHours: 7.4, sleepQuality: 4, hooper: 12, nightTemp: -0.1 },
  },
  a2: {}, a3: {},
};
const DEBRIEFS_SEED = { a1: { ...GENERATED_HISTORY.debriefs }, a2: {}, a3: {} };

// Historique de cycle/symptômes (14 jours) pour la démo — cycle régulier de
// 28 jours, jour 1 il y a 20 jours -> aujourd'hui (16 juillet) = jour 25
// (phase lutéale), avec quelques jours de règles simulés au début de la
// fenêtre pour illustrer la variation des symptômes.
function generateCycleHistory(startDate, days, cycleStartDay1, avgLength, seed) {
  const rnd = seededRandom(seed);
  const out = {};
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const daysSinceStart = Math.floor((new Date(date) - new Date(cycleStartDay1)) / 86400000);
    const cycleDay = ((daysSinceStart % avgLength) + avgLength) % avgLength + 1;
    const isMenstruating = cycleDay <= 5;
    const isLuteal = cycleDay > avgLength - 14;
    const base = isMenstruating ? 4 : isLuteal ? 2 : 1;
    const rnd10 = (extra) => rClamp(Math.round(base * 1.3 + extra + (rnd() - 0.5) * 2), 0, 10);
    out[date] = {
      currentCycleDay: cycleDay,
      isMenstruating,
      symptomValues: {
        pain: rnd10(isMenstruating ? 2 : 0), cramps: rnd10(isMenstruating ? 3 : 0), fatigue: rnd10(isLuteal ? 1 : 0),
        mood: rClamp(Math.round(7 - base + (rnd() - 0.5) * 2), 0, 10), irritability: rnd10(isLuteal ? 1 : 0),
        motivation: rClamp(Math.round(7 - base * 0.7 + (rnd() - 0.5) * 2), 0, 10), energy: rClamp(Math.round(7 - base + (rnd() - 0.5) * 2), 0, 10),
        concentration: rClamp(Math.round(7 - base * 0.6 + (rnd() - 0.5) * 2), 0, 10), digestive: rnd10(0),
        heavyLegs: rnd10(isMenstruating ? 1 : 0), breastTenderness: rnd10(isLuteal ? 1 : 0), migraines: rnd10(-1),
        sleepQualityPerceived: rClamp(Math.round(7 - base * 0.8 + (rnd() - 0.5) * 2), 0, 10),
      },
    };
  }
  return out;
}
const CYCLE_CHECKINS_SEED = { a1: generateCycleHistory(addDays(TODAY, -13), 14, addDays(TODAY, -24), 28, 7), a2: {}, a3: {} };

const MSG_SEED = {
  a1: [{ id: uid(), from: "athlete", text: "Douleur épaule à 3/10 pendant le WOD, ça a tenu.", time: "09:12" },
       { id: uid(), from: "coach", text: "Nickel, on garde le même volume de renfo demain.", time: "09:20" }],
  a2: [{ id: uid(), from: "athlete", text: "La lombaire est un peu raide au réveil.", time: "hier" }],
  a3: [{ id: uid(), from: "athlete", text: "Je peux décaler la séance à jeudi ?", time: "lun" }],
};

// ============================================================
// Shared UI atoms
// ============================================================
function Avatar({ initials, tone, size = 36 }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: `${tone}22`, border: `1px solid ${tone}55`,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: size * 0.36, color: tone }}>{initials}</div>;
}
function Badge({ tone, children }) {
  return <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${tone}14`, border: `1px solid ${tone}55`, borderRadius: 999, padding: "6px 13px" }}>
    <span style={{ width: 7, height: 7, borderRadius: 4, background: tone }} />
    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 12.5, color: tone }}>{children}</span>
  </div>;
}
function Card({ label, children, right }) {
  return <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
    {label && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ fontSize: 11.5, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: 0.4, textTransform: "uppercase", color: MUTED }}>{label}</div>{right}</div>}
    {children}
  </div>;
}
function MetricCard({ icon: Icon, label, value, unit, sub, valueColor }) {
  return <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 7, color: MUTED }}><Icon size={14} strokeWidth={2} />
      <span style={{ fontSize: 11, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span></div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: valueColor || INK }}>{value}</span>
      {unit && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: MUTED }}>{unit}</span>}
    </div>
    {sub && <span style={{ fontSize: 10.5, color: MUTED2 }}>{sub}</span>}
  </div>;
}
const inputStyle = { background: BG, border: `1px solid ${BORDER}`, color: INK, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, width: "100%" };
const btnPrimary = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: ACCENT, border: "none", color: "#06251A", borderRadius: 11, padding: "12px 16px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const btnGhost = { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 9, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" };
const btnDanger = { ...btnGhost, borderColor: `${RED}55`, color: RED };

function hooperTone(s) { if (s == null) return "muted"; if (s <= 12) return "green"; if (s <= 19) return "amber"; return "red"; }
function sleepTone(h) { if (h == null) return "muted"; if (h >= 7) return "green"; if (h >= 6) return "amber"; return "red"; }
function fileKind(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return { icon: FileText, label: "PDF" };
  if (["mp4", "mov", "avi"].includes(ext)) return { icon: Film, label: "Vidéo" };
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return { icon: ImageIcon, label: "Image" };
  return { icon: FileText, label: ext.toUpperCase() };
}

// ============================================================
// LOGIN
// ============================================================
function LoginScreen({ athletes, onLogin, lang, setLang, t }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState("");
  function submit() {
    const uClean = u.trim(), pClean = p.trim();
    if (uClean === COACH.username && pClean === COACH.password) return onLogin({ role: "coach", name: COACH.name });
    const ath = athletes.find(a => String(a.username) === uClean && String(a.password) === pClean);
    if (ath) return onLogin({ role: "athlete", athleteId: ath.id, name: ath.name });
    setErr(t("login_err"));
  }
  return (
    <div style={{ minHeight: "100vh", background: BG, color: INK, fontFamily: "'Inter', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap'); * { box-sizing: border-box; }`}</style>
      <div style={{ width: "100%", maxWidth: 340 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 18 }}>
          {["fr", "en", "es"].map(l => (
            <button key={l} onClick={() => setLang(l)} style={{ padding: "4px 10px", borderRadius: 7, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              border: `1px solid ${lang === l ? ACCENT : BORDER}`, background: lang === l ? `${ACCENT}18` : "transparent", color: lang === l ? ACCENT : MUTED, cursor: "pointer" }}>{l.toUpperCase()}</button>
          ))}
        </div>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: 2, color: ACCENT, textTransform: "uppercase" }}>BioSync</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, marginTop: 4 }}>{t("login_title")}</div>
        </div>
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div><div style={{ fontSize: 11.5, color: MUTED, marginBottom: 5 }}>{t("login_id")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, ...inputStyle, padding: "9px 10px" }}><User size={14} color={MUTED} />
              <input value={u} onChange={e => setU(e.target.value)} style={{ background: "transparent", border: "none", color: INK, fontSize: 13.5, width: "100%", outline: "none" }} /></div></div>
          <div><div style={{ fontSize: 11.5, color: MUTED, marginBottom: 5 }}>{t("login_pw")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, ...inputStyle, padding: "9px 10px" }}><Lock size={14} color={MUTED} />
              <input type="password" value={p} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} style={{ background: "transparent", border: "none", color: INK, fontSize: 13.5, width: "100%", outline: "none" }} /></div></div>
          {err && <div style={{ color: RED, fontSize: 12 }}>{err}</div>}
          <button onClick={submit} style={{ ...btnPrimary, marginTop: 6 }}>{t("login_submit")}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Notification bell
// ============================================================
function NotifBell({ notifs, onOpen, open, setOpen, t }) {
  const unread = notifs.filter(n => !n.read).length;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => { setOpen(!open); if (!open) onOpen(); }} style={{ position: "relative", background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 9, padding: 8, cursor: "pointer" }}>
        <Bell size={16} />
        {unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: RED, color: "#fff", borderRadius: 999, fontSize: 9.5, fontWeight: 700, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{unread}</span>}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 42, width: 270, maxHeight: 320, overflowY: "auto", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10, zIndex: 20, boxShadow: "0 12px 30px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11.5, fontFamily: "'Space Grotesk', sans-serif", color: MUTED, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>{t("notifications")}</div>
          {notifs.length === 0 ? <div style={{ color: MUTED2, fontSize: 12, padding: "8px 0" }}>{t("no_notifications")}</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {notifs.slice().reverse().map(n => (
                <div key={n.id} style={{ fontSize: 12, padding: "8px 9px", borderRadius: 8, background: n.read ? "transparent" : `${ACCENT}0E`, border: `1px solid ${n.read ? BORDER : ACCENT + "33"}` }}>
                  <div style={{ color: INK }}>{n.text}</div>
                  <div style={{ color: MUTED2, fontSize: 10, marginTop: 2 }}>{n.time}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SHELL
// ============================================================
function Shell({ title, subtitle, tabs, tab, setTab, onLogout, notifs, onOpenNotifs, notifOpen, setNotifOpen, t, children }) {
  return (
    <div style={{ minHeight: "100vh", background: BG, color: INK, fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        input[type=range] { -webkit-appearance: none; height: 5px; border-radius: 3px; background: ${BORDER}; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: ${ACCENT}; cursor: pointer; border: 2px solid ${BG}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; } ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 3px; }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: `1px solid ${BORDER}` }}>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: 1, color: ACCENT, textTransform: "uppercase" }}>BioSync</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, marginTop: 1 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotifBell notifs={notifs} onOpen={onOpenNotifs} open={notifOpen} setOpen={setNotifOpen} t={t} />
          <button onClick={onLogout} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 9, padding: 8, cursor: "pointer" }}><LogOut size={16} /></button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px 90px", maxWidth: 560, margin: "0 auto", width: "100%" }}>{children}</div>
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0E1626", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", width: "100%", maxWidth: 560 }}>
          {tabs.map(tb => {
            const Icon = tb.icon; const active = tab === tb.id;
            return <button key={tb.id} onClick={() => setTab(tb.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 4px 12px", background: "transparent", border: "none", cursor: "pointer", color: active ? ACCENT : MUTED2 }}>
              <Icon size={19} strokeWidth={active ? 2.4 : 1.8} /><span style={{ fontSize: 10, fontFamily: "'Space Grotesk', sans-serif", fontWeight: active ? 600 : 500 }}>{tb.label}</span>
            </button>;
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COACH — Athlete manager
// ============================================================
function AthleteManager({ athletes, setAthletes, t }) {
  const [form, setForm] = useState({ name: "", username: "", password: "", sex: "f" });
  const [error, setError] = useState("");
  function addAthlete() {
    const cleanName = form.name.trim(), cleanUsername = form.username.trim(), cleanPassword = form.password.trim();
    if (!cleanName || !cleanUsername || !cleanPassword) { setError("—"); return; }
    if (athletes.some(a => a.username === cleanUsername)) { setError("—"); return; }
    const palette = [ACCENT, AMBER, BLUE, "#C68CFF", "#F06FA0"];
    const initials = cleanName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
    const id = uid();
    setAthletes(prev => [...prev, { id, name: cleanName, initials, tone: palette[prev.length % palette.length], username: cleanUsername, password: cleanPassword,
      nutritionEnabled: false, profile: { weight: 65, height: 172, age: 25, sex: form.sex, goal: "perf" }, diet: [],
      hormonalTrackingEnabled: false, cycleInfo: { averageCycleLengthDays: 28, regularity: "regular", contraception: "none", isPregnantOrPostpartum: false, isPerimenopausal: false }, enabledSymptoms: { ...DEFAULT_ENABLED_SYMPTOMS } }]);
    sheetsPost({ action: "createAthlete", athleteId: id, name: cleanName, username: cleanUsername, password: cleanPassword, sex: form.sex });
    setForm({ name: "", username: "", password: "", sex: "f" }); setError("");
  }
  function toggleNutrition(id) {
    setAthletes(prev => prev.map(a => a.id === id ? { ...a, nutritionEnabled: !a.nutritionEnabled } : a));
    const a = athletes.find(x => x.id === id);
    if (a) syncAthleteProfile({ ...a, nutritionEnabled: !a.nutritionEnabled });
  }
  function toggleHormonal(id) {
    setAthletes(prev => prev.map(a => a.id === id ? { ...a, hormonalTrackingEnabled: !a.hormonalTrackingEnabled } : a));
    const a = athletes.find(x => x.id === id);
    if (a) syncAthleteProfile({ ...a, hormonalTrackingEnabled: !a.hormonalTrackingEnabled });
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card label={`${t("athletes_count")} (${athletes.length}/5)`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {athletes.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "8px 10px", flexWrap: "wrap" }}>
              <Avatar initials={a.initials} tone={a.tone} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 11, color: MUTED2, fontFamily: "'JetBrains Mono', monospace" }}>{a.username}</div></div>
              <button onClick={() => toggleNutrition(a.id)} title={t("nutrition_toggle")} style={{
                display: "flex", alignItems: "center", gap: 5, background: a.nutritionEnabled ? `${ACCENT}18` : "transparent",
                border: `1px solid ${a.nutritionEnabled ? ACCENT + "55" : BORDER}`, borderRadius: 999, padding: "5px 9px", cursor: "pointer",
              }}>
                <Apple size={12} color={a.nutritionEnabled ? ACCENT : MUTED2} />
                <span style={{ fontSize: 10.5, color: a.nutritionEnabled ? ACCENT : MUTED2 }}>{a.nutritionEnabled ? t("nutrition_on") : t("nutrition_off")}</span>
              </button>
              {a.profile?.sex === "f" && (
                <button onClick={() => toggleHormonal(a.id)} title={t("hormonal_toggle")} style={{
                  display: "flex", alignItems: "center", gap: 5, background: a.hormonalTrackingEnabled ? "#F06FA018" : "transparent",
                  border: `1px solid ${a.hormonalTrackingEnabled ? "#F06FA055" : BORDER}`, borderRadius: 999, padding: "5px 9px", cursor: "pointer",
                }}>
                  <Moon size={12} color={a.hormonalTrackingEnabled ? "#F06FA0" : MUTED2} />
                  <span style={{ fontSize: 10.5, color: a.hormonalTrackingEnabled ? "#F06FA0" : MUTED2 }}>{a.hormonalTrackingEnabled ? t("nutrition_on") : t("nutrition_off")}</span>
                </button>
              )}
              <button onClick={() => { setAthletes(prev => prev.filter(x => x.id !== a.id)); sheetsPost({ action: "deleteAthlete", athleteId: a.id }); }} style={{ background: "transparent", border: "none", color: MUTED2, cursor: "pointer", padding: 4 }}><Trash2 size={15} /></button>
            </div>
          ))}
          {athletes.length === 0 && <div style={{ color: MUTED2, fontSize: 13, textAlign: "center", padding: "10px 0" }}>{t("no_athletes")}</div>}
        </div>
      </Card>
      {athletes.length < 5 && (
        <Card label={t("add_athlete")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input placeholder={t("full_name")} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder={t("username")} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} style={inputStyle} />
            <input placeholder={t("password")} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setForm({ ...form, sex: "f" })} style={{ flex: 1, padding: "7px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", border: `1px solid ${form.sex === "f" ? ACCENT + "88" : BORDER}`, background: form.sex === "f" ? `${ACCENT}14` : "transparent", color: form.sex === "f" ? ACCENT : MUTED }}>{t("female")}</button>
              <button onClick={() => setForm({ ...form, sex: "m" })} style={{ flex: 1, padding: "7px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", border: `1px solid ${form.sex === "m" ? ACCENT + "88" : BORDER}`, background: form.sex === "m" ? `${ACCENT}14` : "transparent", color: form.sex === "m" ? ACCENT : MUTED }}>{t("male")}</button>
            </div>
            {error && <div style={{ color: RED, fontSize: 12 }}>{t("login_err")}</div>}
            <button onClick={addAthlete} style={{ ...btnPrimary, marginTop: 4 }}><Plus size={16} /> {t("add")}</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function AthletePicker({ athletes, activeId, setActiveId, t }) {
  if (athletes.length === 0) return <div style={{ color: MUTED2, fontSize: 13 }}>{t("no_athletes")}</div>;
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 16, paddingBottom: 2 }}>
      {athletes.map(a => {
        const active = a.id === activeId;
        return <button key={a.id} onClick={() => setActiveId(a.id)} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 7, padding: "6px 12px 6px 6px", borderRadius: 999,
          border: active ? `1px solid ${a.tone}88` : `1px solid ${BORDER}`, background: active ? `${a.tone}14` : "transparent", cursor: "pointer" }}>
          <Avatar initials={a.initials} tone={a.tone} size={24} /><span style={{ fontSize: 12.5, color: active ? INK : MUTED, whiteSpace: "nowrap" }}>{a.name.split(" ")[0]}</span>
        </button>;
      })}
    </div>
  );
}

// ============================================================
// SESSION BUILDER (discipline-specific)
// ============================================================
function AttachmentPicker({ files, setFiles, t }) {
  function onPick(fileList) {
    const arr = Array.from(fileList || []).map(f => ({ id: uid(), name: f.name }));
    setFiles(prev => [...prev, ...arr]);
  }
  return (
    <div>
      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {files.map(f => {
            const k = fileKind(f.name); const Icon = k.icon;
            return <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 9, background: BG, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "7px 9px" }}>
              <Icon size={14} color={ACCENT} /><span style={{ flex: 1, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
              <button onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))} style={{ background: "transparent", border: "none", color: MUTED2, cursor: "pointer" }}><X size={14} /></button>
            </div>;
          })}
        </div>
      )}
      <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1.5px dashed ${BORDER}`, borderRadius: 9, padding: "10px", cursor: "pointer", fontSize: 12, color: MUTED }}>
        <UploadCloud size={14} /> {t("add_file")}
        <input type="file" multiple accept=".pdf,.mp4,.mov,.jpg,.jpeg,.png,.webp" onChange={e => onPick(e.target.files)} style={{ display: "none" }} />
      </label>
    </div>
  );
}

const SECTION_DEFS = [
  { key: "warmup", labelKey: "section_warmup", icon: Wind, color: BLUE },
  { key: "main", labelKey: "section_main", icon: Flame, color: RED },
  { key: "cooldown", labelKey: "section_cooldown", icon: Wind, color: ACCENT },
];

function SessionBuilder({ session, onChange, onSave, onDelete, onCancel, t }) {
  const [s, setS] = useState(session);
  const isStrength = s.discipline === "strength";
  const intensities = isStrength ? STRENGTH_INTENSITIES : ENDURANCE_INTENSITIES;

  function patch(p) { setS(prev => ({ ...prev, ...p })); }
  function setDiscipline(discipline) { setS(prev => ({ ...prev, discipline, items: [emptyItem(discipline, "warmup"), emptyItem(discipline, "main"), emptyItem(discipline, "cooldown")] })); }
  function addItem(section) { setS(prev => ({ ...prev, items: [...prev.items, emptyItem(prev.discipline, section)] })); }
  function updateItem(id, p) { setS(prev => ({ ...prev, items: prev.items.map(it => it.id === id ? { ...it, ...p } : it) })); }
  function removeItem(id) { setS(prev => ({ ...prev, items: prev.items.filter(it => it.id !== id) })); }
  function setItemVideo(id, file) { updateItem(id, { video: file ? { name: file.name } : null }); }

  function renderItemRow(it) {
    return (
      <div key={it.id} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 10 }}>
        {isStrength && (
          <input value={it.exerciseName} onChange={e => updateItem(it.id, { exerciseName: e.target.value })} placeholder={t("exercise_name")}
            style={{ ...inputStyle, marginBottom: 8, fontWeight: 600 }} />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
          <div><div style={{ fontSize: 9.5, color: MUTED2, marginBottom: 3 }}>{t("series")}</div><input value={it.series} onChange={e => updateItem(it.id, { series: e.target.value })} style={{ ...inputStyle, padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }} /></div>
          <div><div style={{ fontSize: 9.5, color: MUTED2, marginBottom: 3 }}>{t("reps")}</div><input value={it.reps} onChange={e => updateItem(it.id, { reps: e.target.value })} style={{ ...inputStyle, padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }} /></div>
          <div><div style={{ fontSize: 9.5, color: MUTED2, marginBottom: 3 }}>{t("time_min")}</div><input value={it.time} onChange={e => updateItem(it.id, { time: e.target.value })} style={{ ...inputStyle, padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, alignItems: "end" }}>
          <div><div style={{ fontSize: 9.5, color: MUTED2, marginBottom: 3 }}>{t("intensity")}</div>
            <select value={it.intensityType} onChange={e => updateItem(it.id, { intensityType: e.target.value })} style={{ ...inputStyle, padding: "6px 6px", fontSize: 11.5 }}>
              {intensities.map(i => <option key={i} value={i}>{i}</option>)}
            </select></div>
          <div><div style={{ fontSize: 9.5, color: MUTED2, marginBottom: 3 }}>{t("value")}</div><input value={it.intensityValue} onChange={e => updateItem(it.id, { intensityValue: e.target.value })} style={{ ...inputStyle, padding: "6px 8px", fontSize: 12.5 }} /></div>
          <div><div style={{ fontSize: 9.5, color: MUTED2, marginBottom: 3 }}>{t("recovery_s")}</div><input value={it.recovery} onChange={e => updateItem(it.id, { recovery: e.target.value })} style={{ ...inputStyle, padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }} /></div>
        </div>
        {isStrength && (
          <div style={{ marginTop: 8 }}>
            {it.video ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 9px" }}>
                <Film size={13} color={ACCENT} /><span style={{ flex: 1, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.video.name}</span>
                <button onClick={() => setItemVideo(it.id, null)} style={{ background: "transparent", border: "none", color: MUTED2, cursor: "pointer" }}><X size={13} /></button>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MUTED, cursor: "pointer" }}>
                <Film size={13} /> {t("video")}
                <input type="file" accept="video/*" onChange={e => setItemVideo(it.id, e.target.files?.[0])} style={{ display: "none" }} />
              </label>
            )}
          </div>
        )}
        <div style={{ textAlign: "right", marginTop: 6 }}>
          <button onClick={() => removeItem(it.id)} style={{ background: "transparent", border: "none", color: MUTED2, cursor: "pointer", padding: 2 }}><Trash2 size={13} /></button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <div style={{ marginBottom: 12 }}>
        <input value={s.title} onChange={e => patch({ title: e.target.value })} placeholder={t("session_name")}
          style={{ background: "transparent", border: "none", color: INK, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, padding: 0, outline: "none", width: "100%", marginBottom: 10 }} />
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>{t("session_type")}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DISCIPLINES.map(d => {
            const Icon = d.icon; const active = s.discipline === d.id;
            return <button key={d.id} onClick={() => setDiscipline(d.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 9,
              border: active ? `1px solid ${d.color}88` : `1px solid ${BORDER}`, background: active ? `${d.color}18` : "transparent", color: active ? d.color : MUTED, cursor: "pointer", fontSize: 12 }}>
              <Icon size={14} /> {t(d.id === "run" ? "run" : d.id === "bike" ? "bike" : d.id === "swim" ? "swim" : "strength")}
            </button>;
          })}
        </div>
      </div>

      {SECTION_DEFS.map(sec => {
        const SecIcon = sec.icon;
        const sectionItems = s.items.filter(it => (it.section || "main") === sec.key);
        return (
          <div key={sec.key} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <SecIcon size={13} color={sec.color} />
              <span style={{ fontSize: 11.5, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, color: sec.color, textTransform: "uppercase", letterSpacing: 0.4 }}>{t(sec.labelKey)}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
              {sectionItems.map(renderItemRow)}
              {sectionItems.length === 0 && <div style={{ fontSize: 11.5, color: MUTED2, padding: "4px 2px" }}>—</div>}
            </div>
            <button onClick={() => addItem(sec.key)} style={{ ...btnGhost, borderColor: `${sec.color}55`, color: sec.color, background: `${sec.color}14`, padding: "6px 12px", fontSize: 11.5 }}>
              <Plus size={13} /> {sec.key === "main" ? t("add_exercise_block") : t("add_block")}
            </button>
          </div>
        );
      })}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6, fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: 0.4 }}>{t("comment")}</div>
        <textarea value={s.comment} onChange={e => patch({ comment: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6, fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: 0.4 }}>{t("attachments")}</div>
        <AttachmentPicker files={s.attachments} setFiles={f => patch({ attachments: typeof f === "function" ? f(s.attachments) : f })} t={t} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={{ ...btnGhost, flex: 1, justifyContent: "center" }}>{t("back")}</button>
        {onDelete && <button onClick={onDelete} style={{ ...btnDanger, flex: 1, justifyContent: "center" }}><Trash2 size={14} /> {t("delete")}</button>}
        <button onClick={() => onSave(s)} style={{ ...btnPrimary, flex: 1.4 }}><CheckCircle2 size={15} /> {t("save")}</button>
      </div>
    </Card>
  );
}

// ============================================================
// CALENDAR — multi-session per day
// ============================================================
function SessionCalendar({ sessions, setSessions, athleteId, readOnly, onOpenDebrief, notify, athleteName, t, lang }) {
  const [cursor, setCursor] = useState(new Date(2026, 6, 1));
  const [selected, setSelected] = useState(TODAY);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const grid = useMemo(() => {
    const first = new Date(year, month, 1); const offset = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const cells = Array(offset).fill(null); for (let d = 1; d <= days; d++) cells.push(d); return cells;
  }, [year, month]);
  const monthLabel = cursor.toLocaleDateString(LOCALE_MAP[lang] || "fr-FR", { month: "long", year: "numeric" });
  const keyFor = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const daySessions = (sessions[athleteId] || {})[selected] || [];
  const editing = daySessions.find(s => s.id === editingId);

  function saveSession(s) {
    setSessions(prev => {
      const athDay = (prev[athleteId] || {})[selected] || [];
      const exists = athDay.some(x => x.id === s.id);
      const nextDay = exists ? athDay.map(x => x.id === s.id ? s : x) : [...athDay, s];
      return { ...prev, [athleteId]: { ...(prev[athleteId] || {}), [selected]: nextDay } };
    });
    sheetsPost({ action: "saveSession", athleteId, date: selected, session: s });
    notify(athleteId, `${t("nav_sessions")}: ${s.title || t(s.discipline)} — ${fmtDate(selected, lang)}`);
    setEditingId(null);
  }
  function deleteSession(id) {
    setSessions(prev => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), [selected]: (prev[athleteId]?.[selected] || []).filter(x => x.id !== id) } }));
    sheetsPost({ action: "deleteSession", athleteId, date: selected, sessionId: id });
    setEditingId(null);
  }
  const dayNames = useMemo(() => {
    const base = new Date(2026, 6, 6); // a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i);
      return d.toLocaleDateString(LOCALE_MAP[lang] || "fr-FR", { weekday: "narrow" });
    });
  }, [lang]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} style={{ ...btnGhost, padding: 6 }}><ChevronLeft size={16} /></button>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 14, textTransform: "capitalize" }}>{monthLabel}</span>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} style={{ ...btnGhost, padding: 6 }}><ChevronRight size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 16 }}>
        {dayNames.map((n, i) => <div key={i} style={{ textAlign: "center", fontSize: 10.5, color: MUTED2, fontFamily: "'JetBrains Mono', monospace" }}>{n}</div>)}
        {grid.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = keyFor(d); const list = (sessions[athleteId] || {})[key] || []; const isSel = key === selected; const isToday = key === TODAY;
          return <button key={i} onClick={() => { setSelected(key); setEditingId(null); }} style={{ aspectRatio: "1", borderRadius: 9,
            border: isSel ? `1px solid ${ACCENT}` : `1px solid ${BORDER}`, background: isSel ? `${ACCENT}14` : SURFACE,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, cursor: "pointer" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: isToday ? ACCENT : MUTED, fontWeight: isToday ? 700 : 400 }}>{d}</span>
            <div style={{ display: "flex", gap: 2 }}>{list.map(s => <span key={s.id} style={{ width: 4, height: 4, borderRadius: 2, background: s.status === "fait" ? ACCENT : AMBER }} />)}</div>
          </button>;
        })}
      </div>

      {editing ? (
        <SessionBuilder session={editing} onSave={saveSession} onDelete={() => deleteSession(editing.id)} onCancel={() => setEditingId(null)} t={t} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {daySessions.length === 0 && <div style={{ color: MUTED2, fontSize: 12.5, textAlign: "center", padding: "16px 0" }}>{t("no_sessions_today")}</div>}
          {daySessions.map(s => {
            const disc = DISCIPLINES.find(d => d.id === s.discipline) || DISCIPLINES[0]; const Icon = disc.icon;
            const isExpanded = expandedId === s.id;
            const isStrength = s.discipline === "strength";
            return (
              <Card key={s.id}>
                <div onClick={() => setExpandedId(isExpanded ? null : s.id)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `${disc.color}1E`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={15} color={disc.color} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.title || t(s.discipline)}</div>
                    <div style={{ fontSize: 11, color: MUTED2 }}>{s.items.length} {t("add_block").split(" ").pop().toLowerCase()}{s.items.length > 1 ? "s" : ""} · {s.status === "fait" ? t("done") : t("planned")}</div>
                  </div>
                  {!readOnly && <button onClick={e => { e.stopPropagation(); setEditingId(s.id); }} style={{ ...btnGhost, padding: "6px 10px" }}><Pencil size={13} /> {t("edit")}</button>}
                  <ChevronRight size={16} color={MUTED2} style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                    {SECTION_DEFS.map(sec => {
                      const secItems = s.items.filter(it => (it.section || "main") === sec.key);
                      if (secItems.length === 0) return null;
                      const SecIcon = sec.icon;
                      return (
                        <div key={sec.key}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <SecIcon size={12} color={sec.color} />
                            <span style={{ fontSize: 10.5, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, color: sec.color, textTransform: "uppercase", letterSpacing: 0.4 }}>{t(sec.labelKey)}</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            {secItems.map(it => (
                              <div key={it.id} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "8px 10px" }}>
                                {isStrength && it.exerciseName && <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{it.exerciseName}</div>}
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11.5, color: MUTED }}>
                                  <span>{t("series")} <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{it.series}</b></span>
                                  <span>{t("reps")} <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{it.reps}</b></span>
                                  {it.time && <span>{t("time_min")} <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{it.time}</b></span>}
                                  <span>{it.intensityType} <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{it.intensityValue || "—"}</b></span>
                                  <span>{t("recovery_s")} <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{it.recovery}</b></span>
                                </div>
                                {isStrength && it.video && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: ACCENT, marginTop: 6 }}><Film size={12} /> {it.video.name}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {isExpanded && s.comment && <div style={{ fontSize: 12, color: MUTED, marginTop: 10, fontStyle: "italic" }}>« {s.comment} »</div>}
                {isExpanded && s.attachments?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {s.attachments.map(f => { const k = fileKind(f.name); const FIcon = k.icon; return <span key={f.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: MUTED, background: BG, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "3px 8px" }}><FIcon size={11} /> {f.name}</span>; })}
                  </div>
                )}
                {readOnly && isExpanded && (
                  <button onClick={() => onOpenDebrief(selected, s)} style={{ ...btnPrimary, marginTop: 10, width: "100%" }}><Send size={14} /> {t("make_debrief")}</button>
                )}
              </Card>
            );
          })}
          {!readOnly && daySessions.length < 2 && (
            <button onClick={() => setEditingId((() => { const s = newSession(); setSessions(prev => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), [selected]: [...daySessions, s] } })); return s.id; })())}
              style={{ ...btnGhost, borderColor: `${ACCENT}55`, color: ACCENT, background: `${ACCENT}14`, justifyContent: "center" }}>
              <Plus size={15} /> {t("add_session")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
// ============================================================
// Small UI atoms for the readiness dashboard
// ============================================================
function InfoTip({ text }) {
  return <span title={text} style={{ display: "inline-flex", cursor: "help", color: MUTED2 }}><Info size={12} /></span>;
}
function TrendArrow({ current, previous, higherIsBetter = true }) {
  if (previous == null || current == null || previous === current) return <Minus size={12} color={MUTED2} />;
  const rising = current > previous;
  const good = higherIsBetter ? rising : !rising;
  const Icon = rising ? TrendingUp : TrendingDown;
  return <Icon size={13} color={good ? ACCENT : RED} />;
}
const RISK_TONE = { low: ACCENT, moderate: AMBER, high: RED };
function scoreToTone(score) { return RISK_TONE[score >= 75 ? "low" : score >= 50 ? "moderate" : "high"]; }

function DeterminantCard({ icon: Icon, label, value, unit, tone, current, previous, higherIsBetter, avgLabel, avgValue, tooltip }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: MUTED }}>
          <Icon size={13} /><span style={{ fontSize: 10.5, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</span>
        </div>
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: tone, flexShrink: 0 }} />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 21, fontWeight: 600, color: INK }}>{value}</span>
        {unit && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: MUTED }}>{unit}</span>}
        <TrendArrow current={current} previous={previous} higherIsBetter={higherIsBetter} />
      </div>
      {avgLabel && <div style={{ fontSize: 10, color: MUTED2 }}>{avgLabel} {avgValue}</div>}
    </div>
  );
}

// Construit une série quotidienne (avec zéros pour les jours de repos) de la
// charge sRPE (RPE x durée) à partir des debriefs de séance de l'athlète.
function buildDailyLoadSeries(athDebriefs, days, endDate) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const sessions = athDebriefs[date] || {};
    const value = Object.values(sessions).reduce((sum, d) => sum + (Number(d.rpe) || 0) * (Number(d.duration) || 0), 0);
    out.push({ date, value });
  }
  return out;
}
function statsFromSeries(values) {
  if (!values.length) return { mean: 0, sd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return { mean, sd };
}

// ============================================================
// READINESS DASHBOARD (remplace l'ancien tableau de bord "récupération")
// 3 niveaux : Décision / Déterminants / Analyse avancée — voir workload/
// pour le moteur de calcul (aucune dépendance à un ratio ACWR).
// ============================================================
function RecoveryDashboard({ checkins, debriefs, sessions, cycleCheckins, athlete, athleteId, t, lang }) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showHormonalDetail, setShowHormonalDetail] = useState(false);
  const [chronicWindow, setChronicWindow] = useState(28);

  const athCheckins = checkins[athleteId] || {};
  const athDebriefs = debriefs[athleteId] || {};
  const dates = Object.keys(athCheckins).sort();
  const latestKey = dates[dates.length - 1];
  const latest = latestKey ? athCheckins[latestKey] : null;
  const prevKey = dates[dates.length - 2];
  const previous = prevKey ? athCheckins[prevKey] : null;

  if (!latest) return <div style={{ color: MUTED2, fontSize: 13, textAlign: "center", padding: "30px 0" }}>{t("no_data")}</div>;

  // ---- Historique de charge (35 jours, zéro-rempli) ----
  const dailyLoads = buildDailyLoadSeries(athDebriefs, 35, latestKey);

  // ---- Baselines individuelles VFC / FC repos (Buchheit, 2014) ----
  // La température nocturne est un écart déjà calculé par la montre
  // (-1 à +1°C) : pas besoin de recalculer un écart à une moyenne ici.
  const vfcHistory = dates.map(d => athCheckins[d].vfcNuit).filter(v => v != null);
  const rhrHistory = dates.map(d => athCheckins[d].fcRepos).filter(v => v != null);
  const vfcStats = statsFromSeries(vfcHistory);
  const rhrStats = statsFromSeries(rhrHistory);
  const nightTemperatureDeltaC = latest.nightTemp != null ? latest.nightTemp : null;

  // ---- Dernier debrief (proxy "RPE / douleur de la veille") ----
  const flatDebriefs = Object.entries(athDebriefs).flatMap(([d, bySession]) => Object.values(bySession).map(x => ({ ...x, date: d })));
  const lastDebrief = flatDebriefs.sort((a, b) => a.date.localeCompare(b.date)).pop();

  // ---- Moteur ----
  const { snapshot, readiness, recommendation } = computeAthleteReadinessReport(dailyLoads, {
    hrv: { today: latest.vfcNuit, individualMean: vfcStats.mean || latest.vfcNuit, individualSd: vfcStats.sd },
    restingHeartRate: { today: latest.fcRepos, individualMean: rhrStats.mean || latest.fcRepos, individualSd: rhrStats.sd },
    sleepHours: latest.sleepHours,
    sleepQuality: latest.sleepQuality,
    nightTemperatureDeltaC,
    pain: lastDebrief ? lastDebrief.painIntensity : null,
    yesterdayRPE: lastDebrief ? lastDebrief.rpe : null,
    hasAcuteFlareUp: lastDebrief ? (lastDebrief.sensations || []).includes("acute_pain") : false,
  }, { chronicConfig: { timeConstantDays: chronicWindow } });

  const scoreTone = RISK_TONE[readiness.riskLevel];

  // ---- Hormonal Readiness Engine (option athlètes féminines) ----
  const athCycleCheckins = cycleCheckins?.[athleteId] || {};
  const todayCycle = athCycleCheckins[TODAY];
  let hormonalReport = null;
  if (athlete?.hormonalTrackingEnabled) {
    hormonalReport = computeHormonalReadinessReport({
      symptomValues: todayCycle?.symptomValues || {},
      physiology: {
        hrv: { today: latest.vfcNuit, individualMean: vfcStats.mean || latest.vfcNuit, individualSd: vfcStats.sd },
        restingHeartRate: { today: latest.fcRepos, individualMean: rhrStats.mean || latest.fcRepos, individualSd: rhrStats.sd },
        nightTemperatureDeltaC, sleepHours: latest.sleepHours, sleepEfficiencyPercent: null,
      },
      trainingContext: {
        acuteLoad7d: snapshot.acuteLoad7d, chronicLoad28d: snapshot.chronicLoad28d, weeklyLoadChangePercent: snapshot.weeklyLoadChangePercent,
        monotony: snapshot.monotony, yesterdayRPE: lastDebrief ? lastDebrief.rpe : null, musculoskeletalPain: lastDebrief ? lastDebrief.painIntensity : null,
      },
      cycle: todayCycle ? { currentCycleDay: todayCycle.currentCycleDay, averageCycleLengthDays: athlete.cycleInfo?.averageCycleLengthDays, regularity: athlete.cycleInfo?.regularity, isMenstruating: todayCycle.isMenstruating, contraception: athlete.cycleInfo?.contraception } : null,
    }, { ...HORMONAL_WEIGHTS, enabledSymptoms: athlete.enabledSymptoms || DEFAULT_ENABLED_SYMPTOMS }, t);
  }

  // ---- Séries pour flèches de tendance (comparaison à hier) ----
  const dailyLoadsPrev = dailyLoads.slice(0, -1);
  const snapshotPrev = computeWorkloadSnapshot(dailyLoadsPrev, { timeConstantDays: chronicWindow });

  // ---- Répartition par discipline (30 derniers jours, Tier 3) ----
  const athSessions = sessions?.[athleteId] || {};
  const disciplineCounts = {};
  Object.keys(athSessions).forEach(date => {
    if (date < addDays(latestKey, -30)) return;
    (athSessions[date] || []).forEach(s => { disciplineCounts[s.discipline] = (disciplineCounts[s.discipline] || 0) + 1; });
  });

  const acuteSeries = computeAcuteLoadSeries(dailyLoads).slice(-14);
  const chronicSeries = computeChronicLoadSeries(dailyLoads, { timeConstantDays: chronicWindow }).slice(-14);
  const trendRows = acuteSeries.map((p, i) => ({ d: fmtDate(p.date, lang), acute: Math.round(p.ewma), chronic: Math.round(chronicSeries[i]?.ewma || 0) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ---------------- TIER 1 — DÉCISION ---------------- */}
      <div style={{ background: `linear-gradient(135deg, ${scoreTone}14, ${SURFACE})`, border: `1px solid ${scoreTone}55`, borderRadius: 16, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Space Grotesk', sans-serif" }}>{t("readiness_score")}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 40, fontWeight: 700, color: scoreTone }}>{readiness.score}</span>
              <span style={{ fontSize: 13, color: MUTED }}>/100</span>
            </div>
          </div>
          <Badge tone={scoreTone}>{t(`risk_${readiness.riskLevel}`)}</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px" }}>
          {readiness.riskLevel === "high" ? <AlertTriangle size={20} color={scoreTone} style={{ flexShrink: 0 }} /> : <CheckCircle2 size={20} color={scoreTone} style={{ flexShrink: 0 }} />}
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: INK }}>{t(`action_${recommendation.action}`)}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              {recommendation.rationaleKey === "rationale_spike" && t("rationale_spike").replace("{v}", recommendation.rationaleValue)}
              {recommendation.rationaleKey === "rationale_drivers" && t("rationale_drivers").replace("{v}", recommendation.drivers.map(k => t(k)).join(", "))}
              {(recommendation.rationaleKey === "rationale_ok" || recommendation.rationaleKey === "rationale_acute_pain") && t(recommendation.rationaleKey)}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- HORMONAL READINESS (option athlètes féminines) ---------------- */}
      {hormonalReport && (() => {
        const hTone = RISK_TONE[hormonalReport.readiness.level === "optimal" || hormonalReport.readiness.level === "good" ? "low" : hormonalReport.readiness.level === "to_monitor" ? "moderate" : "high"];
        return (
          <div>
            <div onClick={() => setShowHormonalDetail(v => !v)} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
              background: `linear-gradient(135deg, ${hTone}14, ${SURFACE})`, border: `1px solid ${hTone}55`, borderRadius: 14, padding: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Moon size={18} color={hTone} />
                <div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13.5 }}>{t("hormonal_readiness")}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{t(`level_${hormonalReport.readiness.level}`)}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: hTone }}>{hormonalReport.readiness.score}</span>
                <ChevronDown size={15} color={MUTED2} style={{ transform: showHormonalDetail ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </div>
            </div>

            {showHormonalDetail && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: "#F06FA014", border: "1px solid #F06FA044", borderRadius: 10, padding: "10px 12px", fontSize: 10.5, color: MUTED }}>{t("hri_disclaimer")}</div>

                <Card label={t("hormonal_recommendation")}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{t(`hormonal_action_${hormonalReport.recommendation.action}`)}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>
                    {t(`hormonal_${hormonalReport.recommendation.rationaleKey}`).replace("{v}", hormonalReport.recommendation.topFactorLabels.join(", ") || "—")}
                  </div>
                </Card>

                <Card label={t("top_factors")}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {hormonalReport.readiness.topNegativeFactors.map(f => (
                      <div key={f.key}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED, marginBottom: 3 }}>
                          <span>{f.label}</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(f.score)}/100</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: BORDER, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${f.score}%`, background: f.score >= 70 ? ACCENT : f.score >= 50 ? AMBER : RED, borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {todayCycle ? (
                  <Card label={t("hormonal_symptoms_today")}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11.5, color: MUTED }}>
                      <span>{t("cycle_day")} <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{todayCycle.currentCycleDay}</b></span>
                      {todayCycle.isMenstruating && <span style={{ color: "#F06FA0" }}>{t("is_menstruating")}</span>}
                    </div>
                  </Card>
                ) : (
                  <div style={{ fontSize: 12, color: MUTED2, textAlign: "center", padding: "8px 0" }}>{t("not_tracked_yet")}</div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ---------------- TIER 2 — DÉTERMINANTS ---------------- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <DeterminantCard icon={Gauge} label={t("acute_load_label")} value={Math.round(snapshot.acuteLoad7d)}
          tone={RISK_TONE[readiness.subscores.find(s => s.key === "load")?.score >= 75 ? "low" : readiness.subscores.find(s => s.key === "load")?.score >= 50 ? "moderate" : "high"]}
          current={snapshot.acuteLoad7d} previous={snapshotPrev.acuteLoad7d}
          avgLabel={t("chronic_load_label").replace("{n}", chronicWindow)} avgValue={Math.round(snapshot.chronicLoad28d)}
          tooltip={t("tooltip_acute")} />
        <DeterminantCard icon={Timer} label={t("weekly_change_label")} value={`${snapshot.weeklyLoadChangePercent >= 0 ? "+" : ""}${Math.round(snapshot.weeklyLoadChangePercent)}`} unit="%"
          tone={Math.abs(snapshot.weeklyLoadChangePercent) <= 15 ? ACCENT : Math.abs(snapshot.weeklyLoadChangePercent) <= 30 ? AMBER : RED}
          current={snapshot.weeklyLoadChangePercent} previous={snapshotPrev.weeklyLoadChangePercent} higherIsBetter={false}
          tooltip={t("tooltip_weekly_change")} />
        <DeterminantCard icon={Moon} label={t("hrv_label")} value={latest.vfcNuit} unit="ms"
          tone={RISK_TONE[baselineZScore({ today: latest.vfcNuit, individualMean: vfcStats.mean, individualSd: vfcStats.sd }, true) >= 60 ? "low" : baselineZScore({ today: latest.vfcNuit, individualMean: vfcStats.mean, individualSd: vfcStats.sd }, true) >= 40 ? "moderate" : "high"]}
          current={latest.vfcNuit} previous={previous?.vfcNuit}
          avgLabel={t("vs_individual_avg")} avgValue={`${Math.round(vfcStats.mean)} ms`} tooltip={t("hrv_label")} />
        <DeterminantCard icon={HeartPulse} label={t("rhr_label")} value={latest.fcRepos} unit="bpm"
          tone={RISK_TONE[baselineZScore({ today: latest.fcRepos, individualMean: rhrStats.mean, individualSd: rhrStats.sd }, false) >= 60 ? "low" : baselineZScore({ today: latest.fcRepos, individualMean: rhrStats.mean, individualSd: rhrStats.sd }, false) >= 40 ? "moderate" : "high"]}
          current={latest.fcRepos} previous={previous?.fcRepos} higherIsBetter={false}
          avgLabel={t("vs_individual_avg")} avgValue={`${Math.round(rhrStats.mean)} bpm`} tooltip={t("rhr_label")} />
        <DeterminantCard icon={BedDouble} label={t("sleep_label")} value={latest.sleepHours} unit="h"
          tone={TONE[sleepTone(latest.sleepHours)]}
          current={latest.sleepHours} previous={previous?.sleepHours}
          avgLabel={t("quality")} avgValue={`${latest.sleepQuality}/5`} tooltip={t("sleep_label")} />
        <DeterminantCard icon={Thermometer} label={t("temp_label")} value={latest.nightTemp != null ? `${latest.nightTemp > 0 ? "+" : ""}${latest.nightTemp.toFixed(1)}` : "—"} unit={latest.nightTemp != null ? "°C" : ""}
          tone={nightTemperatureDeltaC == null ? MUTED2 : scoreToTone(temperatureSubscore(nightTemperatureDeltaC))}
          current={latest.nightTemp} previous={previous?.nightTemp} higherIsBetter={false}
          tooltip={t("night_temp_hint")} />
        <DeterminantCard icon={Activity} label={t("pain_label")} value={lastDebrief ? lastDebrief.painIntensity : "—"} unit={lastDebrief ? "/10" : ""}
          tone={!lastDebrief ? MUTED2 : lastDebrief.painIntensity >= 5 ? RED : lastDebrief.painIntensity > 0 ? AMBER : ACCENT}
          higherIsBetter={false} tooltip={t("pain_label")} />
        <DeterminantCard icon={Zap} label={t("rpe_label")} value={lastDebrief ? lastDebrief.rpe : "—"} unit={lastDebrief ? "/10" : ""}
          tone={!lastDebrief ? MUTED2 : lastDebrief.rpe >= 8 ? RED : lastDebrief.rpe >= 6 ? AMBER : ACCENT}
          higherIsBetter={false} tooltip={t("rpe_label")} />
        <DeterminantCard icon={BrainCircuit} label={t("hooper_score")} value={latest.hooper} unit="/28"
          tone={TONE[hooperTone(latest.hooper)]} current={latest.hooper} previous={previous?.hooper} higherIsBetter={false}
          tooltip={t("hooper_score")} />
      </div>

      {/* ---------------- TIER 3 — ANALYSE AVANCÉE (repliable) ---------------- */}
      <button onClick={() => setShowAnalysis(v => !v)} style={{ ...btnGhost, justifyContent: "center", gap: 8 }}>
        {showAnalysis ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showAnalysis ? t("hide_analysis") : t("show_analysis")}
      </button>

      {showAnalysis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <Card label={t("chronic_window")}>
            <div style={{ display: "flex", gap: 6 }}>
              {CHRONIC_TIME_CONSTANT_OPTIONS.map(n => (
                <button key={n} onClick={() => setChronicWindow(n)} style={{
                  flex: 1, padding: "6px 4px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                  border: `1px solid ${chronicWindow === n ? ACCENT + "88" : BORDER}`, background: chronicWindow === n ? `${ACCENT}14` : "transparent",
                  color: chronicWindow === n ? ACCENT : MUTED,
                }}>{n} j</button>
              ))}
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            <MetricCard icon={LineChartIcon} label={t("monotony_label")} value={snapshot.monotony.toFixed(2)} sub={t("tooltip_monotony")} />
            <MetricCard icon={Flame} label="Strain" value={Math.round(snapshot.strain)} sub={t("tooltip_strain")} />
            <MetricCard icon={Gauge} label={t("weekly_load")} value={Math.round(snapshot.weeklyLoad)} />
            <MetricCard icon={Gauge} label={t("monthly_load")} value={Math.round(snapshot.monthlyLoad)} />
          </div>

          <Card label={`${t("acute_load_label")} / ${t("chronic_load_label").replace("{n}", chronicWindow)}`}>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={trendRows} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={BORDER} vertical={false} />
                <XAxis dataKey="d" stroke={MUTED2} tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                <YAxis stroke={MUTED2} tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                <Tooltip contentStyle={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }} labelStyle={{ color: INK }} />
                <Line type="monotone" dataKey="acute" stroke={ACCENT} strokeWidth={2} dot={false} name={t("acute_load_label")} />
                <Line type="monotone" dataKey="chronic" stroke={AMBER} strokeWidth={2} dot={false} name={t("chronic_load_label").replace("{n}", chronicWindow)} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {Object.keys(disciplineCounts).length > 0 && (
            <Card label={t("discipline_breakdown")}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(disciplineCounts).map(([disc, count]) => {
                  const meta = DISCIPLINES.find(d => d.id === disc) || DISCIPLINES[0];
                  const total = Object.values(disciplineCounts).reduce((a, b) => a + b, 0);
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={disc}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: MUTED, marginBottom: 3 }}>
                        <span>{t(disc)}</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{count} · {pct}%</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: BORDER, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: meta.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MESSAGES
// ============================================================
function Messages({ messages, setMessages, athletes, activeId, setActiveId, role, notify, t }) {
  const [draft, setDraft] = useState(""); const isCoach = role === "coach";
  const thread = messages[activeId] || []; const activeAthlete = athletes.find(a => a.id === activeId);
  function send() {
    if (!draft.trim()) return;
    const msg = { id: uid(), from: isCoach ? "coach" : "athlete", text: draft.trim(), time: "maintenant" };
    setMessages(prev => ({ ...prev, [activeId]: [...(prev[activeId] || []), msg] }));
    sheetsPost({ action: "saveMessage", athleteId: activeId, message: msg });
    notify(isCoach ? "coach_to_athlete" : "athlete_to_coach", activeId, draft.trim());
    setDraft("");
  }
  return (
    <div>
      {isCoach && <AthletePicker athletes={athletes} activeId={activeId} setActiveId={setActiveId} t={t} />}
      {!activeAthlete ? <div style={{ color: MUTED2, fontSize: 13 }}>{t("pick_athlete")}</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto", padding: "4px 2px" }}>
            {thread.map(m => {
              const bubbleIsCoach = m.from === "coach"; const alignRight = isCoach ? bubbleIsCoach : !bubbleIsCoach;
              return <div key={m.id} style={{ display: "flex", justifyContent: alignRight ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "75%", padding: "8px 12px", borderRadius: alignRight ? "13px 13px 3px 13px" : "13px 13px 13px 3px",
                  background: alignRight ? `${ACCENT}1E` : SURFACE, border: `1px solid ${alignRight ? ACCENT + "44" : BORDER}`, fontSize: 13 }}>
                  <div>{m.text}</div><div style={{ fontSize: 9.5, color: MUTED2, marginTop: 3, textAlign: alignRight ? "right" : "left" }}>{m.time}</div>
                </div>
              </div>;
            })}
            {thread.length === 0 && <div style={{ color: MUTED2, fontSize: 12.5, textAlign: "center", padding: "16px 0" }}>—</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="…" style={{ ...inputStyle, borderRadius: 20 }} />
            <button onClick={send} style={{ width: 38, height: 38, borderRadius: "50%", background: ACCENT, border: "none", color: "#06251A", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Send size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ATHLETE — Check-in
// ============================================================
const HOOPER_ITEMS = [{ id: "fatigue" }, { id: "stress" }, { id: "courbatures" }, { id: "sommeil" }];

function CheckinForm({ checkins, setCheckins, athleteId, notify, t }) {
  const [vfcNuit, setVfcNuit] = useState(62); const [fcRepos, setFcRepos] = useState(45);
  const [sleepHours, setSleepHours] = useState(7.5); const [sleepQuality, setSleepQuality] = useState(3);
  const [nightTemp, setNightTemp] = useState(0);
  const [hooper, setHooper] = useState({ fatigue: 3, stress: 3, courbatures: 3, sommeil: 3 }); const [done, setDone] = useState(false);
  const hooperScore = Object.values(hooper).reduce((a, b) => a + b, 0);
  const prevKeys = Object.keys(checkins[athleteId] || {}).sort();
  const vfcMoy = prevKeys.length ? Math.round(prevKeys.slice(-7).reduce((s, k) => s + checkins[athleteId][k].vfcNuit, vfcNuit) / (Math.min(7, prevKeys.length) + 1)) : vfcNuit;
  function submit() {
    const payload = { vfcNuit, vfcMoy, fcRepos, sleepHours, sleepQuality, hooper: hooperScore, nightTemp };
    setCheckins(prev => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), [TODAY]: payload } }));
    sheetsPost({ action: "saveCheckin", athleteId, date: TODAY, data: payload });
    notify("checkin", athleteId, `Hooper ${hooperScore}/28, sommeil ${sleepHours}h`);
    setDone(true);
  }
  if (done) return <Card><div style={{ textAlign: "center", padding: "10px 0" }}><CheckCircle2 size={30} color={ACCENT} style={{ marginBottom: 8 }} />
    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>✓</div>
    <div style={{ color: MUTED, fontSize: 12.5, marginBottom: 14 }}>{t("vfc_night")} {vfcNuit} ms · {sleepHours}h · Hooper {hooperScore}/28</div>
    <button onClick={() => setDone(false)} style={btnGhost}>{t("edit")}</button></div></Card>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card label={t("hrv")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("vfc_night")} (ms)</div><input type="number" value={vfcNuit} onChange={e => setVfcNuit(+e.target.value)} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 600 }} /></div>
          <div><div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("rest_hr")} (bpm)</div><input type="number" value={fcRepos} onChange={e => setFcRepos(+e.target.value)} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 600 }} /></div>
        </div>
      </Card>
      <Card label={t("temp_label")}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: Math.abs(nightTemp) <= 0.3 ? ACCENT : Math.abs(nightTemp) <= 0.6 ? AMBER : RED }}>{nightTemp > 0 ? "+" : ""}{nightTemp.toFixed(1)}</span>
          <span style={{ fontSize: 13, color: MUTED }}>°C</span>
        </div>
        <input type="range" min={-1} max={1} step={0.1} value={nightTemp} onChange={e => setNightTemp(+e.target.value)} style={{ width: "100%" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: MUTED2, marginTop: 4 }}>
          <span>-1°C</span><span>0</span><span>+1°C</span>
        </div>
        <div style={{ fontSize: 10.5, color: MUTED2, marginTop: 8 }}>{t("night_temp_hint")}</div>
      </Card>
      <Card label={t("sleep")}>
        <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("hours")}</div>
          <input type="number" step="0.5" value={sleepHours} onChange={e => setSleepHours(+e.target.value)} style={{ ...inputStyle, width: 90, fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600 }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 11, color: MUTED2 }}>{t("quality")}</span><span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{sleepQuality}/5</span></div>
        <input type="range" min={1} max={5} value={sleepQuality} onChange={e => setSleepQuality(+e.target.value)} style={{ width: "100%" }} />
      </Card>
      <Card label={`${t("hooper_score")} — ${hooperScore}/28`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {HOOPER_ITEMS.map(item => (
            <div key={item.id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12.5 }}>{t("hooper_" + item.id)}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: hooper[item.id] >= 6 ? RED : hooper[item.id] >= 4 ? AMBER : ACCENT }}>{hooper[item.id]}/7</span></div>
              <input type="range" min={1} max={7} value={hooper[item.id]} onChange={e => setHooper(prev => ({ ...prev, [item.id]: +e.target.value }))} style={{ width: "100%" }} />
            </div>
          ))}
        </div>
      </Card>
      <button onClick={submit} style={btnPrimary}><Send size={16} /> {t("send_checkin")}</button>
    </div>
  );
}

// ============================================================
// ATHLETE — Cycle & symptômes (option Hormonal Readiness Engine)
// ============================================================
const CONTRACEPTION_OPTIONS = ["none", "combined_pill", "progestin_only", "iud_hormonal", "iud_copper", "implant", "patch_ring", "other"];
const REGULARITY_OPTIONS = ["regular", "somewhat_irregular", "irregular", "unknown"];

function CycleCheckinForm({ athlete, setAthletes, cycleCheckins, setCycleCheckins, athleteId, t }) {
  const [showSettings, setShowSettings] = useState(false);
  const todayEntry = (cycleCheckins[athleteId] || {})[TODAY];
  const [currentCycleDay, setCurrentCycleDay] = useState(todayEntry?.currentCycleDay ?? 1);
  const [isMenstruating, setIsMenstruating] = useState(todayEntry?.isMenstruating ?? false);
  const [symptomValues, setSymptomValues] = useState(todayEntry?.symptomValues ?? {});
  const [done, setDone] = useState(false);
  const enabledSymptoms = athlete.enabledSymptoms || DEFAULT_ENABLED_SYMPTOMS;
  const cycle = athlete.cycleInfo || { averageCycleLengthDays: 28, regularity: "regular", contraception: "none" };

  function updateCycleInfo(patch) {
    setAthletes(prev => prev.map(a => a.id === athleteId ? { ...a, cycleInfo: { ...a.cycleInfo, ...patch } } : a));
  }
  function toggleSymptomEnabled(key) {
    setAthletes(prev => prev.map(a => a.id === athleteId ? { ...a, enabledSymptoms: { ...(a.enabledSymptoms || DEFAULT_ENABLED_SYMPTOMS), [key]: !(a.enabledSymptoms || DEFAULT_ENABLED_SYMPTOMS)[key] } } : a));
  }

  // Synchronise le profil complet (infos de cycle + symptômes suivis) vers
  // Google Sheets — voir syncAthleteProfile pour la raison de toujours
  // envoyer l'objet complet plutôt qu'un sous-ensemble.
  useEffect(() => {
    const timeout = setTimeout(() => syncAthleteProfile(athlete), 800);
    return () => clearTimeout(timeout);
  }, [JSON.stringify(athlete.cycleInfo), JSON.stringify(athlete.enabledSymptoms)]);
  function submit() {
    const payload = { currentCycleDay, isMenstruating, symptomValues };
    setCycleCheckins(prev => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), [TODAY]: payload } }));
    sheetsPost({ action: "saveCycleCheckin", athleteId, date: TODAY, data: payload });
    setDone(true);
  }

  if (done) return (
    <Card>
      <div style={{ textAlign: "center", padding: "10px 0" }}>
        <CheckCircle2 size={30} color={ACCENT} style={{ marginBottom: 8 }} />
        <div style={{ color: MUTED, fontSize: 12.5 }}>{t("save_cycle_checkin")} ✓</div>
        <button onClick={() => setDone(false)} style={{ ...btnGhost, marginTop: 10 }}>{t("edit")}</button>
      </div>
    </Card>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#F06FA014", border: "1px solid #F06FA044", borderRadius: 10, padding: "10px 12px", fontSize: 11, color: MUTED }}>{t("hri_disclaimer")}</div>

      <Card label={t("cycle_day")}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <input type="number" min={1} max={45} value={currentCycleDay} onChange={e => setCurrentCycleDay(+e.target.value)} style={{ ...inputStyle, width: 90, fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 600 }} />
          <button onClick={() => setIsMenstruating(v => !v)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, cursor: "pointer",
            border: `1px solid ${isMenstruating ? "#F06FA088" : BORDER}`, background: isMenstruating ? "#F06FA018" : "transparent", color: isMenstruating ? "#F06FA0" : MUTED, fontSize: 12.5,
          }}>{t("is_menstruating")}</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("cycle_length")}</div>
            <input type="number" value={cycle.averageCycleLengthDays} onChange={e => updateCycleInfo({ averageCycleLengthDays: +e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} /></div>
          <div><div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("cycle_regularity")}</div>
            <select value={cycle.regularity} onChange={e => updateCycleInfo({ regularity: e.target.value })} style={inputStyle}>
              {REGULARITY_OPTIONS.map(r => <option key={r} value={r}>{t(`regularity_${r}`)}</option>)}
            </select></div>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("contraception")}</div>
          <select value={cycle.contraception} onChange={e => updateCycleInfo({ contraception: e.target.value })} style={inputStyle}>
            {CONTRACEPTION_OPTIONS.map(c => <option key={c} value={c}>{t(`contraception_${c}`)}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED, cursor: "pointer" }}>
            <input type="checkbox" checked={!!cycle.isPregnantOrPostpartum} onChange={e => updateCycleInfo({ isPregnantOrPostpartum: e.target.checked })} /> {t("pregnant_postpartum")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED, cursor: "pointer" }}>
            <input type="checkbox" checked={!!cycle.isPerimenopausal} onChange={e => updateCycleInfo({ isPerimenopausal: e.target.checked })} /> {t("perimenopausal")}
          </label>
        </div>
      </Card>

      <Card label={t("hormonal_symptoms_today")} right={<button onClick={() => setShowSettings(v => !v)} style={{ background: "transparent", border: "none", color: MUTED2, cursor: "pointer" }}><Info size={13} /></button>}>
        {showSettings && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
            {SYMPTOM_DEFINITIONS.map(def => (
              <button key={def.key} onClick={() => toggleSymptomEnabled(def.key)} style={{
                padding: "4px 9px", borderRadius: 999, fontSize: 10.5, cursor: "pointer",
                border: `1px solid ${enabledSymptoms[def.key] ? ACCENT + "55" : BORDER}`, background: enabledSymptoms[def.key] ? `${ACCENT}14` : "transparent", color: enabledSymptoms[def.key] ? ACCENT : MUTED2,
              }}>{t(def.labelKey)}</button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {SYMPTOM_DEFINITIONS.filter(def => enabledSymptoms[def.key]).map(def => {
            const val = symptomValues[def.key] ?? 0;
            const bad = def.direction === "worse" ? val >= 6 : val <= 4;
            return (
              <div key={def.key}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5 }}>{t(def.labelKey)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: bad ? RED : ACCENT }}>{val}/10</span>
                </div>
                <input type="range" min={0} max={10} value={val} onChange={e => setSymptomValues(prev => ({ ...prev, [def.key]: +e.target.value }))} style={{ width: "100%" }} />
              </div>
            );
          })}
        </div>
      </Card>

      <button onClick={submit} style={btnPrimary}><Send size={16} /> {t("save_cycle_checkin")}</button>
    </div>
  );
}


const SENSATION_IDS = ["good_shape", "tired", "breathless", "stiffness", "motivated", "acute_pain"];
const ZONE_IDS = ["shoulder_l", "shoulder_r", "low_back", "knee_l", "knee_r", "ankle_l", "ankle_r", "other"];

function DebriefForm({ debriefs, setDebriefs, athleteId, target, onDone, notify, t, lang }) {
  const [rpe, setRpe] = useState(7);
  const [duration, setDuration] = useState(target?.session?.items?.reduce((s, b) => s + (Number(b.time) || 0), 0) || 30);
  const [sensations, setSensations] = useState([]); const [painIntensity, setPainIntensity] = useState(0);
  const [zone, setZone] = useState(""); const [notes, setNotes] = useState(""); const [file, setFile] = useState(null);
  const [fileErr, setFileErr] = useState(""); const [done, setDone] = useState(false);
  function toggleSensation(s) { setSensations(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]); }
  function handleFile(f) { if (!f) return; const ext = f.name.split(".").pop().toLowerCase();
    if (!["csv", "fit", "gpx"].includes(ext)) { setFileErr("—"); return; } setFileErr(""); setFile({ name: f.name, ext }); }
  function submit() {
    const dateKey = target?.dateKey || TODAY; const sessionId = target?.session?.id || "none";
    const payload = { rpe, duration, painIntensity, zone, sensations, notes, file };
    setDebriefs(prev => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), [dateKey]: { ...(prev[athleteId]?.[dateKey] || {}), [sessionId]: payload } } }));
    sheetsPost({ action: "saveDebrief", athleteId, date: dateKey, sessionId, data: payload });
    notify("debrief", athleteId, `RPE ${rpe}/10, douleur ${painIntensity}/10`);
    setDone(true); if (onDone) onDone();
  }
  if (done) return <Card><div style={{ textAlign: "center", padding: "10px 0" }}><CheckCircle2 size={30} color={ACCENT} style={{ marginBottom: 8 }} />
    <div style={{ color: MUTED, fontSize: 12.5 }}>RPE {rpe}/10 · {duration} min{painIntensity > 0 ? ` · ${t("pain_intensity")} ${painIntensity}/10` : ""}</div></div></Card>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {target?.session?.title && <div style={{ fontSize: 12.5, color: MUTED }}>{target.session.title} — {fmtDate(target.dateKey, lang)}</div>}
      <Card label={t("rpe")}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 600, color: rpe >= 8 ? RED : rpe >= 6 ? AMBER : ACCENT }}>{rpe}</span><span style={{ fontSize: 12, color: MUTED }}>/10</span></div>
        <input type="range" min={1} max={10} value={rpe} onChange={e => setRpe(+e.target.value)} style={{ width: "100%" }} />
      </Card>
      <Card label={t("duration")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="number" value={duration} onChange={e => setDuration(+e.target.value)} style={{ ...inputStyle, width: 90, fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600 }} /><span style={{ fontSize: 12.5, color: MUTED }}>{t("minutes")}</span></div>
      </Card>
      <Card label={t("sensations")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SENSATION_IDS.map(s => { const active = sensations.includes(s); const acute = s === "acute_pain";
            return <button key={s} onClick={() => toggleSensation(s)} style={{ padding: "6px 11px", borderRadius: 999, fontSize: 12, cursor: "pointer",
              border: `1px solid ${active ? (acute ? RED : ACCENT) : BORDER}`, background: active ? (acute ? `${RED}18` : `${ACCENT}18`) : "transparent", color: active ? (acute ? RED : ACCENT) : MUTED }}>{t(s)}</button>; })}
        </div>
      </Card>
      <Card label={t("pain_intensity")}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 600, color: painIntensity >= 6 ? RED : painIntensity >= 3 ? AMBER : ACCENT }}>{painIntensity}</span><span style={{ fontSize: 12, color: MUTED }}>/10</span></div>
        <input type="range" min={0} max={10} value={painIntensity} onChange={e => setPainIntensity(+e.target.value)} style={{ width: "100%" }} />
        {painIntensity > 0 && <select value={zone} onChange={e => setZone(e.target.value)} style={{ ...inputStyle, marginTop: 10 }}><option value="">{t("zone")}…</option>{ZONE_IDS.map(z => <option key={z} value={z}>{t(z)}</option>)}</select>}
      </Card>
      <Card label={t("session_file")}>
        {file ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 11px" }}>
            <FileText size={15} color={ACCENT} /><span style={{ flex: 1, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</span>
            <button onClick={() => setFile(null)} style={{ background: "transparent", border: "none", color: MUTED2, cursor: "pointer" }}><X size={15} /></button></div>
        ) : (
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, border: `1.5px dashed ${BORDER}`, borderRadius: 10, padding: "18px 10px", cursor: "pointer" }}>
            <UploadCloud size={18} color={MUTED} /><span style={{ fontSize: 11.5, color: MUTED }}>{t("add_file")}</span><span style={{ fontSize: 10, color: MUTED2 }}>.csv · .fit · .gpx</span>
            <input type="file" accept=".csv,.fit,.gpx" onChange={e => handleFile(e.target.files?.[0])} style={{ display: "none" }} /></label>
        )}
        {fileErr && <div style={{ color: RED, fontSize: 11, marginTop: 6 }}>{fileErr}</div>}
      </Card>
      <Card label={t("notes")}><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} /></Card>
      <button onClick={submit} style={btnPrimary}><Send size={16} /> {t("send_debrief")}</button>
    </div>
  );
}

// ============================================================
// COACH — Inbox
// ============================================================
// ============================================================
// NUTRITION (optional per-athlete module)
// ============================================================
function NutritionModule({ athlete, setAthletes, sessions, debriefs, t }) {
  const [tab, setTab] = useState("plan"); // plan | profile
  const [composerSlot, setComposerSlot] = useState(null);
  const [composerSelection, setComposerSelection] = useState([]);
  const [fuelType, setFuelType] = useState("gel");
  const athleteId = athlete.id;
  const trainingTime = athlete.trainingTime || "07:00";
  const raceMode = athlete.raceMode || "none";
  const raceDurationHours = athlete.raceDurationHours || 3.5;
  const daySessions = (sessions[athleteId] || {})[TODAY] || [];
  const dayDebriefs = (debriefs?.[athleteId] || {})[TODAY] || {};
  const loadLevel = dayLoadLevel(daySessions, dayDebriefs);
  const fueling = computeSessionFueling(daySessions, athlete.profile.weight, dayDebriefs);
  const duringPlan = computeDuringSessionPlan(fueling, fuelType, athlete.carbsPerHourTarget);
  const targets = computeNutritionTargets(athlete.profile, loadLevel, raceMode);
  const distribution = computeSlotTargets(targets, fueling, trainingTime);
  const meals = pickMealsForTargets(athlete.diet || [], distribution.slots);
  const racePlan = raceMode === "race_day" ? computeRaceDayPlan(athlete.profile.weight, raceDurationHours, fuelType, athlete.carbsPerHourTarget) : null;

  // Synchronise le profil complet vers le Google Sheet de l'athlète à chaque
  // modification, avec un léger debounce pour éviter d'envoyer une requête
  // à chaque frappe. Utilise le point de synchronisation unique
  // (syncAthleteProfile) pour ne jamais écraser les champs gérés par
  // d'autres écrans (ex. suivi hormonal).
  useEffect(() => {
    const timeout = setTimeout(() => syncAthleteProfile(athlete), 800);
    return () => clearTimeout(timeout);
  }, [athlete.profile.weight, athlete.profile.height, athlete.profile.age, athlete.profile.sex, athlete.profile.goal, JSON.stringify(athlete.diet), athlete.nutritionEnabled, raceMode, trainingTime, raceDurationHours, JSON.stringify(athlete.mealOverrides), athlete.carbsPerHourTarget]);

  function updateProfile(patch) {
    setAthletes(prev => prev.map(a => a.id === athleteId ? { ...a, profile: { ...a.profile, ...patch } } : a));
  }
  function setTrainingTime(value) {
    setAthletes(prev => prev.map(a => a.id === athleteId ? { ...a, trainingTime: value } : a));
  }
  function setRaceMode(value) {
    setAthletes(prev => prev.map(a => a.id === athleteId ? { ...a, raceMode: value } : a));
  }
  function setRaceDuration(value) {
    setAthletes(prev => prev.map(a => a.id === athleteId ? { ...a, raceDurationHours: value } : a));
  }
  function setCarbsPerHour(value) {
    setAthletes(prev => prev.map(a => a.id === athleteId ? { ...a, carbsPerHourTarget: value } : a));
  }
  function toggleDiet(tag) {
    setAthletes(prev => prev.map(a => a.id === athleteId ? { ...a, diet: (a.diet || []).includes(tag) ? a.diet.filter(x => x !== tag) : [...(a.diet || []), tag] } : a));
  }
  function openComposer(slot) {
    const current = overrides[slot];
    setComposerSelection(current?.custom ? current.items.map(i => i.id) : []);
    setComposerSlot(slot);
  }
  function toggleIngredient(id) {
    setComposerSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 4 ? prev : [...prev, id]));
  }
  function validateComposer() {
    const composed = composeCustomMeal(composerSelection, distribution.slots, composerSlot);
    if (composed) setAthletes(prev => prev.map(a => a.id === athleteId ? { ...a, mealOverrides: { ...(a.mealOverrides || {}), [composerSlot]: composed } } : a));
    setComposerSlot(null); setComposerSelection([]);
  }

  const loadLabelKey = ["load_rest", "load_moderate", "load_high", "load_very_high"][loadLevel];
  const loadTone = [MUTED2, ACCENT, AMBER, RED][loadLevel];

  // apply overrides (repas composés manuellement par l'athlète)
  const overrides = athlete.mealOverrides || {};
  const finalMeals = { ...meals };
  MEAL_SLOTS.forEach(slot => { if (overrides[slot]) finalMeals[slot] = overrides[slot]; });
  const finalTotals = Object.values(finalMeals).filter(Boolean).reduce((acc, m) => ({
    kcal: acc.kcal + m.kcal, carbs: acc.carbs + m.carbs, protein: acc.protein + m.protein, fat: acc.fat + m.fat,
  }), { kcal: 0, carbs: 0, protein: 0, fat: 0 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {["plan", "profile"].map(tb => (
          <button key={tb} onClick={() => setTab(tb)} style={{
            flex: 1, padding: "8px", borderRadius: 9, fontSize: 12.5, cursor: "pointer",
            border: `1px solid ${tab === tb ? ACCENT + "88" : BORDER}`, background: tab === tb ? `${ACCENT}14` : "transparent", color: tab === tb ? ACCENT : MUTED,
          }}>{tb === "plan" ? t("meal_plan") : t("profile")}</button>
        ))}
      </div>

      {tab === "profile" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card label={t("profile")}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("weight")}</div>
                <input type="number" value={athlete.profile.weight} onChange={e => updateProfile({ weight: +e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} /></div>
              <div><div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("height")}</div>
                <input type="number" value={athlete.profile.height} onChange={e => updateProfile({ height: +e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} /></div>
              <div><div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("age")}</div>
                <input type="number" value={athlete.profile.age} onChange={e => updateProfile({ age: +e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} /></div>
              <div><div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("sex")}</div>
                <select value={athlete.profile.sex} onChange={e => updateProfile({ sex: e.target.value })} style={inputStyle}>
                  <option value="f">{t("female")}</option><option value="m">{t("male")}</option>
                </select></div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("goal")}</div>
              <select value={athlete.profile.goal} onChange={e => updateProfile({ goal: e.target.value })} style={inputStyle}>
                <option value="perf">{t("goal_perf")}</option><option value="lean">{t("goal_lean")}</option><option value="maintenance">{t("goal_maintenance")}</option>
              </select>
            </div>
          </Card>
          <Card label={t("race_objective")}>
            <div style={{ display: "flex", gap: 6, marginBottom: raceMode === "race_day" ? 12 : 0 }}>
              {["none", "carb_load", "race_day"].map(mode => (
                <button key={mode} onClick={() => setRaceMode(mode)} style={{
                  flex: 1, padding: "8px 4px", borderRadius: 9, fontSize: 11.5, cursor: "pointer",
                  border: `1px solid ${raceMode === mode ? ACCENT + "88" : BORDER}`, background: raceMode === mode ? `${ACCENT}14` : "transparent",
                  color: raceMode === mode ? ACCENT : MUTED,
                }}>{t(`race_mode_${mode}`)}</button>
              ))}
            </div>
            {raceMode === "carb_load" && <div style={{ fontSize: 11.5, color: AMBER }}>{t("carb_load_active_note")}</div>}
            {raceMode === "race_day" && (
              <div>
                <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4 }}>{t("race_duration")}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <input type="number" step="0.25" value={raceDurationHours} onChange={e => setRaceDuration(+e.target.value)} style={{ ...inputStyle, width: 90, fontFamily: "'JetBrains Mono', monospace" }} />
                  <span style={{ fontSize: 12, color: MUTED }}>h</span>
                </div>
              </div>
            )}
          </Card>
          <Card label={t("diet_prefs")}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {DIET_TAGS.map(tag => {
                const active = (athlete.diet || []).includes(tag);
                return <button key={tag} onClick={() => toggleDiet(tag)} style={{
                  padding: "6px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer",
                  border: `1px solid ${active ? ACCENT : BORDER}`, background: active ? `${ACCENT}18` : "transparent", color: active ? ACCENT : MUTED,
                }}>{t(tag)}</button>;
              })}
            </div>
          </Card>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: MUTED }}>{t("training_load")}</span>
            <Badge tone={loadTone}>{t(loadLabelKey)}</Badge>
          </div>

          <Card label={t("training_time")}>
            <input type="time" value={trainingTime} onChange={e => setTrainingTime(e.target.value)} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600, width: 130 }} />
            <div style={{ fontSize: 11, color: MUTED2, marginTop: 6 }}>{t("meal_time_hint")}</div>
          </Card>

          {raceMode === "race_day" && racePlan && (
            <Card label={t("race_day_plan")} right={<span style={{ fontSize: 9.5, color: AMBER }}>{t("guide_source")}</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4, fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: 0.4 }}>{t("pre_race_meal")}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: MUTED2 }}>{racePlan.preHours}{t("hours_before")}</span>
                    <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{racePlan.preCarbG}g {t("carbs").toLowerCase()} + {racePlan.preProteinG}g {t("protein").toLowerCase()}</b>
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4, fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: 0.4 }}>{t("in_race_fueling")}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                    <span style={{ color: MUTED2 }}>{racePlan.duringMin}-{racePlan.duringMax}g{t("per_hour")}</span>
                    <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{racePlan.totalCarbs}g · {racePlan.totalFluidMl}ml</b>
                  </div>
                  <div style={{ fontSize: 10.5, color: MUTED2 }}>{t("dual_source_note")}</div>
                </div>
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: MUTED2, marginBottom: 4, fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: 0.4 }}>{t("post_race_recovery")}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: MUTED2 }}>{t("post_session")}</span>
                    <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{racePlan.postCarbG}g {t("carbs").toLowerCase()} + {racePlan.postProteinG}g {t("protein").toLowerCase()}</b>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {raceMode === "race_day" && racePlan && (
            <Card label={t("during_fuel_plan")}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, color: MUTED2, marginBottom: 5 }}>{t("carbs_per_hour_strategy")}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {CARBS_PER_HOUR_OPTIONS.map(g => (
                    <button key={g} onClick={() => setCarbsPerHour(g)} style={{
                      flex: 1, padding: "6px 4px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                      border: `1px solid ${(athlete.carbsPerHourTarget || 60) === g ? ACCENT + "88" : BORDER}`, background: (athlete.carbsPerHourTarget || 60) === g ? `${ACCENT}14` : "transparent",
                      color: (athlete.carbsPerHourTarget || 60) === g ? ACCENT : MUTED,
                    }}>{g}g/h</button>
                  ))}
                </div>
                {racePlan.outsideGuideRange && <div style={{ fontSize: 10.5, color: AMBER, marginTop: 6 }}>{t("outside_guide_range").replace("{min}", racePlan.duringMin).replace("{max}", racePlan.duringMax)}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {FUEL_PRODUCTS.map(p => (
                  <button key={p.type} onClick={() => setFuelType(p.type)} style={{
                    flex: 1, padding: "6px 4px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                    border: `1px solid ${fuelType === p.type ? ACCENT + "88" : BORDER}`, background: fuelType === p.type ? `${ACCENT}14` : "transparent",
                    color: fuelType === p.type ? ACCENT : MUTED,
                  }}>{t(`fuel_${p.type}`)}</button>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {racePlan.timeline.map((ev, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 10px", fontSize: 12 }}>
                    <span style={{ color: MUTED2 }}>{t("at_minute")} {ev.minute} min</span>
                    <span>{ev.product.name} <span style={{ color: MUTED2 }}>(+{ev.product.carbsPerUnit}g {t("carbs").toLowerCase()})</span></span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {raceMode !== "race_day" && (fueling ? (
            <Card label={t("fueling_window")} right={<span style={{ fontSize: 9.5, color: fueling.usesActualData ? ACCENT : MUTED2 }}>{fueling.usesActualData ? t("based_on_debrief") : t("guide_source")}</span>}>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10, textTransform: "capitalize" }}>{t(fueling.category)} · {fueling.totalMin} min</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ color: MUTED2 }}>{t("pre_session")} ({fueling.preHours}{t("hours_before")})</span>
                  <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fueling.preCarbG}g {t("carbs").toLowerCase()}</b>
                </div>
                {fueling.duringMax > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: MUTED2 }}>{t("during_session")}</span>
                    <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fueling.duringMin}-{fueling.duringMax}g{t("per_hour")} · {fueling.duringFluid}ml {t("fluid").toLowerCase()}{t("per_hour")}</b>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ color: MUTED2 }}>{t("post_session")}</span>
                  <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fueling.postCarbG}g {t("carbs").toLowerCase()} + {fueling.postProteinG}g {t("protein").toLowerCase()}</b>
                </div>
              </div>
              {fueling.note && <div style={{ fontSize: 11, color: AMBER, marginTop: 10 }}>{t(fueling.note)}</div>}
            </Card>
          ) : (
            <div style={{ fontSize: 12, color: MUTED2, textAlign: "center", padding: "6px 0" }}>{t("no_endurance_today")}</div>
          ))}

          {raceMode !== "race_day" && duringPlan && (
            <Card label={t("during_fuel_plan")}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, color: MUTED2, marginBottom: 5 }}>{t("carbs_per_hour_strategy")}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {CARBS_PER_HOUR_OPTIONS.map(g => (
                    <button key={g} onClick={() => setCarbsPerHour(g)} style={{
                      flex: 1, padding: "6px 4px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                      border: `1px solid ${(athlete.carbsPerHourTarget || 60) === g ? ACCENT + "88" : BORDER}`, background: (athlete.carbsPerHourTarget || 60) === g ? `${ACCENT}14` : "transparent",
                      color: (athlete.carbsPerHourTarget || 60) === g ? ACCENT : MUTED,
                    }}>{g}g/h</button>
                  ))}
                </div>
                {duringPlan.outsideGuideRange && <div style={{ fontSize: 10.5, color: AMBER, marginTop: 6 }}>{t("outside_guide_range").replace("{min}", fueling.duringMin).replace("{max}", fueling.duringMax)}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {FUEL_PRODUCTS.map(p => (
                  <button key={p.type} onClick={() => setFuelType(p.type)} style={{
                    flex: 1, padding: "6px 4px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                    border: `1px solid ${fuelType === p.type ? ACCENT + "88" : BORDER}`, background: fuelType === p.type ? `${ACCENT}14` : "transparent",
                    color: fuelType === p.type ? ACCENT : MUTED,
                  }}>{t(`fuel_${p.type}`)}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, fontSize: 12, color: MUTED, marginBottom: 10 }}>
                <span><b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{duringPlan.units}</b> {duringPlan.product.name.toLowerCase()} ({duringPlan.units} {t("units_needed")})</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {duringPlan.timeline.map((ev, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 10px", fontSize: 12 }}>
                    <span style={{ color: MUTED2 }}>{t("at_minute")} {ev.minute} min</span>
                    <span>{ev.product.name} <span style={{ color: MUTED2 }}>(+{ev.product.carbsPerUnit}g {t("carbs").toLowerCase()})</span></span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                <span>{t("total_fluid")}</span><b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{duringPlan.totalFluidMl} ml</b>
              </div>
            </Card>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 }}>
            <MetricCard icon={Flame} label={t("kcal")} value={targets.kcal} />
            <MetricCard icon={Salad} label={t("carbs")} value={targets.carbs} unit="g" />
            <MetricCard icon={Dumbbell} label={t("protein")} value={targets.protein} unit="g" />
            <MetricCard icon={Apple} label={t("fat")} value={targets.fat} unit="g" />
          </div>

          <Card label={t("meal_plan")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {MEAL_SLOTS.map(slot => {
                const m = finalMeals[slot];
                const isComposing = composerSlot === slot;
                return (
                  <div key={slot} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: (m || isComposing) ? 4 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10.5, color: MUTED2, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Space Grotesk', sans-serif" }}>{t(slot)}</span>
                        {slot === distribution.preSlot && <span style={{ fontSize: 9, color: AMBER, background: `${AMBER}18`, borderRadius: 999, padding: "2px 7px" }}>{t("pre_meal_tag")}</span>}
                        {slot === distribution.postSlot && <span style={{ fontSize: 9, color: ACCENT, background: `${ACCENT}18`, borderRadius: 999, padding: "2px 7px" }}>{t("post_meal_tag")}</span>}
                      </div>
                      {!isComposing && <button onClick={() => openComposer(slot)} style={{ background: "transparent", border: "none", color: ACCENT, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}><ChevronDown size={12} /> {t("swap_meal")}</button>}
                    </div>

                    {isComposing ? (
                      <div>
                        <div style={{ fontSize: 11, color: MUTED2, marginBottom: 8 }}>{t("select_ingredients_hint")}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                          {INGREDIENT_LIBRARY.filter(ing => (athlete.diet || []).every(tag => ing.tags.includes(tag))).map(ing => {
                            const active = composerSelection.includes(ing.id);
                            return <button key={ing.id} onClick={() => toggleIngredient(ing.id)} style={{
                              padding: "5px 10px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                              border: `1px solid ${active ? ACCENT : BORDER}`, background: active ? `${ACCENT}18` : SURFACE, color: active ? ACCENT : MUTED,
                            }}>{ing.name}</button>;
                          })}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setComposerSlot(null); setComposerSelection([]); }} style={{ ...btnGhost, flex: 1, justifyContent: "center", padding: "7px" }}>{t("cancel")}</button>
                          <button onClick={validateComposer} disabled={composerSelection.length === 0} style={{ ...btnPrimary, flex: 1, padding: "7px", opacity: composerSelection.length === 0 ? 0.5 : 1 }}>{t("validate")}</button>
                        </div>
                      </div>
                    ) : m ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{m.custom ? t("custom_meal") : m.name}</div>
                        {m.custom && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 }}>
                            {m.items.map(it => (
                              <div key={it.id} style={{ fontSize: 11.5, color: MUTED, display: "flex", justifyContent: "space-between" }}>
                                <span>{it.name}</span><span style={{ fontFamily: "'JetBrains Mono', monospace", color: INK }}>{it.grams}g {t("to_prepare")}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, fontSize: 11, color: MUTED }}>
                          <span>{m.kcal} kcal</span><span>{m.carbs}g {t("carbs").toLowerCase()}</span><span>{m.protein}g {t("protein").toLowerCase()}</span><span>{m.fat}g {t("fat").toLowerCase()}</span>
                        </div>
                      </>
                    ) : <div style={{ fontSize: 12, color: MUTED2 }}>{t("no_recipe")}</div>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card label={t("total_vs_target")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[["kcal", "kcal"], ["carbs", "g"], ["protein", "g"], ["fat", "g"]].map(([key, unit]) => {
                const pct = Math.min(100, Math.round((finalTotals[key] / targets[key]) * 100));
                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTED, marginBottom: 3 }}>
                      <span>{t(key)}</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{finalTotals[key]}/{targets[key]}{unit}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: BORDER, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct > 100 ? RED : ACCENT, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function NutritionGate({ athlete, setAthletes, sessions, debriefs, t }) {
  if (!athlete) return <div style={{ color: MUTED2, fontSize: 13 }}>{t("pick_athlete")}</div>;
  if (!athlete.nutritionEnabled) return (
    <div style={{ textAlign: "center", padding: "30px 10px" }}>
      <Apple size={26} color={MUTED2} style={{ marginBottom: 10 }} />
      <div style={{ color: MUTED, fontSize: 13, marginBottom: 4 }}>{t("nutrition_disabled_athlete")}</div>
      <div style={{ color: MUTED2, fontSize: 12 }}>{t("enable_nutrition_hint")}</div>
    </div>
  );
  return <NutritionModule athlete={athlete} setAthletes={setAthletes} sessions={sessions} debriefs={debriefs} t={t} />;
}

function CoachInbox({ athletes, checkins, debriefs, activeId, setActiveId, t, lang }) {
  const athlete = athletes.find(a => a.id === activeId);
  const athCheckins = checkins[activeId] || {};
  const athDebriefs = debriefs[activeId] || {};
  const dates = Array.from(new Set([...Object.keys(athCheckins), ...Object.keys(athDebriefs)])).sort().reverse();
  return (
    <div>
      <AthletePicker athletes={athletes} activeId={activeId} setActiveId={setActiveId} t={t} />
      {!athlete ? <div style={{ color: MUTED2, fontSize: 13 }}>{t("pick_athlete")}</div> : dates.length === 0 ? <div style={{ color: MUTED2, fontSize: 13 }}>{t("no_data")}</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dates.map(d => {
            const c = athCheckins[d]; const debBySession = athDebriefs[d] || {};
            return <Card key={d} label={fmtDate(d, lang)}>
              {c && <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: Object.keys(debBySession).length ? 10 : 0, fontSize: 12 }}>
                <span style={{ color: MUTED }}>{t("vfc_night")} <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{c.vfcNuit}ms</b></span>
                <span style={{ color: MUTED }}>{t("sleep")} <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{c.sleepHours}h</b></span>
                <span style={{ color: MUTED }}>{t("hooper_score")} <b style={{ color: TONE[hooperTone(c.hooper)], fontFamily: "'JetBrains Mono', monospace" }}>{c.hooper}/28</b></span>
              </div>}
              {Object.values(debBySession).map((deb, i) => (
                <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, marginTop: i > 0 ? 8 : 0 }}>
                  <span style={{ color: MUTED }}>{t("rpe").split(" ")[0]} <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{deb.rpe}/10</b></span>
                  <span style={{ color: MUTED }}>{t("duration")} <b style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{deb.duration} min</b></span>
                  <span style={{ color: MUTED }}>{t("pain")} <b style={{ color: deb.painIntensity >= 5 ? RED : INK, fontFamily: "'JetBrains Mono', monospace" }}>{deb.painIntensity}/10</b>{deb.zone ? ` (${t(deb.zone)})` : ""}</span>
                  {deb.file && <span style={{ color: ACCENT }}><FileText size={11} style={{ verticalAlign: -1, marginRight: 3 }} />{deb.file.name}</span>}
                  {deb.notes && <div style={{ width: "100%", color: MUTED2, fontStyle: "italic" }}>« {deb.notes} »</div>}
                </div>
              ))}
            </Card>;
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ROOT APP
// ============================================================
export default function BioSyncApp() {
  const [lang, setLang] = useState("fr");
  const t = useT(lang);
  const [user, setUser] = useState(null);
  const [athletes, setAthletes] = useState(ATHLETES_SEED);
  const [sessions, setSessions] = useState(SESSIONS_SEED);
  const [checkins, setCheckins] = useState(CHECKINS_SEED);
  const [debriefs, setDebriefs] = useState(DEBRIEFS_SEED);
  const [cycleCheckins, setCycleCheckins] = useState(CYCLE_CHECKINS_SEED);
  const [messages, setMessages] = useState(MSG_SEED);
  const [notifs, setNotifs] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const [coachTab, setCoachTab] = useState("athletes");
  const [coachActiveAthlete, setCoachActiveAthlete] = useState(athletes[0]?.id);
  const [athleteTab, setAthleteTab] = useState("calendar");
  const [debriefTarget, setDebriefTarget] = useState(null);

  function pushNotif(role, athleteId, text) {
    setNotifs(prev => [...prev, { id: uid(), role, athleteId, text, time: "maintenant", read: false }]);
  }

  // Charge les données d'un athlète depuis Google Sheets (si SHEETS_API_URL est configuré)
  // et les fusionne dans l'état local.
  async function loadAthleteData(athleteId) {
    const data = await sheetsGet({ action: "getAthleteData", athleteId });
    if (!data || data.error) return;
    if (data.profile) setAthletes(prev => prev.map(a => a.id === athleteId ? {
      ...a,
      profile: { weight: data.profile.weight, height: data.profile.height, age: data.profile.age, sex: data.profile.sex, goal: data.profile.goal },
      diet: data.profile.diet || [], nutritionEnabled: !!data.profile.nutritionEnabled,
      raceMode: data.profile.raceMode || "none", trainingTime: data.profile.trainingTime || "07:00",
      raceDurationHours: data.profile.raceDurationHours || 3.5, mealOverrides: data.profile.mealOverrides || {},
      carbsPerHourTarget: data.profile.carbsPerHourTarget || 60,
      hormonalTrackingEnabled: !!data.profile.hormonalTrackingEnabled,
      cycleInfo: data.profile.cycleInfo || a.cycleInfo, enabledSymptoms: Object.keys(data.profile.enabledSymptoms || {}).length ? data.profile.enabledSymptoms : (a.enabledSymptoms || DEFAULT_ENABLED_SYMPTOMS),
    } : a));
    if (data.checkins) setCheckins(prev => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), ...data.checkins } }));
    if (data.sessions) setSessions(prev => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), ...data.sessions } }));
    if (data.debriefs) setDebriefs(prev => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), ...data.debriefs } }));
    if (data.cycleCheckins) setCycleCheckins(prev => ({ ...prev, [athleteId]: { ...(prev[athleteId] || {}), ...data.cycleCheckins } }));
    if (data.messages) setMessages(prev => ({ ...prev, [athleteId]: data.messages.length ? data.messages.map(m => ({ id: uid(), from: m.from, text: m.text, time: m.time })) : (prev[athleteId] || []) }));
  }

  // Recharge la liste complète des athlètes déjà enregistrés côté Google
  // Sheets au démarrage de l'app. Sans ça, seuls les athlètes de démo codés
  // en dur dans ATHLETES_SEED sont visibles : un athlète ajouté par le coach
  // "disparaît" après une reconnexion alors qu'il existe bien dans Drive,
  // car son Sheet n'était simplement jamais relu.
  useEffect(() => {
    (async () => {
      const list = await sheetsGet({ action: "listAthletes" });
      if (!list || list.error || !Array.isArray(list)) return;
      setAthletes(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const palette = [ACCENT, AMBER, BLUE, "#C68CFF", "#F06FA0"];
        const newOnes = list.filter(r => r.athleteId && !existingIds.has(r.athleteId)).map((r, i) => {
          const initials = (r.name || "").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
          return {
            id: r.athleteId, name: r.name, initials, tone: palette[(prev.length + i) % palette.length],
            username: String(r.username || ""), password: String(r.password || ""),
            nutritionEnabled: !!r.nutritionEnabled,
            profile: { weight: 65, height: 172, age: 25, sex: r.sex || "f", goal: "perf" }, diet: [],
            hormonalTrackingEnabled: !!r.hormonalTrackingEnabled,
            cycleInfo: { averageCycleLengthDays: 28, regularity: "regular", contraception: "none", isPregnantOrPostpartum: false, isPerimenopausal: false },
            enabledSymptoms: { ...DEFAULT_ENABLED_SYMPTOMS },
          };
        });
        return newOnes.length ? [...prev, ...newOnes] : prev;
      });
    })();
  }, []);

  useEffect(() => {
    if (user?.role === "athlete") loadAthleteData(user.athleteId);
  }, [user]);

  useEffect(() => {
    if (user?.role === "coach" && coachActiveAthlete) loadAthleteData(coachActiveAthlete);
  }, [coachActiveAthlete, user]);

  // role of notif target: "coach" (any athlete event -> coach sees it),
  // "athlete" (session created/edited -> that athlete), "coach_to_athlete" / "athlete_to_coach" for messages
  function notifyCoachEvent(kind, athleteId, detail) {
    const athlete = athletes.find(a => a.id === athleteId);
    const label = kind === "checkin" ? "check-in matinal" : "debrief de séance";
    pushNotif("coach", athleteId, `${athlete?.name || ""} a envoyé un ${label} — ${detail}`);
  }
  function notifySessionEvent(athleteId, detail) {
    pushNotif("athlete", athleteId, `Nouvelle séance / mise à jour — ${detail}`);
  }
  function notifyMessage(direction, athleteId, text) {
    const athlete = athletes.find(a => a.id === athleteId);
    if (direction === "athlete_to_coach") pushNotif("coach", athleteId, `Message de ${athlete?.name || ""} : ${text.slice(0, 60)}`);
    else pushNotif("athlete", athleteId, `Message du coach : ${text.slice(0, 60)}`);
  }

  if (!user) return <LoginScreen athletes={athletes} onLogin={setUser} lang={lang} setLang={setLang} t={t} />;

  function logout() { setUser(null); setNotifOpen(false); }
  function markRead() { setNotifs(prev => prev.map(n => ({ ...n, read: true }))); }

  const myNotifs = user.role === "coach" ? notifs.filter(n => n.role === "coach") : notifs.filter(n => n.role === "athlete" && n.athleteId === user.athleteId);

  if (user.role === "coach") {
    const tabs = [
      { id: "athletes", label: t("nav_athletes"), icon: Users },
      { id: "calendar", label: t("nav_sessions"), icon: CalIcon },
      { id: "dashboard", label: t("nav_dashboard"), icon: Activity },
      { id: "nutrition", label: t("nav_nutrition"), icon: Apple },
      { id: "inbox", label: t("nav_inbox"), icon: FileText },
      { id: "messages", label: t("nav_messages"), icon: MessageSquare },
    ];
    const activeAthleteObj = athletes.find(a => a.id === coachActiveAthlete);
    return (
      <Shell title={`${user.name}`} subtitle={t("space_coach")} tabs={tabs} tab={coachTab} setTab={setCoachTab} onLogout={logout}
        notifs={myNotifs} onOpenNotifs={markRead} notifOpen={notifOpen} setNotifOpen={setNotifOpen} t={t}>
        {coachTab === "athletes" && <AthleteManager athletes={athletes} setAthletes={setAthletes} t={t} />}
        {coachTab === "calendar" && <>
          <AthletePicker athletes={athletes} activeId={coachActiveAthlete} setActiveId={setCoachActiveAthlete} t={t} />
          {coachActiveAthlete && <SessionCalendar sessions={sessions} setSessions={setSessions} athleteId={coachActiveAthlete} readOnly={false} notify={notifySessionEvent} t={t} lang={lang} />}
        </>}
        {coachTab === "dashboard" && <>
          <AthletePicker athletes={athletes} activeId={coachActiveAthlete} setActiveId={setCoachActiveAthlete} t={t} />
          {coachActiveAthlete && <RecoveryDashboard checkins={checkins} debriefs={debriefs} sessions={sessions} cycleCheckins={cycleCheckins} athlete={activeAthleteObj} athleteId={coachActiveAthlete} t={t} lang={lang} />}
        </>}
        {coachTab === "nutrition" && <>
          <AthletePicker athletes={athletes} activeId={coachActiveAthlete} setActiveId={setCoachActiveAthlete} t={t} />
          <NutritionGate athlete={activeAthleteObj} setAthletes={setAthletes} sessions={sessions} debriefs={debriefs} t={t} />
        </>}
        {coachTab === "inbox" && <CoachInbox athletes={athletes} checkins={checkins} debriefs={debriefs} activeId={coachActiveAthlete} setActiveId={setCoachActiveAthlete} t={t} lang={lang} />}
        {coachTab === "messages" && <Messages messages={messages} setMessages={setMessages} athletes={athletes} activeId={coachActiveAthlete} setActiveId={setCoachActiveAthlete} role="coach" notify={notifyMessage} t={t} />}
      </Shell>
    );
  }

  const me = athletes.find(a => a.id === user.athleteId);
  const tabs = [
    { id: "calendar", label: t("nav_calendar"), icon: CalIcon },
    { id: "checkin", label: t("nav_checkin"), icon: BedDouble },
    { id: "debrief", label: t("nav_debrief"), icon: Activity },
    { id: "dashboard", label: t("nav_dashboard"), icon: HeartPulse },
    ...(me?.nutritionEnabled ? [{ id: "nutrition", label: t("nav_nutrition"), icon: Apple }] : []),
    ...(me?.hormonalTrackingEnabled ? [{ id: "cycle", label: t("nav_cycle"), icon: Moon }] : []),
    { id: "messages", label: t("nav_messages"), icon: MessageSquare },
  ];
  return (
    <Shell title={`${user.name.split(" ")[0]}`} subtitle={t("space_athlete")} tabs={tabs} tab={athleteTab} setTab={setAthleteTab} onLogout={logout}
      notifs={myNotifs} onOpenNotifs={markRead} notifOpen={notifOpen} setNotifOpen={setNotifOpen} t={t}>
      {athleteTab === "calendar" && (
        <SessionCalendar sessions={sessions} setSessions={setSessions} athleteId={user.athleteId} readOnly notify={() => {}} t={t} lang={lang}
          onOpenDebrief={(dateKey, session) => { setDebriefTarget({ dateKey, session }); setAthleteTab("debrief"); }} />
      )}
      {athleteTab === "checkin" && <CheckinForm checkins={checkins} setCheckins={setCheckins} athleteId={user.athleteId} notify={notifyCoachEvent} t={t} />}
      {athleteTab === "debrief" && <DebriefForm debriefs={debriefs} setDebriefs={setDebriefs} athleteId={user.athleteId} target={debriefTarget} onDone={() => setDebriefTarget(null)} notify={notifyCoachEvent} t={t} lang={lang} />}
      {athleteTab === "dashboard" && <RecoveryDashboard checkins={checkins} debriefs={debriefs} sessions={sessions} cycleCheckins={cycleCheckins} athlete={me} athleteId={user.athleteId} t={t} lang={lang} />}
      {athleteTab === "nutrition" && me?.nutritionEnabled && <NutritionGate athlete={me} setAthletes={setAthletes} sessions={sessions} debriefs={debriefs} t={t} />}
      {athleteTab === "cycle" && me?.hormonalTrackingEnabled && <CycleCheckinForm athlete={me} setAthletes={setAthletes} cycleCheckins={cycleCheckins} setCycleCheckins={setCycleCheckins} athleteId={user.athleteId} t={t} />}
      {athleteTab === "messages" && <Messages messages={messages} setMessages={setMessages} athletes={athletes} activeId={user.athleteId} setActiveId={() => {}} role="athlete" notify={notifyMessage} t={t} />}
    </Shell>
  );
}

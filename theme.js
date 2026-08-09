// ============================================================================
// src/theme.js
// ----------------------------------------------------------------------------
// Tokens de design partagés entre App.jsx et les composants du module CMJ
// (src/cmj/*.jsx). Extrait d'App.jsx pour casser une dépendance circulaire :
// App.jsx importait NeuromuscularCard.jsx/CMJTestScreen.jsx, qui importaient
// à leur tour les couleurs depuis "../App.jsx" — un module en cours de
// chargement qui n'avait pas encore fini de définir ses propres constantes.
// Résultat : ReferenceError (TDZ) au chargement, avant même le premier
// rendu React → écran noir. Ce fichier n'a AUCUNE dépendance vers App.jsx :
// il peut être importé par n'importe qui sans jamais créer de cycle.
// ============================================================================
export const BG = "#0B1220";
export const SURFACE = "#131B2C";
export const BORDER = "#1E2A40";
export const INK = "#E8EDF5";
export const MUTED = "#7C8AA3";
export const MUTED2 = "#5B6883";
export const ACCENT = "#3DDC97";
export const AMBER = "#F5A623";
export const RED = "#F0554B";
export const BLUE = "#4EA1F5";
export const TONE = { green: ACCENT, amber: AMBER, red: RED, muted: MUTED2 };

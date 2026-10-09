// ============================================================================
// src/notifications/pushNotifications.js — BioSync
// ----------------------------------------------------------------------------
// Notifications natives (Notifications API + Service Worker), pour qu'un
// message coach/athlète apparaisse dans le centre de notifications du
// téléphone — pas seulement dans la cloche in-app.
//
// ⚠️ LIMITE HONNÊTE À CONNAÎTRE : ce mécanisme fonctionne quand l'app est
// ouverte OU en arrière-plan (onglet/app pas totalement fermée) — c'est le
// cas sur la grande majorité des sessions mobiles réelles (app ouverte le
// matin pour le check-in, puis mise en arrière-plan). Une VRAIE notification
// push quand l'app est complètement fermée exige un serveur Web Push dédié
// (clés VAPID + abonnement stocké + envoi déclenché côté serveur), ce que
// Google Apps Script ne permet pas facilement — c'est un chantier à part,
// pas inclus ici (même nature de limite que Web Bluetooth sur Safari iOS,
// déjà documentée pour le module Morning Check-in).
//
// Aucune dépendance à App.jsx — fichier autonome, appelable depuis
// n'importe où (pushNotif() dans App.jsx notamment).
// ============================================================================

export function isNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission() {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

// DOIT être appelé depuis un geste utilisateur explicite (tap sur un bouton)
// — comme getUserMedia/Web Bluetooth ailleurs dans l'app, les navigateurs
// ignorent ou bloquent la demande de permission si elle n'est pas liée à
// une interaction humaine directe.
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch (err) {
    return "denied";
  }
}

export async function registerNotificationServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    return null;
  }
}

// Affiche une notification native. Passe par le Service Worker
// (`registration.showNotification`) plutôt que `new Notification()` directe
// — plus fiable sur mobile pour qu'elle atterrisse bien dans le centre de
// notifications du système plutôt que seulement dans l'onglet actif.
// Repli automatique sur `new Notification()` si le Service Worker n'est
// pas encore prêt, pour ne jamais silencieusement échouer.
export async function showLocalNotification(title, options = {}) {
  if (!isNotificationSupported() || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      ...options,
    });
    return true;
  } catch (err) {
    try {
      new Notification(title, options);
      return true;
    } catch (err2) {
      return false;
    }
  }
}

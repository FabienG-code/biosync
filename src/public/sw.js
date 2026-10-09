// ============================================================================
// public/sw.js — BioSync
// ----------------------------------------------------------------------------
// Service Worker minimal, uniquement au service des notifications natives
// (pushNotifications.js). Ne fait PAS de mise en cache offline pour
// l'instant — hors scope de cette fonctionnalité, à ajouter séparément si
// un mode hors-ligne est souhaité un jour.
// ============================================================================

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Tap sur une notification -> ramène l'utilisateur sur l'app (nouvel onglet
// si aucun n'est déjà ouvert, sinon focus sur l'onglet existant).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});

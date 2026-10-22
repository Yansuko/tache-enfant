// Service Worker pour DailyKids - Gestion des notifications push
// self.addEventListener('push', event) - reçoit les notifications
// self.addEventListener('notificationclick', event) - gère les clics
// self.addEventListener('notificationclose', event) - gère la fermeture

// Log au démarrage du Service Worker
console.log('[SW] Service Worker script loaded');
console.log('[SW-SCOPE] Scope:', self.location.href);

self.addEventListener('push', event => {
  console.log('[SW-PUSH] Notification received:', event);

  if (!event.data) {
    console.log('[SW-PUSH] Empty notification received');
    return;
  }

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    // Fallback if not JSON
    payload = { title: 'DailyKids', body: event.data.text() };
  }

  const {
    title = 'DailyKids',
    body = '',
    icon = '/logo-192.png',
    badge = '/logo-96.png',
    tag = 'dailykids-notification',
    data = {},
  } = payload;

  const options = {
    body,
    icon,
    badge,
    tag,
    data,
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log('[SW-PUSH] Notification shown:', title))
      .catch(err => console.error('[SW-PUSH] Failed to show notification:', err))
  );
});

self.addEventListener('notificationclick', event => {
  console.log('[SW-CLICK] Notification clicked:', event.notification.tag);

  event.notification.close();

  // Focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Try to focus an existing window
        for (let client of clientList) {
          if (client.url === '/' || client.url.endsWith('/')) {
            return client.focus();
          }
        }
        // Open new window if no existing one found
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

self.addEventListener('notificationclose', event => {
  console.log('[SW-CLOSE] Notification closed:', event.notification.tag);
});

// Standard service worker lifecycle
self.addEventListener('install', event => {
  console.log('[SW-INSTALL] Service Worker installing');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW-ACTIVATE] Service Worker activating');
  event.waitUntil(clients.claim());
});

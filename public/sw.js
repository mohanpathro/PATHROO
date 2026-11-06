/* PATHROO service worker — web push deadline nudges. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "PATHROO", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "⏰ Deadline approaching";
  const options = {
    body: data.body || "An opportunity you're tracking is closing soon.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag || "PATHROO",
    data: { url: data.url || "/notifications" },
    requireInteraction: false,
    vibrate: [80, 40, 80],
  };
  // Must call showNotification inside waitUntil or the subscription can be dropped.
  event.waitUntil(self.registration.showNotification(title, options));
});

// Only ever navigate to our own origin — a notification payload must never be
// able to send a click to an arbitrary external site (phishing defense).
function safeUrl(raw) {
  try {
    const u = new URL(raw, self.location.origin);
    if (u.origin === self.location.origin) return u.pathname + u.search + u.hash;
  } catch {
    /* fall through */
  }
  return "/notifications";
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl((event.notification.data && event.notification.data.url) || "/notifications");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

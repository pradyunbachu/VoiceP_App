/* Service Worker for Voxal push notifications */

self.addEventListener("push", (event) => {
  let data = { title: "Voxal", body: "You have a new notification" };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    // fallback to default
  }

  const options = {
    body: data.body,
    icon: data.icon || "/voxal-icon-192.png",
    badge: data.badge || "/voxal-icon-192.png",
    tag: data.tag || "voxal-notification",
    data: {
      url: data.url || "/",
    },
    actions: data.actions || [],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if found
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({
            type: "NOTIFICATION_CLICK",
            url,
          });
          return;
        }
      }
      // Open new tab
      return clients.openWindow(url);
    })
  );
});

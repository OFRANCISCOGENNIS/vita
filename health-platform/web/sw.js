/* Vitα service worker — instala o app e o mantém funcional offline.
   Estratégia: stale-while-revalidate (serve do cache na hora, atualiza em 2º plano).
   O cache vita-ml guarda o modelo de visão (TF.js/MobileNet) após o 1º download,
   para o reconhecimento de alimentos funcionar 100% offline. */
const CACHE = "vita-v2";
const CACHE_ML = "vita-ml-v1";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== CACHE_ML).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // modelo de ML (CDN): cache-first — baixa uma vez, roda offline para sempre
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "storage.googleapis.com") {
    e.respondWith(
      caches.open(CACHE_ML).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

// QUANT OPS — Service Worker (PWA instalável / abre offline)
// Estratégia network-first: online sempre pega a versão nova; offline serve o
// último app cacheado. Como o app é um arquivo único, cachear o documento basta.
const CACHE = 'quantops-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    let mesmaOrigem = false;
    try { mesmaOrigem = new URL(req.url).origin === self.location.origin; } catch (err) { }
    if (req.mode !== 'navigate' && !mesmaOrigem) return;   // APIs externas: rede direta
    e.respondWith(
        fetch(req).then(resp => {
            const cp = resp.clone();
            caches.open(CACHE).then(c => c.put(req, cp)).catch(() => { });
            return resp;
        }).catch(() => caches.match(req).then(hit => hit || Response.error()))
    );
});

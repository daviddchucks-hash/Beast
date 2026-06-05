/* Beast AI — Service Worker v4 | Bump BUILD on every deployment */
var BUILD        = '20250604-004';
var CACHE_STATIC = 'beast-static-' + BUILD;
var CACHE_FONTS  = 'beast-fonts-v1';

var PRECACHE_ASSETS = [
  '/Beast/',
  '/Beast/index.html',
  '/Beast/style.css?v='              + BUILD,
  '/Beast/script.js?v='             + BUILD,
  '/Beast/providerManager.js?v='    + BUILD,
  '/Beast/modelManager.js?v='       + BUILD,
  '/Beast/aiServiceManager.js?v='   + BUILD,
  '/Beast/codeGenManager.js?v='     + BUILD,
  '/Beast/manifest.json',
  '/Beast/public/favicon.svg',
];

self.addEventListener('install', function (e) {
  console.log('[SW] Installing build', BUILD);
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(function (c) { return c.addAll(PRECACHE_ASSETS); })
      .then(function () { return self.skipWaiting(); })
      .catch(function (err) { console.warn('[SW] Pre-cache error (non-fatal):', err); return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  console.log('[SW] Activating build', BUILD, '— purging old caches');
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_STATIC && k !== CACHE_FONTS; })
            .map(function (k) { console.log('[SW] Deleted:', k); return caches.delete(k); })
      );
    })
    .then(function () { return self.clients.claim(); })
    .then(function () {
      return self.clients.matchAll({ type: 'window' }).then(function (clients) {
        clients.forEach(function (c) { c.postMessage({ type: 'SW_UPDATED', build: BUILD }); });
      });
    })
  );
});

self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  if (url.indexOf('openrouter.ai') !== -1 ||
      url.indexOf('generativelanguage.googleapis.com') !== -1 ||
      url.indexOf('api.groq.com') !== -1 ||
      url.indexOf('api-inference.huggingface.co') !== -1 ||
      url.indexOf('cdnjs.cloudflare.com') !== -1) return;

  if (url.indexOf('fonts.googleapis.com') !== -1 || url.indexOf('fonts.gstatic.com') !== -1) {
    e.respondWith(cacheFirst(e.request, CACHE_FONTS)); return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(networkFirst(e.request, CACHE_STATIC)); return;
  }
  if (url.indexOf('?v=') !== -1) {
    e.respondWith(cacheFirst(e.request, CACHE_STATIC)); return;
  }
  e.respondWith(staleWhileRevalidate(e.request, CACHE_STATIC));
});

function networkFirst(req, cache) {
  return fetch(req).then(function (r) {
    if (r && r.ok) { var c = r.clone(); caches.open(cache).then(function (cx) { cx.put(req, c); }); }
    return r;
  }).catch(function () {
    return caches.match(req).then(function (c) {
      return c || new Response('Beast AI offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    });
  });
}
function cacheFirst(req, cache) {
  return caches.match(req).then(function (c) {
    if (c) return c;
    return fetch(req).then(function (r) {
      if (r && r.ok) { var cl = r.clone(); caches.open(cache).then(function (cx) { cx.put(req, cl); }); }
      return r;
    });
  });
}
function staleWhileRevalidate(req, cache) {
  return caches.open(cache).then(function (cx) {
    return cx.match(req).then(function (c) {
      var nf = fetch(req).then(function (r) { if (r && r.ok) cx.put(req, r.clone()); return r; }).catch(function () { return c; });
      return c || nf;
    });
  });
}

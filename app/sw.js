const CACHE_NAME = "integrated-price-navi-ver2-0-0-verified-fitment-r24";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/app-v174.css",
  "./css/consultation.css",
  "./js/app-v174.js",
  "./js/master-db-update-v197.js",
  "./js/app-v174-core.js",
  "./js/consultation-model.js",
  "./js/consultation.js",
  "./js/vehicle-fitment-v170.js",
  "./js/vehicle-search-master-v191.js",
  "./js/vehicle-store-v180.js",
  "./js/brand-config.js",
  "./js/workbook.js",
  "./js/pricing.js",
  "./vendor/jszip.min.js",
  "./vendor/sheetjs-bridge.js",
  "./data/wheel_image_master.json",
  "./data/vehicles_2012_2026.json",
  "./data/jp_vehicle_search_master_2000_2026_v1.json",
  "./data/vehicle_service_specs.json",
  "./assets/wheels/BRIDGESTONE_CVW-01_CVW-01_S.webp",
  "./assets/wheels/BRIDGESTONE_GRADUAL_TQ22W_GM.webp",
  "./assets/wheels/BRIDGESTONE_GRADUAL_TQ22W_S.webp",
  "./assets/wheels/BRIDGESTONE_HANNATL9_HANNATL9_FGM.webp",
  "./assets/wheels/R45_S.webp",
  "./assets/wheels/R45_GB.webp",
  "./assets/wheels/TOPY_SIBILLA_V88_S.webp",
  "./assets/wheels/TOPY_BAZALT_X_TYPE2_GM.webp",
  "./assets/wheels/HOTSTUFF_BIASSO_BI02_HG.webp",
  "./assets/wheels/ABE_LASTRADA_TIRADO_CROSS_GB_S.webp",
  "./assets/wheels/ABE_LASTRADA_TIRADO_CROSS_GB.webp",
  "./manifest.json",
  "./icons/favicon-32-v172-tire.png",
  "./icons/icon-192-v172-tire.png",
  "./icons/icon-512-v172-tire.png",
  "./icons/apple-touch-icon-v172-tire.png"
];
const OFFLINE_URL = "./index.html";
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("integrated-price-navi-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Replacement fetches must fail on network errors; never apply an old cached bundle.
  if (url.searchParams.has("__bundle_update")) { event.respondWith(fetch(event.request)); return; }
  if (event.request.mode === "navigate") { event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL))); return; }
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(cached => cached || fetch(event.request).then(response => { if (!response || response.status !== 200) return response; const copy=response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return response; })));
});

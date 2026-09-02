const CACHE_NAME = "integrated-price-navi-ver1-9-5-vehicle-first-ui-r1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/app-v174.css",
  "./css/ui-v193.css",
  "./css/ui-v194.css",
  "./css/ui-v194-qa.css",
  "./js/app-v174.js",
  "./js/app-v174-core.js",
  "./js/ui-v194.js",
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
  "./data/vehicle-updates/online-master.json",
  "./data/vehicle-updates/manifest.json",
  "./manifest.json",
  "./icons/favicon-32-v172-tire.png",
  "./icons/icon-192-v172-tire.png",
  "./icons/icon-512-v172-tire.png",
  "./icons/apple-touch-icon-v172-tire.png"
];
const OFFLINE_URL = "./index.html";
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") { event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL))); return; }
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/data/vehicle-updates/")) {
    event.respondWith(fetch(event.request).then(response => { if (response?.status === 200) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone())); return response; }).catch(() => caches.match(event.request, { ignoreSearch: true })));
    return;
  }
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(cached => cached || fetch(event.request).then(response => { if (!response || response.status !== 200) return response; const copy=response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(OFFLINE_URL))));
});
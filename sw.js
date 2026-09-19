const CACHE="intraday-scanner-v1";
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll([
  "/Intraday-Scanner/",
  "/Intraday-Scanner/index.html",
  "/Intraday-Scanner/manifest.webmanifest",
  "/Intraday-Scanner/icon.svg"
]))));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{
  if(e.request.url.includes("query1.finance.yahoo.com")||e.request.url.includes("corsproxy.io"))return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
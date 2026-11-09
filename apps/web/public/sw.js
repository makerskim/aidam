// 아이담 오프라인 캐시: 같은 출처의 GET 요청만 캐시한다. 외부 요청은 하지 않는다.
const CACHE = 'aidam-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // 서버(결제·AI) 응답과 결제 후 돌아오는 주소는 캐시하지 않는다
  if (url.pathname.startsWith('/api/') || url.search.includes('pay=')) return;
  const isPage = req.mode === 'navigate';
  event.respondWith(
    (isPage
      ? fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }).catch(() => caches.match(req))
      : caches.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(req, copy));
              }
              return res;
            }),
        )),
  );
});

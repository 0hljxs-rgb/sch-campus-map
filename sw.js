// 오프라인 동작용 서비스 워커: 앱 파일을 모두 저장해 두고 인터넷 없이도 열리게 해요.
// 앱 파일을 고치면 VERSION 숫자를 올려야 사용자 기기에 새 버전이 반영돼요.
const VERSION = 'v1';
const CACHE = 'sch-campus-map-' + VERSION;
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'campus-data.js', 'assets/ground.svg', 'privacy.html',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});

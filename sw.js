const CACHE_NAME = 'supervario-v2';

// 1. Installation immédiate du nouveau Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 2. Activation et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Suppression de l'ancien cache :', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Stratégie Réseau d'abord, puis Cache en secours
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la réponse réseau est valide, on met à jour le cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // En cas d'absence de réseau, on utilise le cache
        return caches.match(event.request);
      })
  );
});

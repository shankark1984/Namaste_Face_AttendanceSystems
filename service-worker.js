const CACHE_NAME = 'Namaste_version_V2.00.01';
const urlsToCache = [
    '/',
    '/styles.css',
    '/face_registration.js',
    '/face_registration.html',
    '/attendanceApp.js',
    '/index.html',
    '/deviceauth.js',
    '/manifest.json',
];

// Install the service worker
self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => {
          console.log('Opened cache');
          return cache.addAll(urlsToCache);
        })
    );
  });
  
  // Fetch event
  self.addEventListener('fetch', (event) => {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // Cache hit - return the response from the cached version
          if (response) {
            return response;
          }
          return fetch(event.request);
        })
    );
  });
  
  // Activate event
  self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
  });
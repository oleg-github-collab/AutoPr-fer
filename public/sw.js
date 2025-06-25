// sw.js - Service Worker for PWA

const CACHE_NAME = 'autoprufer-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/app.css',
    '/js/app.js',
    '/manifest.json',
    '/logo-192.png',
    '/logo-512.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/countup.js/2.6.2/countUp.umd.min.js'
];

// Install event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => cacheName !== CACHE_NAME)
                        .map(cacheName => caches.delete(cacheName))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') return;
    
    // Skip API requests
    if (url.pathname.startsWith('/api/')) return;
    
    event.respondWith(
        caches.match(request)
            .then(response => {
                if (response) {
                    return response;
                }
                
                return fetch(request)
                    .then(response => {
                        // Only cache successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        const responseToCache = response.clone();
                        
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(request, responseToCache);
                            });
                        
                        return response;
                    });
            })
            .catch(() => {
                // Offline fallback
                if (request.destination === 'document') {
                    return caches.match('/index.html');
                }
            })
    );
});

// Background sync for offline analysis
self.addEventListener('sync', event => {
    if (event.tag === 'sync-analysis') {
        event.waitUntil(syncAnalysis());
    }
});

async function syncAnalysis() {
    // Get pending analyses from IndexedDB
    // Retry sending them to server
    console.log('Syncing offline analyses...');
}
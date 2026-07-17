/**
 * CBC Portal Service Worker
 * Handles caching of external libraries and critical assets to improve performance 
 * and ensure PDF generation libraries (jsPDF, html2canvas) are always available.
 */

const CACHE_NAME = 'cbc-portal-v1';

// URLs of external libraries to pre-cache
const EXTERNAL_LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    // Add your local critical assets here
    '/',
    '/index.html',
    '/css/style.css',
    '/js/config.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Pre-caching critical assets...');
                return cache.addAll(EXTERNAL_LIBS);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            // Delete old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Cleaning up old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('/offline.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) return response;
                return fetch(event.request).catch(() => {
                    if (event.request.destination === 'document') {
                        return caches.match('/offline.html');
                    }
                    return null;
                });
            })
    );
});
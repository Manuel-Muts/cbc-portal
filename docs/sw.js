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
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (event) => {
    // Perform install steps
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Pre-caching external libraries...');
                return cache.addAll(EXTERNAL_LIBS);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response from cache
                if (response) return response;
                return fetch(event.request);
            })
    );
});
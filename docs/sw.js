/**
 * CBC Portal Service Worker
 * Handles caching of external libraries and critical assets to improve performance 
 * and ensure PDF generation libraries (jsPDF, html2canvas) are always available.
 */

const CACHE_NAME = 'cbc-portal-v1';
const OFFLINE_URL = '/offline.html';

// URLs of external libraries to pre-cache
const EXTERNAL_LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    // Add your local critical assets here
    '/',
    '/index.html',
    '/offline.html',
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

async function getOfflineFallback() {
    const cachedFallback = await caches.match(OFFLINE_URL);
    if (cachedFallback) return cachedFallback;

    return new Response(
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>CompetenceHub Offline</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;} .card{background:white;padding:28px;border-radius:16px;box-shadow:0 12px 30px rgba(15,23,42,.15);max-width:520px;text-align:center;}h1{margin-top:0}</style></head><body><div class="card"><h1>No internet connection</h1><p>CompetenceHub is offline right now. Please check your connection and try again.</p></div></body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith((async () => {
            try {
                const networkResponse = await fetch(request);
                return networkResponse;
            } catch (error) {
                return getOfflineFallback();
            }
        })());
        return;
    }

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return fetch(request).catch(() => null);
        })
    );
});
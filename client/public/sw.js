// Service Worker for Subscription Helper — Push Notifications + Offline Cache
// This file runs in a separate thread and handles push events and caching

const CACHE_NAME = 'sub-helper-v2';
const API_CACHE = 'sub-helper-api-v1';

// Static assets to precache
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/icon-192.png',
];

// API routes to cache for offline use
const CACHEABLE_API_ROUTES = [
    '/api/v1/cockpit',
    '/api/v1/accounts',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch(() => {
                // Silently fail for missing assets during install
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME && name !== API_CACHE)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // API requests — network first, fallback to cache
    if (CACHEABLE_API_ROUTES.some(route => url.pathname.startsWith(route))) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const cloned = response.clone();
                        caches.open(API_CACHE).then((cache) => {
                            cache.put(event.request, cloned);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request).then((cached) => {
                        if (cached) return cached;
                        return new Response(
                            JSON.stringify({ error: { code: 'OFFLINE', message: 'Données hors-ligne non disponibles' } }),
                            { status: 503, headers: { 'Content-Type': 'application/json' } }
                        );
                    });
                })
        );
        return;
    }

    // Static assets — cache first, fallback to network
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    if (response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png'))) {
                        const cloned = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                    }
                    return response;
                });
            })
        );
    }
});

// Push notification handling
self.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: 'Subscription Helper', body: event.data.text() };
    }

    const options = {
        body: payload.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: payload.tag || 'default',
        renotify: true,
        requireInteraction: payload.title?.includes('URGENT') || false,
        data: { url: payload.url || '/' },
        vibrate: [200, 100, 200],
        actions: [
            { action: 'open', title: 'Ouvrir' },
            { action: 'dismiss', title: 'Ignorer' },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Subscription Helper', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    // Open or focus the app
    const url = event.notification.data?.url || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            // Focus existing window
            for (const client of clients) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }
            // Open new window
            return self.clients.openWindow(url);
        })
    );
});

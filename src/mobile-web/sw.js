// Service Worker for Genesys Chat PWA
// File: sw.js

const CACHE_NAME = 'genesys-chat-pwa-v1';
const urlsToCache = [
    './',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Install event - cache resources
self.addEventListener('install', event => {
    console.log('[SW] Install event');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Opened cache');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.log('[SW] Cache failed:', error);
            })
    );
    
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activate event');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    // Claim clients immediately
    self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
            .catch(error => {
                console.log('[SW] Fetch failed:', error);
                // You could return a fallback page here
            })
    );
});

// Push event - handle push notifications (for future use with push server)
self.addEventListener('push', event => {
    console.log('[SW] Push received:', event);
    
    let notificationData = {
        title: 'New Message',
        body: 'You have a new message',
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: 'genesys-message'
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = { ...notificationData, ...data };
        } catch (error) {
            console.log('[SW] Push data parse error:', error);
            notificationData.body = event.data.text() || notificationData.body;
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            tag: notificationData.tag,
            requireInteraction: false,
            data: notificationData.data
        })
    );
});

// Notification click event
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification clicked:', event.notification);
    
    // Close the notification
    event.notification.close();
    
    // Handle the click - focus existing window or open new one
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(clientList => {
            // Check if there's already a window/tab open
            for (let client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    // Send message to the client that notification was clicked
                    client.postMessage({
                        type: 'NOTIFICATION_CLICKED',
                        data: event.notification.data
                    });
                    return client.focus();
                }
            }
            
            // If no window is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

// Notification close event
self.addEventListener('notificationclose', event => {
    console.log('[SW] Notification closed:', event.notification);
    
    // Optional: track notification dismissals
    // You could send analytics data here
});

// Message event - handle messages from main thread
self.addEventListener('message', event => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, icon, data } = event.data;
        
        self.registration.showNotification(title || 'New Message', {
            body: body || 'You have a new message',
            icon: icon || './icon-192.png',
            badge: './icon-192.png',
            tag: 'genesys-message',
            requireInteraction: false,
            data: data || {}
        });
    } else if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Background sync event (for future use)
self.addEventListener('sync', event => {
    console.log('[SW] Background sync:', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(
            // Perform background sync operations
            Promise.resolve()
        );
    }
});

// Periodic background sync (for future use - requires registration)
self.addEventListener('periodicsync', event => {
    console.log('[SW] Periodic sync:', event.tag);
    
    if (event.tag === 'content-sync') {
        event.waitUntil(
            // Perform periodic sync operations
            Promise.resolve()
        );
    }
});

console.log('[SW] Service Worker loaded');
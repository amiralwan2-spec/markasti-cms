importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBSqTXeIMqNuWZ9vdaIqeJ8NmH5VHS0HdQ",
    authDomain: "markasti-cms.firebaseapp.com",
    projectId: "markasti-cms",
    storageBucket: "markasti-cms.firebasestorage.app",
    messagingSenderId: "582868238319",
    appId: "1:582868238319:web:37464a7058fa525626c01a"
});

const messaging = firebase.messaging();

const ICON = 'https://firebasestorage.googleapis.com/v0/b/markasti-cms.firebasestorage.app/o/icons%2Ficon-192.png?alt=media';

messaging.onBackgroundMessage(payload => {
    const d = payload.data || {};
    const title = d.title || 'Markasti CMS';
    const body = d.body || '';
    if (d.type === 'chat') {
        const sender = d.sender || '';
        self.registration.showNotification(title, {
            body,
            icon: ICON,
            data: { type: 'chat', sender },
            tag: 'markasti-chat-' + (sender || Date.now())
        });
        return;
    }
    const orderNumber = d.orderNumber || '';
    self.registration.showNotification(title, {
        body,
        icon: ICON,
        data: { orderNumber },
        tag: 'markasti-' + (orderNumber || Date.now())
    });
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const data = event.notification.data || {};
    if (data.type === 'chat') {
        const sender = data.sender || '';
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
                if (list.length > 0) {
                    const client = list[0];
                    if (sender) client.postMessage({ type: 'CHAT_NAVIGATE', sender });
                    return client.focus();
                }
                return clients.openWindow(sender ? `/?chat=${encodeURIComponent(sender)}` : '/');
            })
        );
        return;
    }
    const orderNumber = data.orderNumber;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            if (list.length > 0) {
                const client = list[0];
                if (orderNumber) client.postMessage({ type: 'FCM_NAVIGATE', orderNumber });
                return client.focus();
            }
            const url = orderNumber ? `/?fcm_order=${encodeURIComponent(orderNumber)}` : '/';
            return clients.openWindow(url);
        })
    );
});

// PWA cache handling
const CACHE = 'markasti-pwa-v3';
const STATIC_ASSETS = [
    '/tailwind.css',
    '/manifest.json',
    '/sw.js',
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap',
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Network-first for HTML (always get fresh app shell)
    if (url.pathname === '/' || url.pathname === '/index.html') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for static assets (CSS, fonts, manifest)
    if (
        url.pathname === '/tailwind.css' ||
        url.pathname === '/manifest.json' ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com'
    ) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }
});

self.addEventListener('message', event => {
    if (event.data?.type === 'UPDATE_MANIFEST') {
        caches.open(CACHE).then(cache => {
            cache.put('/manifest.json', new Response(JSON.stringify(event.data.manifest), {
                headers: { 'Content-Type': 'application/manifest+json' }
            }));
        });
    }
});

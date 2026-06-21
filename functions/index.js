const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { tokensFromUser, shouldNotifyUser } = require('./lib');

initializeApp();

// ── EMAIL: Set via: firebase functions:secrets:set RESEND_API_KEY
// Get a free key at resend.com (100 emails/day free tier)
const RESEND_API_KEY = defineString('RESEND_API_KEY', { default: '' });
const EMAIL_FROM = 'Markasti CMS <noreply@markasti-cms.web.app>';

async function sendEmail(to, subject, html) {
    const key = RESEND_API_KEY.value();
    if (!key || !to) return;
    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: EMAIL_FROM, to, subject, html })
        });
    } catch(e) { console.error('Email send error:', e); }
}

const ICON = 'https://firebasestorage.googleapis.com/v0/b/markasti-cms.firebasestorage.app/o/icons%2Ficon-192.png?alt=media';

// `tokensFromUser` and `shouldNotifyUser` live in ./lib.js (pure + unit-tested).

// Remove dead tokens from both the array and the per-device map across the
// given user docs.
async function removeStaleTokens(db, userDocs, staleTokens) {
    if (!staleTokens.length) return;
    const staleSet = new Set(staleTokens);
    const batch = db.batch();
    let any = false;
    userDocs.forEach(doc => {
        const u = doc.data();
        const update = {};
        if (Array.isArray(u.fcmTokens)) {
            const rm = u.fcmTokens.filter(t => staleSet.has(t));
            if (rm.length) update.fcmTokens = FieldValue.arrayRemove(...rm);
        }
        if (u.fcmTokenMap) {
            Object.keys(u.fcmTokenMap).forEach(k => {
                if (staleSet.has(u.fcmTokenMap[k])) update['fcmTokenMap.' + k] = FieldValue.delete();
            });
        }
        if (Object.keys(update).length) { batch.update(doc.ref, update); any = true; }
    });
    if (any) await batch.commit();
}

// ── CHAT PUSH: fires when an internal chat message is created.
// Delivers a data-only push to the recipient's devices so notifications
// arrive even when the app is closed/backgrounded. In the foreground the
// client swallows it (onMessage no-op) and shows the in-app toast instead.
exports.sendChatPushNotification = onDocumentCreated('messages/{msgId}', async (event) => {
    const m = event.data && event.data.data();
    if (!m || !m.to || !m.from) return;

    const db = getFirestore();
    const recipientDoc = await db.collection('users').doc(m.to).get();
    if (!recipientDoc.exists) return;
    const tokens = [...new Set(tokensFromUser(recipientDoc.data()))];
    if (!tokens.length) return;

    // Resolve a friendly sender name
    let fromName = String(m.from).split('@')[0];
    try {
        const fromDoc = await db.collection('users').doc(m.from).get();
        if (fromDoc.exists && fromDoc.data().name) fromName = fromDoc.data().name;
    } catch (e) { /* fall back to email prefix */ }

    const title = 'New message from ' + fromName;
    let body = String(m.text || '').slice(0, 140);
    if (!body && m.attachment) {
        body = (m.attachment.type || '').indexOf('image/') === 0
            ? '📷 Photo'
            : '📎 ' + (m.attachment.name || 'Attachment');
    }
    // Deep link opens the conversation with the sender when the app is closed.
    const chatLink = 'https://markasti-cms.web.app/?chat=' + encodeURIComponent(m.from);

    const response = await getMessaging().sendEachForMulticast({
        tokens,
        // NOTE: `from` is a RESERVED key in FCM data payloads — including it
        // makes every send fail with messaging/invalid-argument. Use `sender`.
        data: { type: 'chat', title, body, sender: m.from },
        webpush: {
            headers: { Urgency: 'high' },
            fcmOptions: { link: chatLink }
        }
    });

    // Prune stale/invalid tokens
    const stale = tokens.filter((_, i) => {
        const code = response.responses[i] && response.responses[i].error && response.responses[i].error.code;
        return code === 'messaging/registration-token-not-registered' ||
               code === 'messaging/invalid-registration-token';
    });
    await removeStaleTokens(db, [recipientDoc], stale);
});

exports.sendOrderPushNotification = onDocumentCreated('activityLog/{docId}', async (event) => {
    const data = event.data.data();

    if (!['order_created', 'order_modified', 'customer_note'].includes(data.type)) return;

    const db = getFirestore();
    const usersSnap = await db.collection('users').get();

    // Derive the performer's role from the users collection — never trust the
    // client-set `performerRole` for routing decisions (it can be forged).
    const performerDoc = usersSnap.docs.find(d => d.id === data.performedBy);
    const routingData = { ...data, performerRole: performerDoc ? performerDoc.data().role : data.performerRole };

    const tokenList = [];
    usersSnap.forEach(doc => {
        if (shouldNotifyUser(doc.id, doc.data(), routingData)) tokenList.push(...tokensFromUser(doc.data()));
    });

    const tokens = [...new Set(tokenList)]; // dedupe across users/devices
    if (!tokens.length) return;

    const title = data.type === 'order_created' ? 'New Order Submitted'
        : data.type === 'customer_note' ? '📝 New Customer Note'
        : 'Order Updated';
    const orderNumber = String(data.details?.orderNumber || '');
    const clientOrderNum = data.details?.customerOrderNumber ? ` (Client #${data.details.customerOrderNumber})` : '';
    const body = data.summary + clientOrderNum;
    const appLink = `https://markasti-cms.web.app/${orderNumber ? '?fcm_order=' + encodeURIComponent(orderNumber) : ''}`;

    // Data-only message: no top-level notification field, so Firebase won't auto-show
    // a notification. The service worker's onBackgroundMessage is the sole display path.
    // Urgency: high ensures Android Chrome wakes up to deliver the push.
    const response = await getMessaging().sendEachForMulticast({
        tokens,
        data: { orderNumber, type: data.type, title, body },
        webpush: {
            headers: { Urgency: 'high' },
            fcmOptions: { link: appLink }
        }
    });

    // Remove stale/invalid tokens (from both the array and the per-device map)
    const stale = tokens.filter((_, i) => {
        const code = response.responses[i]?.error?.code;
        return code === 'messaging/registration-token-not-registered' ||
               code === 'messaging/invalid-registration-token';
    });
    await removeStaleTokens(db, usersSnap.docs, stale);
});

// ── CUSTOMER NOTE: fires when an order's customerNotes field changes.
// Customers can't reliably write the activity log from the client, so the
// server writes it here — which in turn drives sendOrderPushNotification.
// Admin/Manager edits are skipped (the client already logs those) to avoid
// duplicate notifications.
exports.sendCustomerNoteNotification = onDocumentUpdated('orders/{orderId}', async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    const beforeNote = (before.customerNotes || '').trim();
    const afterNote  = (after.customerNotes  || '').trim();
    if (beforeNote === afterNote) return;   // note didn't change
    if (!afterNote) return;                 // note cleared — don't notify

    const db = getFirestore();
    const editor = after.lastModifiedBy || '';

    // If an Admin/Manager made the edit, the client already logged the note.
    if (editor) {
        try {
            const editorDoc = await db.collection('users').doc(editor).get();
            const role = editorDoc.exists ? editorDoc.data().role : '';
            if (role === 'Admin' || role === 'Manager') {
                console.log('note-trigger: skip — edited by ' + role + ' (' + editor + ')');
                return;
            }
        } catch (e) { /* fall through and notify */ }
    }

    const orderNumber = after.orderNumber || event.params.orderId;
    console.log('note-trigger: customer note on #' + orderNumber + ' by ' + (editor || 'unknown'));
    await db.collection('activityLog').add({
        type: 'customer_note',
        summary: `${after.customer || 'Customer'} sent a note on order #${orderNumber}`,
        performedBy: editor || after.customerEmail || '',
        performerRole: 'Customer',
        details: {
            orderId: event.params.orderId,
            orderNumber: orderNumber,
            customer: after.customer || '',
            note: String(after.customerNotes || '').slice(0, 200)
        },
        timestamp: new Date().toISOString()
    });
    // sendOrderPushNotification fires on this activityLog create → delivers the push.
});

// ── EMAIL NOTIFICATION: fires when an order's status field changes
exports.sendStatusChangeEmail = onDocumentUpdated('orders/{orderId}', async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Only proceed if status actually changed
    if (before.status === after.status) return;

    const db = getFirestore();
    const customerEmail = after.customerEmail || after.loggedByEmail;
    if (!customerEmail) return;

    // Look up customer email from the users collection as a fallback
    const orderNum = after.orderNumber || after.customerOrderNumber || event.params.orderId;
    const subject = `Markasti: Your order #${orderNum} is now ${after.status}`;
    const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e0d8;border-radius:16px;">
            <h2 style="color:#c9952c;margin:0 0 8px">Order Status Update</h2>
            <p style="color:#666;margin:0 0 16px">Hi ${after.customerName || 'Valued Customer'},</p>
            <p style="color:#333">Your order <strong>#${orderNum}</strong> has been updated:</p>
            <div style="margin:16px 0;padding:12px 20px;border-radius:10px;background:#fdf5e0;border:1px solid #e5c87a;">
                <p style="margin:0;font-size:18px;font-weight:800;color:#a97820;">${after.status}</p>
                ${after.deliveryDate ? `<p style="margin:4px 0 0;color:#666;font-size:13px;">Delivery: ${after.deliveryDate}</p>` : ''}
            </div>
            <a href="https://markasti-cms.web.app/?track=${encodeURIComponent(orderNum)}"
               style="display:inline-block;background:#c9952c;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;margin-top:8px;">
                Track Your Order
            </a>
            <p style="color:#aaa;font-size:11px;margin-top:24px;">Markasti Jewelry Order Management System</p>
        </div>`;

    await sendEmail(customerEmail, subject, html);
});

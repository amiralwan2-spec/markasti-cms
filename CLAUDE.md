# CLAUDE.md — Markasti CMS

Project-specific guidance for AI agents working on this repo. Read this before editing.

## What this is
**Markasti** is a jewelry **order-management CMS** built on Firebase. It is a production app
(`https://markasti-cms.web.app`, Firebase project `markasti-cms`) owned by a non-developer who
directs changes through AI agents. Roles: **Admin, Manager, Worker, Customer**.

Features: order CRUD (list / grid / kanban views), stat cards, deadline banner, worker portal
+ QR scan, PDF export, Excel export, WhatsApp links, customer order tracker, internal
Admin/Manager chat (with photo/document attachments + push), customer notes, FCM push
notifications, status-change emails, an immutable activity/audit log, and brand/PWA settings.

## Architecture (important)
- **The entire frontend is ONE file: `public/index.html`** (~9k lines of inline HTML + CSS + vanilla JS, no framework, no JS build step). Functions are global; state is module-level `let`s (notably `appData`). It is organized with `// ── FEATURE: …` banner comments — search those to navigate.
- **Backend: `functions/index.js`** — Firebase Cloud Functions v2 (Node 22). Triggers:
  - `sendChatPushNotification` — on `messages` create → FCM to the recipient.
  - `sendOrderPushNotification` — on `activityLog` create (types order_created/order_modified/customer_note) → FCM to Admins/Managers.
  - `sendCustomerNoteNotification` — on `orders` update; if `customerNotes` changed by a non-staff editor, writes a `customer_note` activityLog entry (which drives the push). Customers can't reliably write the audit log, so the server does it.
  - `sendStatusChangeEmail` — on `orders` update → Resend email to the customer.
- **Security: `firestore.rules` + `storage.rules`** are the real security boundary (the Firebase web `apiKey` in the client is public by design — that is expected, do NOT "fix" it).
- **Service worker: `public/sw.js`** — FCM background messages + PWA caching. Serves `tailwind.css` **cache-first** (hence the version bump below). Holds a second copy of the Firebase config that must stay in sync with `index.html`.
- **Hosting/CSP: `firebase.json`** — security headers incl. a CSP that enumerates allowed sources.

## Styling — COMPILED Tailwind, NOT the CDN
The app links a **compiled** stylesheet `public/tailwind.css?v=N` (built from `tailwind-input.css`
via `npm run build:css`, config in `tailwind.config.js` which scans `public/index.html`).
**Do NOT add the Tailwind CDN `<script>`.** Any new utility class you add to the HTML/JS only
takes effect after a rebuild. Non-default values (e.g. `duration-250`) won't compile — use scale
values (`duration-200/300`). The `?v=` query is a cache-buster (the SW caches the CSS), so it must
be bumped whenever the CSS changes — `npm run deploy` does this automatically.

## Deploying — always use the npm scripts
- `npm run deploy` → `build:css` → `smoke` (gate) → `bump` (auto-increments `tailwind.css?v=`) → `firebase deploy --only hosting`.
- `npm run deploy:all` → same gates, then deploys **everything** (hosting + functions + Firestore/Storage rules). Use this when you changed `firestore.rules`, `storage.rules`, or `functions/`.
- `npm run smoke` runs `scripts/smoke-test.mjs` standalone (parses every inline script, checks balanced `<script>` tags, critical element IDs + key functions exist, the `?v=` buster, and that `sw.js`/`functions/index.js` parse). It **gates deploys** — a broken build can't ship.
- Never run a bare `firebase deploy --only hosting` for a CSS change (you'd skip the version bump and ship stale CSS — a real past bug).
- After deploying, the user must hard-refresh / reopen the app; for SW/token changes each device must reopen once.

## Two version numbers (don't conflate)
- User-visible label `Order Management vNN` in `index.html` (sidebar + sign-in) — cosmetic; bump only for real feature releases.
- `tailwind.css?v=X.Y` cache-buster — internal, auto-bumped every deploy; runs a step ahead of the visible label.

## Firestore data model
- **`orders/{id}`**: `orderNumber` (factory #, staff-set), `customerOrderNumber`, `date`, `description`, `jewelryTypes[]`, `customer`/`customerEmail`, `loggedByEmail`, `employee`, `materials[]`, `startDate`, `deliveryDate`, `department`, `worker`, `status` (Pending/In Progress/Completed/Canceled), `statusDate`, `statusHistory[]`, `notes` (internal), `customerNotes`, `priorityBefore`, `photos[]` (Storage URLs), `submittedByCustomer`, `lastModifiedBy/Date`, `archived`.
- **`users/{email}`** (doc id = email): `role` (Admin/Manager/Worker/Customer), `name`, `fcmTokenMap` (per-device, current) + legacy `fcmTokens[]`, `currentOrderId`, `createdAt`. Self-registration is **Customer-only**; Admins promote others.
- **`messages/{id}`**: internal chat — `from`, `to`, `participants:[from,to]`, `pair` (`[a,b].sort().join('|')`), `text`, `read`, `ts`, optional `attachment:{url,name,type,size}`.
- **`activityLog/{id}`**: immutable audit — `type`, `summary` (≤1000), `performedBy`, `performerRole`, `timestamp`, `details`. Admin-readable only.
- **`settings/{doc}`**: brand/PWA config (logo, etc.).

## Gotchas (these have bitten before — don't reintroduce)
- **FCM `data` payloads can't use reserved keys** — `from` makes every send fail with `messaging/invalid-argument`; use `sender`. Both push functions send **data-only** messages (no top-level `notification`) so the SW's `onBackgroundMessage` is the sole display path.
- **One token per device** via `fcmTokenMap[deviceId]`; functions prefer it over the legacy `fcmTokens` array (`tokensFromUser`) and dedupe to avoid duplicate notifications.
- **Duplicate element IDs**: each order renders in list + mobile + grid variants simultaneously, so `id="…_${order.id}"` exists 2–3× at once. `getElementById` returns the first (often hidden) one — read inputs relative to the clicked element instead (see `saveCustomerRequest`).
- **`goToOrder` filters by the order number** (sets the search box) rather than computing a page, because the dashboard sort pins noted/unreviewed orders.
- **Storage rules can't do per-conversation/per-order role checks** on `*.firebasestorage.app` buckets — those restrictions are enforced in app code, not `storage.rules`.
- **Activity-log search & per-order History** are Admin-only (the audit log is Admin-readable).

## Conventions
- Always `escapeHtml(...)` user-supplied content before putting it in `innerHTML`/template strings.
- Reuse `showToastMessage(msg, type)` for in-app toasts.
- Keep the Firebase config in `index.html` and `sw.js` in sync.

## Repo hygiene
`public/index.html.bak*`, `tmp_extracted.js`, `live_site.html`, `diff.txt` are stale artifacts
(gitignored) — do not edit them by mistake; the live source is `public/index.html`.

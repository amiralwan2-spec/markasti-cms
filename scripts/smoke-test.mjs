// Lightweight, dependency-free smoke test for the Markasti single-file app.
// Catches the failure modes that have actually bitten us:
//   1. A syntax error in an inline <script> (breaks the ENTIRE app at once).
//   2. A missing critical DOM element (feature silently absent).
//   3. A forgotten ?v= cache-buster on the compiled stylesheet.
//   4. Broken service worker / Cloud Functions syntax.
// Run with `npm run smoke`. Exits non-zero on any failure so it can gate deploys.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let failures = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); failures++; };
const pass = (msg) => console.log('  ✓ ' + msg);

// ── 1. Inline scripts parse cleanly ───────────────────────────────────────
const html = readFileSync('public/index.html', 'utf8');
const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match, inlineCount = 0;
while ((match = scriptRe.exec(html))) {
  if (/\bsrc\s*=/.test(match[1] || '')) continue; // external script, skip
  const code = match[2];
  if (!code.trim()) continue;
  inlineCount++;
  try { new vm.Script(code, { filename: `index.html#inline-${inlineCount}` }); }
  catch (e) { fail(`inline script #${inlineCount} syntax error: ${e.message}`); }
}
if (!failures) pass(`${inlineCount} inline script(s) parse cleanly`);

// ── 2. <script> tags balanced ─────────────────────────────────────────────
const opens = (html.match(/<script\b/gi) || []).length;
const closes = (html.match(/<\/script>/gi) || []).length;
if (opens !== closes) fail(`<script> tags unbalanced: ${opens} open vs ${closes} close`);
else pass(`<script> tags balanced (${opens})`);

// ── 3. Critical elements present ──────────────────────────────────────────
const requiredIds = [
  'mainApp', 'authOverlay', 'activityToastContainer',
  'chatWidget', 'chatPanel', 'chatListView', 'chatThreadView', 'chatMessages', 'chatInput',
  'fab',
];
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) fail(`missing required element id="${id}"`);
}
if (requiredIds.every((id) => html.includes(`id="${id}"`))) pass(`all ${requiredIds.length} critical elements present`);

// ── 3b. Duplicate STATIC element ids ──────────────────────────────────────
// A real bug: two static id="foo" on the page (getElementById returns the first).
// Templated ids like id="row_${order.id}" are emitted into multiple row variants
// on purpose, so ids containing ${ are excluded from this check.
{
  const idCounts = {};
  const idRe = /\bid="([^"]+)"/g;
  let im;
  while ((im = idRe.exec(html))) {
    const id = im[1];
    if (id.includes('${')) continue; // dynamic/templated id — skip
    idCounts[id] = (idCounts[id] || 0) + 1;
  }
  const dupes = Object.entries(idCounts).filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
  if (dupes.length) fail(`duplicate static element id(s): ${dupes.join(', ')}`);
  else pass('no duplicate static element ids');
}

// ── 4. Critical handlers are defined somewhere in the markup ──────────────
const requiredFns = ['initChat', 'toggleChat', 'openConversation', 'sendChatMessage', 'showToastMessage'];
for (const fn of requiredFns) {
  if (!new RegExp(`function\\s+${fn}\\b`).test(html)) fail(`missing function definition: ${fn}()`);
}
if (requiredFns.every((fn) => new RegExp(`function\\s+${fn}\\b`).test(html))) pass(`all ${requiredFns.length} key functions defined`);

// ── 5. Stylesheet cache-buster present ────────────────────────────────────
if (!/tailwind\.css\?v=\d+\.\d+/.test(html)) fail('tailwind.css link is missing a ?v=X.Y cache-buster');
else pass('stylesheet has a ?v= cache-buster');

// ── 6. Service worker + Cloud Functions parse ─────────────────────────────
for (const file of ['public/sw.js', 'functions/index.js']) {
  try { new vm.Script(readFileSync(file, 'utf8'), { filename: file }); pass(`${file} parses cleanly`); }
  catch (e) { fail(`${file} syntax error: ${e.message}`); }
}

// ── Result ────────────────────────────────────────────────────────────────
console.log('');
if (failures) { console.error(`SMOKE TEST FAILED — ${failures} problem(s).`); process.exit(1); }
console.log('SMOKE TEST PASSED.');

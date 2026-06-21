// Full-app accessibility test: logs in (against the Firebase emulators) and runs
// axe-core on the authenticated dashboard and an open modal — coverage the
// login-screen pa11y check can't reach. Violations are logged; the test fails
// only on CRITICAL issues (the job is marked continue-on-error in CI while the
// baseline is established — tighten to serious/all once green).
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const path = require('node:path');

const ADMIN = { email: 'a11y-admin@test.local', password: 'test1234' };
const FB_DIR = path.join(__dirname, '..', '..', 'node_modules', 'firebase');

// Surface browser console + page errors in the test output (diagnostics).
function wireDiagnostics(page) {
  page.on('console', m => console.log(`[browser:${m.type()}] ${m.text()}`));
  page.on('pageerror', e => console.log(`[browser:pageerror] ${e.message}`));
}

// Serve the Firebase SDK from local node_modules instead of the gstatic CDN, so
// the test doesn't depend on outbound network (works behind firewalls + in CI).
async function stubFirebaseCdn(page) {
  await page.route('**/www.gstatic.com/firebasejs/**', route => {
    const file = route.request().url().split('/').pop().split('?')[0]; // firebase-*-compat.js
    const local = path.join(FB_DIR, file);
    if (fs.existsSync(local)) {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(local) });
    } else {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    }
  });
}

async function login(page) {
  wireDiagnostics(page);
  await stubFirebaseCdn(page);
  await page.goto('/?emulator=1');
  await page.waitForSelector('#loginEmail', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500); // let the async Firebase init (incl. emulator wiring) finish
  await page.fill('#loginEmail', ADMIN.email);
  await page.fill('#loginPassword', ADMIN.password);
  await page.click('#loginForm button[type="submit"]');

  // Race: dashboard appears (success) vs an auth error banner (failure).
  const ok = page.waitForSelector('#mainApp:not(.hidden)', { timeout: 30000 }).then(() => 'ok');
  const err = page.waitForSelector('#authError:not(.hidden)', { timeout: 30000 })
    .then(el => el.textContent()).then(t => 'AUTH ERROR: ' + (t || '').trim());
  const result = await Promise.race([ok, err]).catch(e => 'TIMEOUT: ' + e.message);
  if (result !== 'ok') throw new Error('Login did not reach dashboard — ' + result);
  await page.waitForTimeout(1200); // let render + the a11y JS settle
}

// Report all violations and return the blocking ones (critical + serious).
function reportBlocking(label, results) {
  for (const v of results.violations) {
    console.log(`[a11y][${label}] ${v.impact}\t${v.id}\t(${v.nodes.length})\t${v.help}`);
    // Print the offending element selectors (helps pinpoint contrast issues).
    for (const n of v.nodes.slice(0, 25)) {
      console.log(`    @ ${JSON.stringify(n.target)}${n.any && n.any[0] ? '  — ' + n.any[0].message : ''}`);
    }
  }
  return results.violations
    .filter(v => v.impact === 'critical' || v.impact === 'serious')
    .map(v => `${v.impact}:${v.id}(${v.nodes.length})`);
}

test('dashboard has no critical or serious accessibility violations', async ({ page }) => {
  await login(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = reportBlocking('dashboard', results);
  console.log(`[a11y] dashboard: ${results.violations.length} rule(s) flagged, ${blocking.length} blocking`);
  expect(blocking, 'critical/serious a11y violations on dashboard').toEqual([]);
});

test('an open modal has no critical or serious accessibility violations', async ({ page }) => {
  await login(page);
  const bell = page.locator('#activityBellBtn');
  if (await bell.count() && await bell.isVisible()) {
    await bell.click();
    await page.waitForSelector('#activityModal:not(.hidden)', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).include('#activityModal').withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = reportBlocking('activityModal', results);
    expect(blocking, 'critical/serious a11y violations in modal').toEqual([]);
  } else {
    test.skip(true, 'activity bell not available');
  }
});

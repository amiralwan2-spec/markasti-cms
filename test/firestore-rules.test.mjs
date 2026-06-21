// Firestore security-rules tests — validates the audit security fixes.
//
// REQUIRES the Firebase Emulator (needs Java/JRE installed). Run with:
//   npm run test:rules
// which wraps this in `firebase emulators:exec --only firestore`.
// It is intentionally NOT part of `npm run deploy` (deploys shouldn't depend
// on a running emulator). Use it locally or in CI after installing Java.

import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'markasti-cms-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => { if (testEnv) await testEnv.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed roles with rules disabled (admin context).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'admin@x.com'), { role: 'Admin', name: 'A' });
    await setDoc(doc(db, 'users', 'cust@x.com'), { role: 'Customer', name: 'C' });
    await setDoc(doc(db, 'users', 'other@x.com'), { role: 'Customer', name: 'O' });
  });
});

const ctxFor = (email) => testEnv.authenticatedContext(email, { email }).firestore();

// ── Critical #1: no self-registration as Admin ────────────────────────────
test('a new user cannot self-register as Admin', async () => {
  const db = ctxFor('newguy@x.com');
  await assertFails(setDoc(doc(db, 'users', 'newguy@x.com'), { role: 'Admin', name: 'X' }));
});

test('a new user can self-register as Customer', async () => {
  const db = ctxFor('newguy@x.com');
  await assertSucceeds(setDoc(doc(db, 'users', 'newguy@x.com'), { role: 'Customer', name: 'X' }));
});

// ── Critical #2: customers can't create orders with production fields ──────
const customerOrder = (over = {}) => ({
  loggedByEmail: 'cust@x.com', submittedByCustomer: true,
  worker: '', department: '', status: 'Pending', customer: 'C', customerEmail: 'cust@x.com',
  ...over,
});

test('customer can submit their own order (no production assignment)', async () => {
  const db = ctxFor('cust@x.com');
  await assertSucceeds(setDoc(doc(db, 'orders', 'o1'), customerOrder()));
});

test('customer cannot create an order with a worker assigned', async () => {
  const db = ctxFor('cust@x.com');
  await assertFails(setDoc(doc(db, 'orders', 'o2'), customerOrder({ worker: 'Bob' })));
});

test('customer cannot create an order not flagged submittedByCustomer', async () => {
  const db = ctxFor('cust@x.com');
  await assertFails(setDoc(doc(db, 'orders', 'o3'), customerOrder({ submittedByCustomer: false })));
});

// ── Customer order update scope ───────────────────────────────────────────
test('customer can edit only customerNotes on their own order; not status', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'orders', 'o4'),
      { customerEmail: 'cust@x.com', loggedByEmail: 'cust@x.com', status: 'Pending', customerNotes: '' });
  });
  const db = ctxFor('cust@x.com');
  await assertSucceeds(updateDoc(doc(db, 'orders', 'o4'), { customerNotes: 'please rush' }));
  await assertFails(updateDoc(doc(db, 'orders', 'o4'), { status: 'Completed' }));
});

// ── Message privacy ───────────────────────────────────────────────────────
test('only conversation participants can read a message', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', 'mgr@x.com'), { role: 'Manager', name: 'M' });
    await setDoc(doc(ctx.firestore(), 'users', 'mgr2@x.com'), { role: 'Manager', name: 'M2' });
    await setDoc(doc(ctx.firestore(), 'messages', 'm1'), {
      from: 'admin@x.com', to: 'mgr@x.com', participants: ['admin@x.com', 'mgr@x.com'],
      text: 'hi', read: false,
    });
  });
  await assertSucceeds(getDoc(doc(ctxFor('mgr@x.com'), 'messages', 'm1')));   // participant
  await assertFails(getDoc(doc(ctxFor('mgr2@x.com'), 'messages', 'm1')));     // non-participant
});

// ── activityLog type allow-list ───────────────────────────────────────────
test('activityLog rejects an unknown type', async () => {
  const db = ctxFor('admin@x.com');
  const base = { summary: 's', performedBy: 'admin@x.com', timestamp: 't', details: {} };
  await assertSucceeds(setDoc(doc(db, 'activityLog', 'a1'), { ...base, type: 'order_created' }));
  await assertFails(setDoc(doc(db, 'activityLog', 'a2'), { ...base, type: 'hacked' }));
});

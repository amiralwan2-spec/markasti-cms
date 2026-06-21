// Unit tests for the notification logic. Run with: npm test  (uses node:test, no deps)
const { test } = require('node:test');
const assert = require('node:assert');
const { tokensFromUser, shouldNotifyUser } = require('../lib');

test('tokensFromUser: prefers per-device map, ignores legacy array when map present', () => {
  const u = { fcmTokenMap: { devA: 't1', devB: 't2' }, fcmTokens: ['old1', 'old2'] };
  assert.deepStrictEqual(tokensFromUser(u).sort(), ['t1', 't2']);
});

test('tokensFromUser: falls back to legacy array when no map', () => {
  assert.deepStrictEqual(tokensFromUser({ fcmTokens: ['a', 'b'] }), ['a', 'b']);
});

test('tokensFromUser: empty/odd inputs return []', () => {
  assert.deepStrictEqual(tokensFromUser(null), []);
  assert.deepStrictEqual(tokensFromUser({}), []);
  assert.deepStrictEqual(tokensFromUser({ fcmTokenMap: {} }), []);
});

test('tokensFromUser: filters falsy map values', () => {
  assert.deepStrictEqual(tokensFromUser({ fcmTokenMap: { a: 't1', b: '' , c: null } }), ['t1']);
});

const admin = { role: 'Admin' };
const manager = { role: 'Manager' };
const worker = { role: 'Worker' };

test('shouldNotifyUser: never notifies the performer', () => {
  const data = { type: 'order_modified', performedBy: 'me@x.com' };
  assert.strictEqual(shouldNotifyUser('me@x.com', admin, data), false);
});

test('shouldNotifyUser: notifies other Admins/Managers on order_modified', () => {
  const data = { type: 'order_modified', performedBy: 'someone@x.com' };
  assert.strictEqual(shouldNotifyUser('admin@x.com', admin, data), true);
  assert.strictEqual(shouldNotifyUser('mgr@x.com', manager, data), true);
});

test('shouldNotifyUser: never notifies Workers or Customers', () => {
  const data = { type: 'order_modified', performedBy: 'someone@x.com' };
  assert.strictEqual(shouldNotifyUser('w@x.com', worker, data), false);
  assert.strictEqual(shouldNotifyUser('c@x.com', { role: 'Customer' }, data), false);
});

test('shouldNotifyUser: Managers NOT notified of staff-created new orders', () => {
  const data = { type: 'order_created', performedBy: 'staff@x.com', performerRole: 'Admin' };
  assert.strictEqual(shouldNotifyUser('mgr@x.com', manager, data), false);
  assert.strictEqual(shouldNotifyUser('admin@x.com', admin, data), true); // Admins still notified
});

test('shouldNotifyUser: Managers ARE notified of customer-submitted new orders', () => {
  const data = { type: 'order_created', performedBy: 'cust@x.com', performerRole: 'Customer' };
  assert.strictEqual(shouldNotifyUser('mgr@x.com', manager, data), true);
});

test('shouldNotifyUser: customer_note notifies all Admins/Managers (except performer)', () => {
  const data = { type: 'customer_note', performedBy: 'cust@x.com' };
  assert.strictEqual(shouldNotifyUser('mgr@x.com', manager, data), true);
  assert.strictEqual(shouldNotifyUser('admin@x.com', admin, data), true);
});

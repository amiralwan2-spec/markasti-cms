// Pure, side-effect-free helpers extracted from index.js so they can be unit
// tested (see test/lib.test.js) without the Firebase admin SDK. These encode
// the notification logic that has historically been bug-prone.

// Devices register one token per device under `fcmTokenMap` (keyed by a stable
// device id) so a single device can't accumulate multiple tokens and cause
// duplicate notifications. Falls back to the legacy `fcmTokens` array for any
// user/device that hasn't re-registered under the new scheme yet.
function tokensFromUser(u) {
  if (u && u.fcmTokenMap && Object.keys(u.fcmTokenMap).length) {
    return Object.values(u.fcmTokenMap).filter(Boolean);
  }
  if (u && Array.isArray(u.fcmTokens)) return u.fcmTokens;
  return [];
}

// Should this user receive a push for this activityLog entry?
//  - never notify the person who performed the action
//  - only Admins/Managers are notified
//  - Managers get NEW-order notifications only when the order was submitted by a Customer
function shouldNotifyUser(userEmail, user, data) {
  if (!user) return false;
  if (userEmail === data.performedBy) return false;
  if (!['Admin', 'Manager'].includes(user.role)) return false;
  const submittedByCustomer = data.type === 'order_created' && data.performerRole === 'Customer';
  if (data.type === 'order_created' && user.role === 'Manager' && !submittedByCustomer) return false;
  return true;
}

module.exports = { tokensFromUser, shouldNotifyUser };

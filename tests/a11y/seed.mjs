// Seeds the Firebase Auth + Firestore emulators with an Admin user (and a couple
// of orders) so the Playwright a11y test can log in and render the dashboard.
// firebase-admin auto-connects to the emulators via the FIREBASE_AUTH_EMULATOR_HOST
// / FIRESTORE_EMULATOR_HOST env vars that `firebase emulators:exec` sets.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const EMAIL = 'a11y-admin@test.local';
const PASSWORD = 'test1234';

const app = initializeApp({ projectId: 'markasti-cms' });
const auth = getAuth(app);
const db = getFirestore(app);

await auth.createUser({ email: EMAIL, password: PASSWORD, emailVerified: true })
  .catch(e => { if (e.code !== 'auth/email-already-exists') throw e; });

await db.collection('users').doc(EMAIL).set({
  role: 'Admin', name: 'A11y Admin', createdAt: new Date().toISOString(),
});

const today = new Date().toISOString().split('T')[0];
for (let i = 1; i <= 2; i++) {
  await db.collection('orders').doc('a11y-seed-' + i).set({
    orderNumber: 'A' + i, customerOrderNumber: i, date: today, description: 'Seed order ' + i,
    jewelryTypes: [], customer: 'Seed Customer', customerEmail: 'cust@test.local', loggedByEmail: EMAIL,
    employee: 'Rep', materials: [], startDate: today, deliveryDate: today,
    department: '', worker: '', status: 'Pending', statusDate: today,
    notes: '', customerNotes: '', photos: [], submittedByCustomer: false,
    lastModifiedBy: EMAIL, lastModifiedDate: new Date().toISOString(),
    statusHistory: [{ status: 'Pending', changedBy: EMAIL, date: new Date().toISOString() }],
  });
}

console.log('a11y seed: created admin + 2 orders');
process.exit(0);

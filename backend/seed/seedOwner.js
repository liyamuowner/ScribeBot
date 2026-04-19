/**
 * Seed Script — Creates the owner/admin account in Firebase Auth + Firestore.
 * Run: node src/seed/seedOwner.js
 */
import 'dotenv/config';
import '../src/config/firebase.js'; // Initialize Firebase Admin
import { adminAuth } from '../src/config/firebase.js';
import { col, FieldValue } from '../src/config/firestore.js';

const OWNER_EMAIL = process.env.ADMIN_SEED_EMAIL || 'liyamu.owner@gmail.com';
const OWNER_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'Liyamu@0721...';
const OWNER_NAME = 'LIYAMU Owner';

const seed = async () => {
  console.log('🌱 Seeding owner account...');

  const fa = adminAuth();
  if (!fa) {
    console.error('❌ Firebase Admin not initialized. Check FIREBASE_SERVICE_ACCOUNT_JSON in .env');
    process.exit(1);
  }

  let uid;

  // 1. Create or get Firebase Auth user
  try {
    const existing = await fa.getUserByEmail(OWNER_EMAIL);
    uid = existing.uid;
    console.log(`✅ Firebase Auth user already exists: ${uid}`);
    
    // Update password to match seed config
    await fa.updateUser(uid, { password: OWNER_PASSWORD });
    console.log(`✅ Firebase Auth password updated for owner.`);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      const newUser = await fa.createUser({
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        displayName: OWNER_NAME,
        emailVerified: true,
      });
      uid = newUser.uid;
      console.log(`✅ Created Firebase Auth user: ${uid}`);
    } else {
      throw err;
    }
  }

  // 2. Create or update Firestore user doc
  const snap = await col.users().doc(uid).get();

  if (snap.exists) {
    // Update to ensure owner flags are set
    await col.users().doc(uid).update({
      role: 'admin',
      'badges.owner': true,
      'badges.pro': true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Firestore user doc updated for owner.`);
  } else {
    await col.users().doc(uid).set({
      uid,
      name: OWNER_NAME,
      email: OWNER_EMAIL,
      role: 'admin',
      socialProvider: 'local',
      badges: {
        author: false,
        verifiedAuthor: false,
        proWriter: false,
        pro: true,
        owner: true,
        proReader: false,
      },
      isPro: true,
      proExpiryDate: null,
      proType: 'none',
      isBanned: false,
      isDeleted: false,
      profilePicture: '',
      phone: '',
      bio: 'Platform Owner',
      wishlist: [],
      bookmarkedWorks: [],
      purchasedBooks: [],
      readingHistory: [],
      lastReadBook: null,
      following: [],
      followersCount: 0,
      settings: { theme: 'dark' },
      creditBalance: 99999,
      earningsBalance: 0,
      socialLinks: { facebook: '', whatsapp: '', telegram: '' },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Created Firestore user doc for owner.`);
  }

  console.log('');
  console.log('🎉 Owner account seeded successfully!');
  console.log(`   Email:    ${OWNER_EMAIL}`);
  console.log(`   Password: ${OWNER_PASSWORD}`);
  console.log(`   UID:      ${uid}`);
  console.log(`   Role:     admin + owner badge`);
  process.exit(0);
};

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});

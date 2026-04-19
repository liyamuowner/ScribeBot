import { adminAuth } from '../config/firebase.js';
import { col, createDoc, FieldValue } from '../config/firestore.js';
import { notifyAdmins } from '../utils/notificationHelper.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Register — frontend has already created the Firebase Auth user.
 * Backend receives the Firebase ID token, verifies it, creates the Firestore user doc.
 */
export const register = async (req, res) => {
  const { name, role, idToken } = req.body;
  if (!name || !idToken) throw new ApiError(400, 'Name and ID token are required');

  const firebaseAuth = adminAuth();
  if (!firebaseAuth) throw new ApiError(503, 'Auth service unavailable');

  // Verify the Firebase ID token
  const decoded = await firebaseAuth.verifyIdToken(idToken);
  const { uid, email } = decoded;

  // Check if user doc already exists (prevent duplicates)
  const existingSnap = await col.users().doc(uid).get();
  if (existingSnap.exists) {
    const existing = { id: uid, ...existingSnap.data() };
    return res.status(200).json(existing);
  }

  const assignedRole = role === 'author' ? 'author' : 'beginner_reader';

  const userData = {
    uid,
    name,
    email,
    role: assignedRole,
    socialProvider: 'local',
    badges: {
      author: role === 'author',
      verifiedAuthor: false,
      proWriter: false,
      pro: false,
      owner: false,
      proReader: false,
    },
    isPro: false,
    proExpiryDate: null,
    proType: 'none',
    isBanned: false,
    isDeleted: false,
    profilePicture: '',
    phone: '',
    bio: '',
    wishlist: [],
    bookmarkedWorks: [],
    purchasedBooks: [],
    readingHistory: [],
    lastReadBook: null,
    following: [],
    followersCount: 0,
    settings: { theme: 'light' },
    creditBalance: 0,
    earningsBalance: 0,
    socialLinks: { facebook: '', whatsapp: '', telegram: '' },
  };

  // Write to Firestore (use UID as doc ID)
  await col.users().doc(uid).set({
    ...userData,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Notify Admins
  await notifyAdmins({
    title: 'New Member Joined',
    message: `${name} has joined LIYAMU.`,
    type: 'info',
    metadata: { action_type: 'user_join', name, email, provider: 'Firebase Auth' },
  });

  res.status(201).json({ id: uid, _id: uid, ...userData });
};

/**
 * Login — frontend signs in with Firebase Auth, sends ID token.
 * Backend verifies token and returns user data from Firestore.
 */
export const login = async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) throw new ApiError(400, 'Firebase ID token is required');

  const firebaseAuth = adminAuth();
  if (!firebaseAuth) throw new ApiError(503, 'Auth service unavailable');

  const decoded = await firebaseAuth.verifyIdToken(idToken);
  const snap = await col.users().doc(decoded.uid).get();

  if (!snap.exists) throw new ApiError(404, 'User not registered on this platform');

  const user = { id: snap.id, _id: snap.id, ...snap.data() };
  if (user.isBanned) throw new ApiError(403, 'This account is banned');
  if (user.isDeleted) throw new ApiError(403, 'This account has been deleted');

  res.json(user);
};

/**
 * Social Login — Google/Facebook via Firebase popup.
 * Creates Firestore user doc if it doesn't exist yet.
 */
export const socialLogin = async (req, res) => {
  const { name, role, idToken, provider } = req.body;
  if (!idToken) throw new ApiError(400, 'Firebase ID token is required');

  const firebaseAuth = adminAuth();
  if (!firebaseAuth) throw new ApiError(503, 'Auth service unavailable');

  const decoded = await firebaseAuth.verifyIdToken(idToken);
  const { uid, email } = decoded;

  const snap = await col.users().doc(uid).get();

  if (snap.exists) {
    const user = { id: uid, _id: uid, ...snap.data() };
    if (user.isBanned) throw new ApiError(403, 'This account is banned');
    return res.json(user);
  }

  // New social user — create Firestore doc
  const assignedRole = role === 'author' ? 'author' : 'beginner_reader';
  const userData = {
    uid,
    name: name || decoded.name || email.split('@')[0],
    email,
    role: assignedRole,
    socialProvider: provider || 'google',
    badges: { author: false, verifiedAuthor: false, proWriter: false, pro: false, owner: false, proReader: false },
    isPro: false, proExpiryDate: null, proType: 'none',
    isBanned: false, isDeleted: false,
    profilePicture: decoded.picture || '',
    phone: '', bio: '',
    wishlist: [], bookmarkedWorks: [], purchasedBooks: [], readingHistory: [],
    lastReadBook: null, following: [], followersCount: 0,
    settings: { theme: 'light' },
    creditBalance: 0, earningsBalance: 0,
    socialLinks: { facebook: '', whatsapp: '', telegram: '' },
  };

  await col.users().doc(uid).set({
    ...userData,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.status(201).json({ id: uid, _id: uid, ...userData });
};

/**
 * Check if email exists — used for password reset flow.
 */
export const checkEmail = async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, 'Email is required');

  const snap = await col.users().where('email', '==', email.toLowerCase()).limit(1).get();
  
  res.json({ exists: !snap.empty });
};

/**
 * Get current user from Firestore (used by /auth/me).
 */
export const me = async (req, res) => {
  res.json(req.user);
};

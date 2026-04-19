import { adminAuth } from '../config/firebase.js';
import { col, snapToArray } from '../config/firestore.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Verify Firebase ID token and load user from Firestore.
 * Expects: Authorization: Bearer <firebaseIdToken>
 */
export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) throw new ApiError(401, 'Not authorized');

  const token = authHeader.split(' ')[1];

  // Verify Firebase ID token
  const firebaseAuth = adminAuth();
  if (!firebaseAuth) throw new ApiError(503, 'Auth service unavailable');

  const decoded = await firebaseAuth.verifyIdToken(token);

  // Load user from Firestore by Firebase UID
  const snap = await col.users().doc(decoded.uid).get();
  if (!snap.exists) throw new ApiError(401, 'User not found in platform');

  const user = { id: snap.id, _id: snap.id, ...snap.data() };
  if (user.isBanned) throw new ApiError(403, 'This account is banned');
  if (user.isDeleted) throw new ApiError(403, 'This account has been deleted');

  req.user = user;
  next();
};

/**
 * Role-based access guard.
 * Usage: authorize('admin', 'verified_author')
 */
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new ApiError(403, 'Access denied');
  next();
};

/**
 * Firestore helper — thin wrapper over firebase-admin Firestore.
 * Provides collection shortcuts and common utilities.
 */
import { adminFirestore } from './firebase.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export { FieldValue, Timestamp };

/** Get the Firestore db instance */
export const getDb = () => adminFirestore();

/** Collection shortcuts */
export const col = {
  users: () => getDb().collection('users'),
  books: () => getDb().collection('books'),
  reviews: () => getDb().collection('reviews'),
  notifications: () => getDb().collection('notifications'),
  purchases: () => getDb().collection('purchases'),
  creditTransactions: () => getDb().collection('creditTransactions'),
  creditRequests: () => getDb().collection('creditRequests'),
  creativeWorks: () => getDb().collection('creativeWorks'),
  verificationRequests: () => getDb().collection('verificationRequests'),
  withdrawals: () => getDb().collection('withdrawals'),
  chatMessages: () => getDb().collection('chatMessages'),
  contactMessages: () => getDb().collection('contactMessages'),
};

/**
 * Get a document by ID and return its data with id field.
 * Returns null if not found.
 */
export const getDocById = async (collection, id) => {
  const snap = await col[collection]().doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
};

/**
 * Convert a Firestore QuerySnapshot to an array of plain objects.
 */
export const snapToArray = (snap) =>
  snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

/**
 * Create a document with auto-generated ID.
 * Automatically adds createdAt and updatedAt timestamps.
 */
export const createDoc = async (collectionName, data) => {
  const ref = col[collectionName]().doc();
  const now = FieldValue.serverTimestamp();
  const docData = { ...data, createdAt: now, updatedAt: now };
  await ref.set(docData);
  // Return with the generated ID (timestamps will resolve server-side)
  return { id: ref.id, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
};

/**
 * Update a document by ID, automatically setting updatedAt.
 */
export const updateDoc = async (collectionName, id, data) => {
  const ref = col[collectionName]().doc(id);
  await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
};

/**
 * Delete a document by ID.
 */
export const deleteDoc = async (collectionName, id) => {
  await col[collectionName]().doc(id).delete();
};

/**
 * Run a Firestore transaction.
 */
export const runTransaction = (fn) => getDb().runTransaction(fn);

/**
 * Create a Firestore batch write.
 */
export const getBatch = () => getDb().batch();

import { col, createDoc, snapToArray, FieldValue } from '../config/firestore.js';
import { sendAdminAlert, formatTelegramMessage } from './telegram.js';

/**
 * Notifies all administrators and sends a Telegram alert.
 */
export const notifyAdmins = async ({ title, message, type = 'info', metadata = {} }) => {
  // Send Telegram alert first (non-blocking)
  const telegramMessage = formatTelegramMessage({ title, message, metadata });
  sendAdminAlert(telegramMessage).catch(err => console.error('Telegram alert failed:', err));

  // Get all admin UIDs from Firestore
  const adminsSnap = await col.users().where('role', '==', 'admin').get();
  if (adminsSnap.empty) return;

  const batch = col.users().firestore.batch();
  adminsSnap.docs.forEach(adminDoc => {
    const notifRef = col.notifications().doc();
    batch.set(notifRef, {
      userId: adminDoc.id,
      title,
      message,
      type,
      isRead: false,
      metadata: { ...metadata, telegramSent: true },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
};

/**
 * Send a notification to a single user.
 */
export const triggerNotification = async ({ userId, title, message, type = 'info', metadata = {} }) => {
  return createDoc('notifications', { userId, title, message, type, isRead: false, metadata });
};

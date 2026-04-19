import { col, getDocById, createDoc, updateDoc, snapToArray, FieldValue } from '../config/firestore.js';
import { triggerNotification, notifyAdmins } from '../utils/notificationHelper.js';
import { ApiError } from '../utils/apiError.js';

export const getNotifications = async (req, res) => {
  const snap = await col.notifications().where('userId', '==', req.user.id).orderBy('createdAt', 'desc').get();
  res.json(snapToArray(snap));
};

export const markRead = async (req, res) => {
  const notif = await getDocById('notifications', req.params.id);
  if (!notif || notif.userId !== req.user.id)
    return res.status(404).json({ message: 'Notification not found' });
  await updateDoc('notifications', notif.id, { isRead: true });
  res.json({ ...notif, isRead: true });
};

export const markAllRead = async (req, res) => {
  const snap = await col.notifications().where('userId', '==', req.user.id).where('isRead', '==', false).get();
  const batch = col.notifications().firestore.batch();
  snap.docs.forEach(d => batch.update(d.ref, { isRead: true, updatedAt: FieldValue.serverTimestamp() }));
  await batch.commit();
  res.json({ message: 'All notifications marked as read' });
};

export const deleteNotification = async (req, res) => {
  const notif = await getDocById('notifications', req.params.id);
  if (!notif || notif.userId !== req.user.id)
    return res.status(404).json({ message: 'Notification not found' });
  await col.notifications().doc(notif.id).delete();
  res.json({ message: 'Notification deleted' });
};

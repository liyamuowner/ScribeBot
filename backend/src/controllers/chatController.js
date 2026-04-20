import { col, getDocById, createDoc, updateDoc, snapToArray, getBatch, FieldValue } from '../config/firestore.js';
import { triggerNotification, notifyAdmins } from '../utils/notificationHelper.js';
import { ApiError } from '../utils/apiError.js';

export const sendMessage = async (req, res) => {
  const { message, recipientId } = req.body;
  if (!message) throw new ApiError(400, 'Message is required');

  let chat;
  if (req.user.role === 'admin') {
    if (!recipientId) throw new ApiError(400, 'Recipient ID is required for admins');
    chat = await createDoc('chatMessages', {
      userId: recipientId,
      adminId: req.user.id, adminName: req.user.name,
      sender: 'admin', message, isRead: false,
    });

    await triggerNotification({
      userId: recipientId,
      title: 'New message from Admin',
      message: 'An administrator has responded to your inquiry.',
      type: 'user',
    });
  } else {
    chat = await createDoc('chatMessages', {
      userId: req.user.id, userName: req.user.name,
      sender: 'user', message, isRead: false,
    });

    await notifyAdmins({
      title: 'New Support Message',
      message: `User ${req.user.name} sent a new message.`,
      type: 'user',
    });
  }

  res.status(201).json(chat);
};

export const getMyChatHistory = async (req, res) => {
  const snap = await col.chatMessages().where('userId', '==', req.user.id).orderBy('createdAt', 'asc').get();
  res.json(snapToArray(snap));
};

export const getAdminChats = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    // Get all distinct user IDs who sent messages
    const snap = await col.chatMessages().where('sender', '==', 'user').get();
    const userIds = [...new Set(snapToArray(snap).map(m => m.userId))];
    const users = await Promise.all(userIds.map(id => getDocById('users', id)));
    return res.json(users.filter(Boolean).map(({ id, name, email, role }) => ({ id, name, email, role })));
  }

  const snap = await col.chatMessages().where('userId', '==', userId).orderBy('createdAt', 'asc').get();
  res.json(snapToArray(snap));
};

export const markAsRead = async (req, res) => {
  const { userId } = req.params;
  const senderFilter = req.user.role === 'admin' ? 'user' : 'admin';
  const userIdFilter = req.user.role === 'admin' ? userId : req.user.id;

  const snap = await col.chatMessages()
    .where('userId', '==', userIdFilter)
    .where('sender', '==', senderFilter)
    .where('isRead', '==', false).get();

  const batch = getBatch();
  snap.docs.forEach(d => batch.update(d.ref, { isRead: true, updatedAt: FieldValue.serverTimestamp() }));
  await batch.commit();

  res.json({ success: true });
};

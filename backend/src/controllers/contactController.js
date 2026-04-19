import { col, getDocById, createDoc, updateDoc, snapToArray } from '../config/firestore.js';
import { notifyAdmins } from '../utils/notificationHelper.js';

export const createContactMessage = async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message)
    return res.status(400).json({ message: 'All fields are required' });

  const newMessage = await createDoc('contactMessages', { name, email, message, status: 'unread' });

  await notifyAdmins({
    title: 'New Public Inquiry',
    message: `You have received a new message from ${name} (${email}).`,
    type: 'info',
    metadata: { action_type: 'contact_inquiry', username: name, useremail: email, inquiryMessage: message },
  });

  res.status(201).json(newMessage);
};

export const getContactMessages = async (req, res) => {
  const snap = await col.contactMessages().orderBy('createdAt', 'desc').get();
  res.json(snapToArray(snap));
};

export const markAsRead = async (req, res) => {
  const msg = await getDocById('contactMessages', req.params.id);
  if (!msg) return res.status(404).json({ message: 'Message not found' });
  await updateDoc('contactMessages', msg.id, { status: 'read' });
  res.json({ ...msg, status: 'read' });
};

export const deleteContactMessage = async (req, res) => {
  const msg = await getDocById('contactMessages', req.params.id);
  if (!msg) return res.status(404).json({ message: 'Message not found' });
  await col.contactMessages().doc(msg.id).delete();
  res.json({ message: 'Message deleted successfully' });
};

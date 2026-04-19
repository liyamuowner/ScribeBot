import { col, getDocById, createDoc, updateDoc, snapToArray, FieldValue } from '../config/firestore.js';
import { triggerNotification, notifyAdmins } from '../utils/notificationHelper.js';
import { ApiError } from '../utils/apiError.js';

export const buyCredits = async (req, res) => {
  const { amount, packageId, paymentId } = req.body;
  if (!amount || amount <= 0) throw new ApiError(400, 'Invalid amount');

  await updateDoc('users', req.user.id, { creditBalance: FieldValue.increment(amount) });

  await createDoc('creditTransactions', {
    userId: req.user.id, userName: req.user.name,
    type: 'purchase', amount,
    description: `Purchased ${amount} Credits (Package ID: ${packageId || 'custom'})`,
    metadata: { packageId, paymentId },
  });

  await notifyAdmins({
    title: 'Credit Purchase Alert',
    message: `${req.user.name} purchased ${amount} credits. Package: ${packageId}`,
    type: 'admin_alert',
  });

  const updated = await getDocById('users', req.user.id);
  res.json({ success: true, balance: updated.creditBalance });
};

export const adjustCredits = async (req, res) => {
  const { userId, amount, type, reason } = req.body;
  if (!['admin_add', 'admin_remove'].includes(type)) throw new ApiError(400, 'Invalid adjustment type');
  if (!userId || !amount) throw new ApiError(400, 'Missing user ID or amount');

  const user = await getDocById('users', userId);
  if (!user) throw new ApiError(404, 'User not found');

  await updateDoc('users', userId, {
    creditBalance: FieldValue.increment(type === 'admin_add' ? amount : -Math.min(amount, user.creditBalance || 0)),
  });

  await createDoc('creditTransactions', {
    userId, type, amount,
    description: reason || `Admin adjustment (${type})`,
    metadata: { adminNote: reason },
  });

  await triggerNotification({
    userId,
    title: 'Wallet Balance Adjusted',
    message: `Your credit balance was updated by an administrator: ${reason}`,
    type: 'info',
  });

  const updated = await getDocById('users', userId);
  res.json({ success: true, balance: updated.creditBalance });
};

export const getMyTransactions = async (req, res) => {
  const snap = await col.creditTransactions().where('userId', '==', req.user.id).orderBy('createdAt', 'desc').limit(50).get();
  res.json(snapToArray(snap));
};

export const getAllTransactions = async (req, res) => {
  const snap = await col.creditTransactions().orderBy('createdAt', 'desc').limit(100).get();
  res.json(snapToArray(snap));
};

export const submitCreditRequest = async (req, res) => {
  const { amount, packageId, price } = req.body;
  if (!req.file) throw new ApiError(400, 'Payment slip is required');
  if (!amount || !price) throw new ApiError(400, 'Invalid amount or price');

  const slipUrl = req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;

  const request = await createDoc('creditRequests', {
    userId: req.user.id, userName: req.user.name,
    packageId: packageId || 'custom',
    amount: parseInt(amount), price: parseFloat(price),
    slipUrl, status: 'pending', adminNote: '',
  });

  await notifyAdmins({
    title: 'New Credit Purchase Request',
    message: `${req.user.name} submitted a slip for ${amount} Credits.`,
    type: 'admin_alert',
    metadata: { action_type: 'credit_request', requestId: request.id },
  });

  res.json({ success: true, message: 'Your coins will be added to your account within 24 hours', request });
};

export const getMyRequests = async (req, res) => {
  const snap = await col.creditRequests().where('userId', '==', req.user.id).orderBy('createdAt', 'desc').get();
  res.json(snapToArray(snap));
};

export const getAllCreditRequests = async (req, res) => {
  const { status } = req.query;
  let query = col.creditRequests().orderBy('createdAt', 'asc');
  if (status) query = col.creditRequests().where('status', '==', status).orderBy('createdAt', 'asc');
  res.json(snapToArray(await query.get()));
};

export const processCreditRequest = async (req, res) => {
  const { requestId, status, adminNote } = req.body;
  if (!['approved', 'rejected'].includes(status)) throw new ApiError(400, 'Invalid status');

  const request = await getDocById('creditRequests', requestId);
  if (!request) throw new ApiError(404, 'Request not found');
  if (request.status !== 'pending') throw new ApiError(400, 'Request already processed');

  await updateDoc('creditRequests', requestId, { status, adminNote: adminNote || '' });

  if (status === 'approved') {
    await updateDoc('users', request.userId, { creditBalance: FieldValue.increment(request.amount) });

    await createDoc('creditTransactions', {
      userId: request.userId, type: 'purchase', amount: request.amount,
      description: `Approved Purchase: ${request.amount} Credits`,
      metadata: { requestId, packageId: request.packageId },
    });

    await triggerNotification({
      userId: request.userId,
      title: 'Credit Purchase Approved',
      message: `Your purchase of ${request.amount} credits has been approved!`,
      type: 'success',
    });
  } else {
    await triggerNotification({
      userId: request.userId,
      title: 'Credit Purchase Rejected',
      message: `Your purchase request was rejected. Reason: ${adminNote || 'No explanation provided'}.`,
      type: 'error',
    });
  }

  res.json({ success: true, request: { ...request, status } });
};

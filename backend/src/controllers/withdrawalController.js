import { col, getDocById, createDoc, updateDoc, snapToArray, FieldValue } from '../config/firestore.js';
import { notifyAdmins, triggerNotification } from '../utils/notificationHelper.js';
import { ApiError } from '../utils/apiError.js';
import { uploadBufferToCloudinary } from '../utils/cloudinaryHelper.js';

export const createPayoutRequest = async (req, res) => {
  const { amount, bankDetails } = req.body;
  const user = req.user;

  const isEligible = user.isPro || ['pro_writer', 'verified_author'].includes(user.role);
  if (!isEligible) throw new ApiError(403, 'Payouts are only available for Pro authors.');
  if (amount < 200) throw new ApiError(400, 'Minimum payout amount is 200 credits.');

  const totalBalance = (user.creditBalance || 0) + (user.earningsBalance || 0);
  if (totalBalance < amount) throw new ApiError(400, `Insufficient balance. Your total is ${totalBalance} credits.`);

  const feeAmount = Math.floor(amount * 0.02 * 100) / 100;
  const netAmount = amount - feeAmount;

  const withdrawal = await createDoc('withdrawals', {
    userId: user.id, userName: user.name,
    amount, feeAmount, netAmount,
    bankDetails: bankDetails || '',
    status: 'pending', payoutSlip: '', rejectionReason: '',
  });

  // Deduct balance
  let earningsBalance = user.earningsBalance || 0;
  let creditBalance = user.creditBalance || 0;
  let remaining = amount;

  if (earningsBalance >= remaining) {
    earningsBalance -= remaining;
  } else {
    remaining -= earningsBalance;
    earningsBalance = 0;
    creditBalance -= remaining;
  }

  await updateDoc('users', user.id, { earningsBalance, creditBalance });

  await notifyAdmins({
    title: 'New Payout Request',
    message: `${user.name} has requested a payout of ${amount} credits.`,
    type: 'warning',
    metadata: { action_type: 'payout_request', username: user.name, amount, method: 'Bank Transfer' },
  });

  res.status(201).json(withdrawal);
};

export const getMyRequests = async (req, res) => {
  const snap = await col.withdrawals().where('userId', '==', req.user.id).orderBy('createdAt', 'desc').get();
  res.json(snapToArray(snap));
};

export const getAdminRequests = async (req, res) => {
  const snap = await col.withdrawals().orderBy('createdAt', 'desc').get();
  res.json(snapToArray(snap));
};

export const updatePayoutStatus = async (req, res) => {
  const { status, rejectionReason } = req.body;
  const withdrawal = await getDocById('withdrawals', req.params.id);
  if (!withdrawal) throw new ApiError(404, 'Request not found');

  const updates = { status };

  if (status === 'completed') {
    if (!req.file) throw new ApiError(400, 'Please upload the transfer confirmation slip.');
    let fileUrl = req.file.path;
    if (req.file.buffer) {
        fileUrl = await uploadBufferToCloudinary(req.file.buffer, 'slips', 'image');
    }
    updates.payoutSlip = fileUrl && fileUrl.startsWith('http') ? fileUrl : `/uploads/${req.file.filename}`;
  } else if (status === 'rejected') {
    if (!rejectionReason) throw new ApiError(400, 'Please provide a reason for rejection.');
    updates.rejectionReason = rejectionReason;

    // Refund
    await updateDoc('users', withdrawal.userId, {
      earningsBalance: FieldValue.increment(withdrawal.amount),
    });
  }

  await updateDoc('withdrawals', withdrawal.id, updates);

  await triggerNotification({
    userId: withdrawal.userId,
    title: `Payout ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    message: status === 'completed'
      ? `Your payout of ${withdrawal.amount} credits has been processed successfully.`
      : `Your payout request was rejected. ${withdrawal.amount} credits have been refunded. Reason: ${rejectionReason}`,
    type: 'user',
  });

  res.json({ ...withdrawal, ...updates });
};

export const deletePayoutRequest = async (req, res) => {
  const withdrawal = await getDocById('withdrawals', req.params.id);
  if (!withdrawal) throw new ApiError(404, 'Request not found');
  await col.withdrawals().doc(withdrawal.id).delete();
  res.json({ message: 'Payout record deleted successfully' });
};

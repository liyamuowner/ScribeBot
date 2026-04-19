import { col, getDocById, createDoc, updateDoc, snapToArray, FieldValue } from '../config/firestore.js';
import { triggerNotification } from '../utils/notificationHelper.js';
import { ApiError } from '../utils/apiError.js';

export const upgradeToPro = async (req, res) => {
  const { type } = req.body;
  if (!['1m', '3m', '1y'].includes(type)) throw new ApiError(400, 'Invalid subscription type');

  const user = await getDocById('users', req.user.id);
  if (!user) throw new ApiError(404, 'User not found');

  const costs = { '1m': 1000, '3m': 2500, '1y': 8000 };
  if ((user.creditBalance || 0) < costs[type]) throw new ApiError(400, 'Insufficient credits to upgrade.');

  const durations = {
    '1m': 30 * 24 * 60 * 60 * 1000,
    '3m': 90 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000,
  };

  const now = Date.now();
  const currentExpiry = user.proExpiryDate?.toMillis
    ? (user.proExpiryDate.toMillis() > now ? user.proExpiryDate.toMillis() : now)
    : now;

  const proExpiryDate = new Date(currentExpiry + durations[type]);

  await updateDoc('users', user.id, {
    creditBalance: FieldValue.increment(-costs[type]),
    isPro: true,
    proType: type,
    proExpiryDate,
    'badges.pro': true,
  });

  await triggerNotification({
    userId: user.id,
    title: 'Welcome to Pro!',
    message: `Payment successful! You now have access to Pro benefits until ${proExpiryDate.toLocaleDateString()}.`,
    type: 'purchase',
  });

  const updated = await getDocById('users', user.id);
  res.json({ success: true, user: updated });
};

export const getProStatus = async (req, res) => {
  const user = await getDocById('users', req.user.id);
  res.json({ isPro: user.isPro, proExpiryDate: user.proExpiryDate, proType: user.proType });
};

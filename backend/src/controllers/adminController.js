import { col, getDocById, createDoc, updateDoc, deleteDoc, snapToArray, getBatch, FieldValue } from '../config/firestore.js';
import { triggerNotification } from '../utils/notificationHelper.js';
import { ApiError } from '../utils/apiError.js';

export const getAdminOverview = async (req, res) => {
  const [usersSnap, authorsSnap, pendingBooksSnap, purchasesSnap] = await Promise.all([
    col.users().where('role', 'in', ['beginner_reader', 'pro_reader']).get(),
    col.users().where('role', 'in', ['author', 'verified_author', 'pro_writer']).get(),
    col.books().where('status', '==', 'pending').get(),
    col.purchases().orderBy('createdAt', 'desc').limit(50).get(),
  ]);

  res.json({
    users: usersSnap.size,
    authors: authorsSnap.size,
    pendingBooks: pendingBooksSnap.size,
    purchases: snapToArray(purchasesSnap),
  });
};

export const getAllUsers = async (req, res) => {
  const snap = await col.users().where('isDeleted', '!=', true).get();
  const users = snapToArray(snap).sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime();
    const tb = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  res.json(users);
};

export const updateUser = async (req, res) => {
  const user = await getDocById('users', req.params.id);
  if (!user) throw new ApiError(404, 'User not found');

  const { isBanned, role, badges } = req.body;
  const oldRole = user.role;

  const isOwner = user.email === 'liyamu.owner@gmail.com' || user.badges?.owner;
  if (isOwner) {
    if (typeof isBanned === 'boolean' && isBanned !== user.isBanned) throw new ApiError(403, 'The Owner account cannot be suspended or banned.');
    if (role && role !== user.role) throw new ApiError(403, 'The Owner account role cannot be changed.');
  }

  const updates = {};
  if (typeof isBanned === 'boolean') updates.isBanned = isBanned;

  const validRoles = ['reader', 'beginner_reader', 'pro_reader', 'author', 'verified_author', 'pro_writer', 'admin'];
  if (role && validRoles.includes(role)) {
    if (req.user.id === user.id && role !== 'admin') throw new ApiError(400, 'You cannot remove your own admin role');
    updates.role = role;

    // Sync role to Firestore (already in Firestore)
  }
  if (badges) updates.badges = { ...user.badges, ...badges };

  await updateDoc('users', user.id, updates);

  if (role && role !== oldRole) {
    await triggerNotification({
      userId: user.id,
      title: 'Member Rank Updated',
      message: `Your account role has been updated to ${role.replace('_', ' ')}.`,
      type: 'user',
    });
  }

  const updated = await getDocById('users', user.id);
  res.json(updated);
};

export const getBookSubmissions = async (req, res) => {
  const snap = await col.books().orderBy('createdAt', 'desc').get();
  res.json(snapToArray(snap));
};

export const reviewBookSubmission = async (req, res) => {
  const { status, rejectionReason } = req.body;
  const book = await getDocById('books', req.params.id);
  if (!book) throw new ApiError(404, 'Book not found');

  await updateDoc('books', book.id, { status, ...(rejectionReason ? { rejectionReason } : {}) });

  await triggerNotification({
    userId: book.authorId,
    title: `Book ${status}`,
    message: status === 'approved'
      ? `${book.title} is now public.`
      : `${book.title} was rejected: ${rejectionReason}`,
    type: 'book',
  });

  res.json({ ...book, status });
};

export const deleteBook = async (req, res) => {
  const book = await getDocById('books', req.params.id);
  if (!book) throw new ApiError(404, 'Book not found');

  const [reviewsSnap, purchasesSnap] = await Promise.all([
    col.reviews().where('bookId', '==', book.id).get(),
    col.purchases().where('bookId', '==', book.id).get(),
  ]);

  const batch = getBatch();
  reviewsSnap.docs.forEach(d => batch.delete(d.ref));
  purchasesSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(col.books().doc(book.id));
  await batch.commit();

  if (book.authorId) {
    await triggerNotification({
      userId: book.authorId,
      title: 'Book Removed',
      message: `Your book "${book.title}" was permanently removed by administration.`,
      type: 'book',
    });
  }

  res.json({ success: true, message: 'Book and associated data permanently removed.' });
};

export const toggleBookVisibility = async (req, res) => {
  const book = await getDocById('books', req.params.id);
  if (!book) throw new ApiError(404, 'Book not found');
  await updateDoc('books', book.id, { isHidden: !book.isHidden });
  res.json({ ...book, isHidden: !book.isHidden });
};

export const getAllUserReviews = async (req, res) => {
  const { bookId } = req.query;
  let query = col.reviews().orderBy('createdAt', 'desc');
  if (bookId) query = col.reviews().where('bookId', '==', bookId).orderBy('createdAt', 'desc');
  else query = col.reviews().orderBy('createdAt', 'desc').limit(20);
  res.json(snapToArray(await query.get()));
};

export const deleteUserReview = async (req, res) => {
  const review = await getDocById('reviews', req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');

  await deleteDoc('reviews', review.id);

  // Recalculate book rating
  const book = await getDocById('books', review.bookId);
  if (book) {
    const remaining = snapToArray(await col.reviews().where('bookId', '==', review.bookId).get());
    const avg = remaining.length ? remaining.reduce((s, r) => s + r.rating, 0) / remaining.length : 0;
    await updateDoc('books', book.id, { ratingAverage: avg, ratingCount: remaining.length });
  }

  res.json({ success: true });
};

export const getAdminCreativeWorks = async (req, res) => {
  const snap = await col.creativeWorks().orderBy('createdAt', 'desc').get();
  res.json(snapToArray(snap));
};

export const reviewCreativeWork = async (req, res) => {
  const { status, rejectionReason } = req.body;
  const work = await getDocById('creativeWorks', req.params.id);
  if (!work) throw new ApiError(404, 'Creative work not found');

  await updateDoc('creativeWorks', work.id, { status, ...(rejectionReason ? { rejectionReason } : {}) });

  await triggerNotification({
    userId: work.authorId,
    title: `Creative Work ${status === 'approved' ? 'Approved' : 'Rejected'}`,
    message: status === 'approved'
      ? `Your work "${work.title}" has been published.`
      : `Your work "${work.title}" was rejected. Reason: ${rejectionReason || 'Policy violation.'}`,
    type: 'creative',
  });

  res.json({ ...work, status });
};

export const deleteCreativeWork = async (req, res) => {
  const work = await getDocById('creativeWorks', req.params.id);
  if (!work) throw new ApiError(404, 'Creative work not found');

  await triggerNotification({
    userId: work.authorId,
    title: 'Content Moderated',
    message: `Your creative work "${work.title}" was removed by an administrator.`,
    type: 'creative',
  });

  await deleteDoc('creativeWorks', work.id);
  res.json({ success: true });
};

export const deleteUser = async (req, res) => {
  const user = await getDocById('users', req.params.id);
  if (!user) throw new ApiError(404, 'User not found');

  const isOwner = user.email === 'liyamu.owner@gmail.com' || user.badges?.owner;
  if (isOwner) throw new ApiError(403, 'The Owner account cannot be deleted.');
  if (user.role === 'admin') throw new ApiError(403, 'Administrators cannot be deleted via this dashboard.');

  // Cascade delete in batch
  const [booksSnap, creativeSnap, reviewsSnap, notifsSnap, purchasesSnap] = await Promise.all([
    col.books().where('authorId', '==', user.id).get(),
    col.creativeWorks().where('authorId', '==', user.id).get(),
    col.reviews().where('userId', '==', user.id).get(),
    col.notifications().where('userId', '==', user.id).get(),
    col.purchases().where('buyerId', '==', user.id).get(),
  ]);

  const batch = getBatch();
  [booksSnap, creativeSnap, reviewsSnap, notifsSnap, purchasesSnap].forEach(s =>
    s.docs.forEach(d => batch.delete(d.ref))
  );

  // Soft-delete user
  batch.update(col.users().doc(user.id), {
    isDeleted: true,
    deletedAt: FieldValue.serverTimestamp(),
    name: `[DELETED USER ${user.id.slice(-4)}]`,
    email: `deleted_${Date.now()}@liyamu.com`,
    phone: 'N/A',
    profilePicture: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  res.json({ success: true, message: 'User and all associated data permanently removed.' });
};

export const getDeletedUsers = async (req, res) => {
  const snap = await col.users().where('isDeleted', '==', true).orderBy('deletedAt', 'desc').get();
  res.json(snapToArray(snap));
};


import { col, getDocById, createDoc, updateDoc, snapToArray, FieldValue } from '../config/firestore.js';
import { triggerNotification } from '../utils/notificationHelper.js';
import { adminAuth } from '../config/firebase.js';

export const updateProfile = async (req, res) => {
  const { name, email, phone, bio, theme } = req.body;
  let { socialLinks } = req.body;

  if (typeof socialLinks === 'string') {
    try { socialLinks = JSON.parse(socialLinks); } catch { socialLinks = null; }
  }

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (bio !== undefined) updates.bio = bio;
  if (theme) updates['settings.theme'] = theme;

  if (req.file) {
    updates.profilePicture = req.file.path.startsWith('http')
      ? req.file.path : `/uploads/${req.file.filename}`;
  }

  if (socialLinks) {
    const current = req.user.socialLinks || {};
    updates.socialLinks = {
      facebook: socialLinks.facebook ?? current.facebook ?? '',
      whatsapp: socialLinks.whatsapp ?? current.whatsapp ?? '',
      telegram: socialLinks.telegram ?? current.telegram ?? '',
    };
  }

  await updateDoc('users', req.user.id, updates);
  const updated = await getDocById('users', req.user.id);
  res.json(updated);
};

export const getAuthors = async (req, res) => {
  const snap = await col.users()
    .where('role', 'in', ['author', 'verified_author', 'pro_writer'])
    .where('isBanned', '==', false).get();

  const authors = snapToArray(snap);

  // Count books per author
  const bookCounts = await Promise.all(
    authors.map(a => col.books().where('authorId', '==', a.id).where('status', '==', 'approved').get())
  );

  res.json(authors.map((a, i) => ({ ...a, bookCount: bookCounts[i].size })));
};

export const toggleWishlist = async (req, res) => {
  const { bookId } = req.params;
  const wishlist = req.user.wishlist || [];
  const has = wishlist.includes(bookId);

  await updateDoc('users', req.user.id, {
    wishlist: has ? FieldValue.arrayRemove(bookId) : FieldValue.arrayUnion(bookId),
  });

  res.json({ wishlist: has ? wishlist.filter(id => id !== bookId) : [...wishlist, bookId] });
};

export const toggleFollow = async (req, res) => {
  const { authorId } = req.params;
  const author = await getDocById('users', authorId);
  if (!author) return res.status(404).json({ message: 'Author not found' });

  const following = req.user.following || [];
  const isFollowing = following.includes(authorId);

  await updateDoc('users', req.user.id, {
    following: isFollowing ? FieldValue.arrayRemove(authorId) : FieldValue.arrayUnion(authorId),
  });

  await updateDoc('users', authorId, {
    followersCount: FieldValue.increment(isFollowing ? -1 : 1),
  });

  if (!isFollowing) {
    await triggerNotification({
      userId: authorId,
      title: 'New Follower!',
      message: `${req.user.name} started following you.`,
      type: 'user',
    });
  }

  const newFollowing = isFollowing ? following.filter(id => id !== authorId) : [...following, authorId];
  res.json({ following: newFollowing, followersCount: (author.followersCount || 0) + (isFollowing ? -1 : 1) });
};

export const getFollowedAuthors = async (req, res) => {
  const following = req.user.following || [];
  if (!following.length) return res.json([]);

  const profiles = await Promise.all(following.map(id => getDocById('users', id)));
  res.json(profiles.filter(Boolean).map(({ id, name, profilePicture, role, followersCount, bio }) =>
    ({ id, name, profilePicture, role, followersCount, bio })
  ));
};

export const updateReadingProgress = async (req, res) => {
  const { bookId } = req.params;
  const history = req.user.readingHistory || [];

  await updateDoc('users', req.user.id, {
    lastReadBook: bookId,
    readingHistory: history.includes(bookId) ? history : FieldValue.arrayUnion(bookId),
  });

  res.json({ lastReadBook: bookId });
};

export const toggleBookmark = async (req, res) => {
  const { workId } = req.params;
  const bookmarks = req.user.bookmarkedWorks || [];
  const has = bookmarks.includes(workId);

  await updateDoc('users', req.user.id, {
    bookmarkedWorks: has ? FieldValue.arrayRemove(workId) : FieldValue.arrayUnion(workId),
  });

  res.json({ bookmarkedWorks: has ? bookmarks.filter(id => id !== workId) : [...bookmarks, workId] });
};

export const getBookmarkedWorks = async (req, res) => {
  const ids = req.user.bookmarkedWorks || [];
  if (!ids.length) return res.json([]);
  const works = await Promise.all(ids.map(id => getDocById('creativeWorks', id)));
  res.json(works.filter(Boolean));
};

export const deleteMyAccount = async (req, res) => {
  const user = req.user;
  if (user.email === 'liyamu.owner@gmail.com') {
    return res.status(403).json({ message: 'Owner account cannot be deleted' });
  }

  await updateDoc('users', user.id, {
    isDeleted: true,
    deletedAt: FieldValue.serverTimestamp(),
    name: `[DELETED USER ${user.id.slice(-4)}]`,
    email: `deleted_${Date.now()}_${user.id}@liyamu.com`,
    phone: 'N/A',
  });

  // Delete from Firebase Auth
  try {
    const fa = adminAuth();
    if (fa) await fa.deleteUser(user.id);
  } catch (e) {
    console.error('Firebase Auth delete failed:', e.message);
  }

  res.json({ success: true, message: 'Account deleted successfully' });
};

export const getAuthorProfile = async (req, res) => {
  const { id } = req.params;
  const author = await getDocById('users', id);
  if (!author) return res.status(404).json({ message: 'Author not found' });

  const [booksSnap, creativeSnap] = await Promise.all([
    col.books().where('authorId', '==', id).where('status', '==', 'approved').orderBy('createdAt', 'desc').get(),
    col.creativeWorks().where('authorId', '==', id).where('status', '==', 'approved').orderBy('createdAt', 'desc').limit(10).get(),
  ]);

  res.json({ ...author, books: snapToArray(booksSnap), creativeWorks: snapToArray(creativeSnap) });
};

export const updatePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!currentPassword || !newPassword || !confirmPassword)
    return res.status(400).json({ message: 'All fields are required' });
  if (newPassword !== confirmPassword)
    return res.status(400).json({ message: 'New passwords do not match' });
  if (newPassword.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });

  if (req.user.socialProvider !== 'local')
    return res.status(400).json({ message: 'Social accounts cannot change password here' });

  // Firebase Auth handles password updates — this requires re-auth on the client side
  // Backend updates Firebase Auth user password
  try {
    const fa = adminAuth();
    if (fa) await fa.updateUser(req.user.id, { password: newPassword });
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

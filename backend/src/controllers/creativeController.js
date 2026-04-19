import { col, getDocById, createDoc, updateDoc, snapToArray, FieldValue } from '../config/firestore.js';
import { notifyAdmins, triggerNotification } from '../utils/notificationHelper.js';
import { ApiError } from '../utils/apiError.js';
import ispurify from 'isomorphic-dompurify';

const DOMPurify = ispurify;

export const createWork = async (req, res) => {
  const { title, content, category, language = 'English', tags = [] } = req.body;
  if (!title || !content || !category) throw new ApiError(400, 'Missing required fields');

  const work = await createDoc('creativeWorks', {
    title,
    content: DOMPurify.sanitize(content),
    category, language,
    tags: Array.isArray(tags) ? tags : [],
    authorId: req.user.id,
    authorName: req.user.name,
    authorPicture: req.user.profilePicture || '',
    status: 'pending',
    rejectionReason: '',
    likes: [], likesCount: 0,
    comments: [],
    viewCount: 0,
    isDeleted: false, deletedAt: null,
  });

  await notifyAdmins({
    title: 'Creative Corner Moderation',
    message: `New creative work "${title}" posted by ${req.user.name}.`,
    type: 'creative',
    metadata: { action_type: 'creative_submission', title, authorName: req.user.name, category },
  });

  res.status(201).json(work);
};

export const getWorks = async (req, res) => {
  const { search = '', category, language } = req.query;

  const snap = await col.creativeWorks()
    .where('status', '==', 'approved')
    .where('isDeleted', '==', false)
    .get();

  let works = snapToArray(snap);

  // Sort by createdAt descending (JS-side to avoid composite index requirement)
  works.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime();
    const tb = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });

  if (search) {
    const s = search.toLowerCase();
    works = works.filter(w =>
      w.title?.toLowerCase().includes(s) ||
      w.authorName?.toLowerCase().includes(s) ||
      (w.tags || []).some(t => t.toLowerCase().includes(s))
    );
  }
  if (category && category !== 'All') works = works.filter(w => w.category === category);
  if (language && language !== 'All') works = works.filter(w => w.language === language);

  res.json(works);
};


export const getWorkById = async (req, res) => {
  const work = await getDocById('creativeWorks', req.params.id);
  if (!work) throw new ApiError(404, 'Work not found');

  if (work.status !== 'approved' && req.user.id !== work.authorId && req.user.role !== 'admin') {
    throw new ApiError(403, 'This work is pending moderation.');
  }

  await updateDoc('creativeWorks', work.id, { viewCount: FieldValue.increment(1) });
  res.json(work);
};

export const likeWork = async (req, res) => {
  const work = await getDocById('creativeWorks', req.params.id);
  if (!work) throw new ApiError(404, 'Work not found');

  const likes = work.likes || [];
  const isLiked = likes.includes(req.user.id);

  await updateDoc('creativeWorks', work.id, {
    likes: isLiked ? FieldValue.arrayRemove(req.user.id) : FieldValue.arrayUnion(req.user.id),
    likesCount: FieldValue.increment(isLiked ? -1 : 1),
  });

  if (!isLiked && work.authorId !== req.user.id) {
    await triggerNotification({
      userId: work.authorId,
      title: 'New Like on Creative Corner',
      message: `${req.user.name} liked your creative work "${work.title}".`,
      type: 'creative',
    });
  }

  res.json({ likesCount: (work.likesCount || 0) + (isLiked ? -1 : 1), isLiked: !isLiked });
};

export const addComment = async (req, res) => {
  const { text } = req.body;
  const work = await getDocById('creativeWorks', req.params.id);
  if (!work) throw new ApiError(404, 'Work not found');

  const newComment = {
    id: Date.now().toString(),
    userId: req.user.id,
    userName: req.user.name,
    userPicture: req.user.profilePicture || '',
    text: DOMPurify.sanitize(text),
    createdAt: new Date().toISOString(),
  };

  await updateDoc('creativeWorks', work.id, { comments: FieldValue.arrayUnion(newComment) });

  if (work.authorId !== req.user.id) {
    await triggerNotification({
      userId: work.authorId,
      title: 'New Comment on Creative Corner',
      message: `${req.user.name} commented on your work "${work.title}".`,
      type: 'creative',
    });
  }

  const updated = await getDocById('creativeWorks', work.id);
  res.json(updated.comments);
};

export const deleteMyWork = async (req, res) => {
  const work = await getDocById('creativeWorks', req.params.id);
  if (!work) throw new ApiError(404, 'Work not found');
  if (work.authorId !== req.user.id) throw new ApiError(403, 'Unauthorized');

  await updateDoc('creativeWorks', work.id, { isDeleted: true, deletedAt: FieldValue.serverTimestamp() });

  await triggerNotification({
    userId: req.user.id,
    title: 'Work Deleted',
    message: `Your work "${work.title}" has been deleted.`,
    type: 'creative',
  });

  res.json({ success: true, message: 'Work moved to trash' });
};

export const getUserDeletedWorks = async (req, res) => {
  const snap = await col.creativeWorks()
    .where('authorId', '==', req.user.id)
    .where('isDeleted', '==', true)
    .orderBy('deletedAt', 'desc').get();
  res.json(snapToArray(snap));
};

export const restoreWork = async (req, res) => {
  const work = await getDocById('creativeWorks', req.params.id);
  if (!work) throw new ApiError(404, 'Work not found');
  if (work.authorId !== req.user.id) throw new ApiError(403, 'Unauthorized');

  await updateDoc('creativeWorks', work.id, { isDeleted: false, deletedAt: null });

  await triggerNotification({
    userId: req.user.id,
    title: 'Work Restored',
    message: `Your work "${work.title}" has been restored.`,
    type: 'creative',
  });

  res.json({ success: true, message: 'Work restored successfully' });
};

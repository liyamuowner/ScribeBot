import express from 'express';
import { 
  getAuthors, 
  toggleWishlist, 
  updateProfile, 
  toggleFollow,
  getFollowedAuthors,
  updateReadingProgress,
  toggleBookmark,
  getBookmarkedWorks,
  deleteMyAccount,
  getAuthorProfile,
  updatePassword
} from '../controllers/userController.js';
import { sendMessage, getMyChatHistory, markAsRead } from '../controllers/chatController.js';
import { uploadProfile } from '../middleware/uploadMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// ⚠️ Named routes MUST come before /:id wildcard to avoid being swallowed by it
router.get('/authors', getAuthors);

// Protected named routes
router.get('/bookmarks', protect, getBookmarkedWorks);
router.get('/following', protect, getFollowedAuthors);
router.get('/chat', protect, getMyChatHistory);
router.put('/profile', protect, uploadProfile.single('profilePicture'), updateProfile);
router.put('/password', protect, updatePassword);
router.put('/wishlist/:bookId', protect, toggleWishlist);
router.put('/reading-progress/:bookId', protect, updateReadingProgress);
router.post('/follow/:authorId', protect, toggleFollow);
router.post('/bookmarks/:workId', protect, toggleBookmark);
router.post('/chat', protect, sendMessage);
router.put('/chat/read', protect, markAsRead);
router.delete('/me', protect, deleteMyAccount);

// Wildcard route (must be last)
router.get('/:id', getAuthorProfile);

export default router;

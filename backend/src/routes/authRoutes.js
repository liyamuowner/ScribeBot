import express from 'express';
import { login, me, register, socialLogin, checkEmail } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.post('/register', register);
router.post('/login', login);
router.post('/social-login', socialLogin);
router.post('/check-email', checkEmail);
router.get('/me', protect, me);
export default router;

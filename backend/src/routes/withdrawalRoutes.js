import express from 'express';
import { 
  createPayoutRequest, 
  getAdminRequests, 
  getMyRequests, 
  updatePayoutStatus,
  deletePayoutRequest
} from '../controllers/withdrawalController.js';
import { authorize, protect } from '../middleware/authMiddleware.js';
import { uploadSlip } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Author Routes (all author-tier roles are eligible for payouts)
router.post('/request', protect, authorize('author', 'verified_author', 'pro_writer'), createPayoutRequest);
router.get('/mine', protect, authorize('author', 'verified_author', 'pro_writer'), getMyRequests);

// Admin Routes
router.get('/admin', protect, authorize('admin'), getAdminRequests);
// Status update (handles the slip upload)
router.put('/admin/:id', protect, authorize('admin', 'mod'), uploadSlip.single('payoutSlip'), updatePayoutStatus);
router.delete('/admin/:id', protect, authorize('admin'), deletePayoutRequest);

export default router;

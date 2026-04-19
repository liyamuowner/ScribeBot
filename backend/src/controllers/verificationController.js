import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { col, getDocById, createDoc, updateDoc, snapToArray, FieldValue } from '../config/firestore.js';
import { notifyAdmins, triggerNotification } from '../utils/notificationHelper.js';
import { ApiError } from '../utils/apiError.js';
import { v2 as cloudinary } from 'cloudinary';

export const submitVerification = async (req, res) => {
  const { name, idNumber, contactNumber } = req.body;

  // Check for existing pending request
  const existing = await col.verificationRequests()
    .where('authorId', '==', req.user.id)
    .where('status', '==', 'pending').limit(1).get();
  if (!existing.empty) throw new ApiError(400, 'Pending request already exists');

  const documentUrl = req.file
    ? (req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`)
    : req.body.documentUrl;
  if (!documentUrl) throw new ApiError(400, 'Verification document is required');

  const request = await createDoc('verificationRequests', {
    authorId: req.user.id, authorName: req.user.name,
    name, idNumber, contactNumber, documentUrl,
    status: 'pending', rejectionReason: '', certificateUrl: '',
    reviewedAt: null, reviewedById: null,
  });

  await triggerNotification({
    userId: req.user.id,
    title: 'Verification submitted',
    message: 'Your application has been submitted. Verification may take up to 4 days.',
    type: 'verification',
  });

  await notifyAdmins({
    title: 'Identity Verification Pending',
    message: `New verification request from ${name}.`,
    type: 'verification',
    metadata: { action_type: 'kyc_submission', name, idNumber },
  });

  res.status(201).json(request);
};

export const getVerificationRequests = async (req, res) => {
  const snap = await col.verificationRequests().orderBy('createdAt', 'desc').get();
  res.json(snapToArray(snap));
};

export const decideVerification = async (req, res) => {
  const { status, rejectionReason } = req.body;
  const request = await getDocById('verificationRequests', req.params.id);
  if (!request) throw new ApiError(404, 'Request not found');

  await updateDoc('verificationRequests', request.id, {
    status, ...(rejectionReason ? { rejectionReason } : {}),
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedById: req.user.id,
  });

  if (status === 'accepted') {
    await updateDoc('users', request.authorId, {
      role: 'verified_author',
      'badges.verifiedAuthor': true,
    });

    // Notify admins
    await notifyAdmins({
      title: 'Author Approved',
      message: `Admin ${req.user.name} approved ${request.authorName} as a verified author.`,
      type: 'verification',
    });

    // PDF Certificate - Using os.tmpdir() for serverless compatibility
    const outputDir = process.env.NODE_ENV === 'production' ? os.tmpdir() : path.resolve('uploads');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    const pdfPath = path.join(outputDir, `verification-${request.authorId}.pdf`);
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    doc.fontSize(18).text('Verified Author Certificate');
    doc.moveDown();
    doc.fontSize(12).text(`User name: ${request.authorName}`);
    doc.text(`Contact number: ${request.contactNumber}`);
    doc.text(`Verified date: ${new Date().toLocaleDateString()}`);
    doc.text(`Approved by: ${req.user.name}`);
    doc.end();

    stream.on('finish', async () => {
      try {
        if (process.env.CLOUDINARY_CLOUD_NAME) {
          const result = await cloudinary.uploader.upload(pdfPath, { folder: 'liyamu/certificates', resource_type: 'auto' });
          await updateDoc('verificationRequests', request.id, { certificateUrl: result.secure_url });
        }
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      } catch (err) {
        console.error('Failed to upload certificate:', err);
      }
    });
  }

  await triggerNotification({
    userId: request.authorId,
    title: `Verification ${status === 'accepted' ? 'Approved' : 'Rejected'}`,
    message: status === 'accepted'
      ? 'Congratulations! Your author verification was approved. You can now publish books.'
      : `Your author verification was rejected. Reason: ${rejectionReason || 'No reason provided.'}`,
    type: 'verification',
  });

  res.json({ ...request, status });
};

import multer from 'multer';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper to determine storage
const getStorage = (folder) => {
  const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && 
                               process.env.CLOUDINARY_API_KEY && 
                               process.env.CLOUDINARY_API_SECRET;

  const isServerless = !!process.env.NETLIFY || !!process.env.LAMBDA_TASK_ROOT || process.env.NODE_ENV === 'production';

  // FORCE Memory Storage in Serverless/Production environments
  if (isServerless) {
    console.warn(`[Storage] Serverless detected. Cloudinary configured: ${!!isCloudinaryConfigured}. Using memory storage.`);
    return multer.memoryStorage();
  }

  if (isCloudinaryConfigured) {
    return new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: `liyamu/${folder}`,
        resource_type: 'auto',
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'webp'],
        public_id: (req, file) => `${Date.now()}-${file.originalname.split('.')[0]}`,
      },
    });
  }

  // Local storage for development only (only if NOT serverless)
  console.log('[Storage] Local environment detected. Using disk storage.');
  return multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
    },
  });
};

const createFilter = (allowedExts, allowedMimes) => (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const extOk = allowedExts.some(e => ext === `.${e}`);
  const mimeOk = allowedMimes.test(file.mimetype);
  
  if (extOk && mimeOk) {
    cb(null, true);
  } else {
    const types = allowedExts.join('|');
    cb(new Error(`Invalid file type. Allowed: ${types}`));
  }
};

// 10MB Image Limit
export const uploadProfile = multer({
  storage: getStorage('profiles'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: createFilter(['jpeg', 'jpg', 'png', 'webp'], /image/),
});

// 10MB PDF/Image Limit
export const uploadVerification = multer({
  storage: getStorage('verifications'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: createFilter(['jpeg', 'jpg', 'png', 'pdf', 'webp'], /image|pdf/),
});

// 200MB Limit (for PDF) and Image/PDF Filter for Book Uploads
export const uploadBookFiles = multer({
  storage: getStorage('books'),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: createFilter(['jpeg', 'jpg', 'png', 'pdf', 'webp'], /image|pdf/),
});

export const uploadBookPDF = multer({
  storage: getStorage('books'),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: createFilter(['pdf'], /pdf/),
});

// 10MB Limit for Payment Slips
export const uploadSlip = multer({
  storage: getStorage('slips'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: createFilter(['jpeg', 'jpg', 'png', 'webp'], /image/),
});


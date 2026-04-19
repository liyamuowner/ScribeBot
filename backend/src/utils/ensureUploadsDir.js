import fs from 'fs';
import path from 'path';

/**
 * Ensures that the 'uploads' directory exists.
 * This is crucial for local development where Multer expects the folder to be present.
 */
export const ensureUploadsDir = () => {
  const uploadsDir = path.resolve('uploads');
  if (!fs.existsSync(uploadsDir)) {
    console.log('📁 Creating missing uploads directory...');
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
};

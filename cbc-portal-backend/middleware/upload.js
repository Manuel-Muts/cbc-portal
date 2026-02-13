import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure folder exists
const uploadPath = path.join(process.cwd(), 'uploads/school-logos');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `school_${Date.now()}${ext}`);
  }
});

// Filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed!'), false);
};

export const upload = multer({ storage, fileFilter });

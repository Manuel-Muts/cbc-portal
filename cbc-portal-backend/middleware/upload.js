import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure upload directory exists for temporary processing
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Local disk storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename and add timestamp
    const name = file.originalname.toLowerCase().split(' ').join('-');
    const ext = path.extname(name);
    const fileName = name.replace(ext, '');
    cb(null, `${fileName}-${Date.now()}${ext}`);
  }
});

// Filter to allow only images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});
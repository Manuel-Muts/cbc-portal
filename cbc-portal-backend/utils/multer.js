// c:\CBC STUDENT PORTAL H\cbc-portal-backend\utils\multer.js
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { cloudinary } from './cloudinary.js';

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: 'cbc-portal-materials',
      resource_type: 'raw', // Always raw for docs/PDFs
      type: "upload",
      access_mode: "public",
      public_id: file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, "_") + "-" + Date.now(),
      format: file.originalname.split('.').pop()
    };
  },
});

// Validate file types locally in Node.js instead of on Cloudinary
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF and Word documents are allowed.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter
});

export default upload;

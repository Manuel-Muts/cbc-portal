import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Debugging: Check if credentials are loaded correctly
console.log("☁️  Cloudinary Config Check:");
console.log(`   Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME || 'MISSING'}`);
console.log(`   API Key: ${process.env.CLOUDINARY_API_KEY || 'MISSING'}`);
console.log(`   API Secret: ${process.env.CLOUDINARY_API_SECRET ? `Present (Length: ${process.env.CLOUDINARY_API_SECRET.length})` : 'MISSING'}`);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export { cloudinary };
// seedAdmin.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js'; // adjust path to your User model

dotenv.config();

// --- Config ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cbc_portal';

// --- Connect to DB ---
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// --- Seed Admin ---
async function seedAdmin() {
  try {
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('⚠️ Admin already exists:', existingAdmin.email);
      process.exit(0);
    }

    const plainPassword = 'Admin@025cBc'; // default password (change after first login)
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const admin = new User({
      name: 'Super Admin',
      role: 'admin',
      email: 'cbcportal71@gmail.com',
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await admin.save();
    console.log('✅ Admin seeded successfully!');
    console.log('📌 Credentials:');
    console.log('   Email: cbcportal71@gmail.com');
    console.log('   Password:', plainPassword);
    process.exit(0);
  } catch(err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedAdmin();

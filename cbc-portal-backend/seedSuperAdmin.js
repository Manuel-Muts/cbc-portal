// seedSuperAdmin.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from './models/User.js'; // make sure your model exports User

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cbc_portal';

// Connect to MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Seed Super Admin
async function seedSuperAdmin() {
  try {
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });

    if (existingSuperAdmin) {
      console.log('⚠️ Super Admin already exists:', existingSuperAdmin.email);
      process.exit(0);
    }

    const plainPassword = 'Admin@025cBc'; // Change after first login
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const superAdmin = new User({
      name: 'Super Admin',
      email: 'cbcportal71@gmail.com',
      role: 'super_admin',
      password: hashedPassword,
      passwordMustChange: true,
      schoolId: null // super_admin is global
    });

    await superAdmin.save();

    console.log('✅ Super Admin seeded successfully!');
    console.log('📌 Credentials:');
    console.log('   Email:', superAdmin.email);
    console.log('   Password:', plainPassword);

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedSuperAdmin();

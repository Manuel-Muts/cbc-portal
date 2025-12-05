import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js'; // ✅ exact path and case-sensitive

dotenv.config();

const deleteAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const result = await User.deleteMany({ role: 'admin' }); // ✅ works if User is the model
    console.log(`✅ Deleted ${result.deletedCount} admin(s)`);
    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
    await mongoose.connection.close();
  }
};

deleteAdmin();

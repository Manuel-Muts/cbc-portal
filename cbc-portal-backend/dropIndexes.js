import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log("Connected to MongoDB");

  try {
    await mongoose.connection.collection('users').dropIndex('email_1');
    await mongoose.connection.collection('users').dropIndex('admission_1');
    console.log("Indexes dropped successfully");
  } catch (err) {
    console.error("Error dropping indexes:", err.message);
  } finally {
    mongoose.connection.close();
  }
});
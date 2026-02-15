import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config(); // Load .env variables

// ------------------------
// Create transporter
// ------------------------
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,          // smtp.gmail.com
  port: Number(process.env.EMAIL_PORT),  // 587
  secure: false,                         // false for TLS (587)
  auth: {
    user: process.env.EMAIL_USER,        // your Gmail address
    pass: process.env.EMAIL_PASS,        // your Gmail App Password
  },
});

// Verify connection configuration
transporter.verify()
  .then(() => console.log('✅ SMTP server is ready'))
  .catch(err => console.error('❌ SMTP verification failed:', err));

const sendEmail = async ({ to, subject, text, html }) => {
  try {
    await transporter.sendMail({
      from: `"CBC Portal" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err);
    throw err;
  }
};

export default sendEmail;
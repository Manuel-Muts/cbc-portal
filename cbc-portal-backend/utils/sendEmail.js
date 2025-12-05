import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config(); // Load .env variables

// ------------------------
// Create transporter
// ------------------------
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: Number(process.env.EMAIL_PORT) === 465, // true if using SSL port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // ✅ allow self-signed certificates
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
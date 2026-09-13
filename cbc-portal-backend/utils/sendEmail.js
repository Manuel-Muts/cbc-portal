import dotenv from 'dotenv';
import SibApiV3Sdk from 'sib-api-v3-sdk';

dotenv.config();


const client = SibApiV3Sdk.ApiClient.instance;

// Choose API key based on environment
const apiKey = process.env.BREVO_API_KEY;
client.authentications['api-key'].apiKey = apiKey;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const sendEmail = async ({ to, subject, text, html }) => {
  const recipient = String(to || '').trim().toLowerCase();
  const sender = String(process.env.EMAIL_USER || '').trim().toLowerCase();

  if (!recipient) throw new Error('Email recipient is missing');
  if (!sender) throw new Error('EMAIL_USER is not configured');

  try {
    const response = await apiInstance.sendTransacEmail({
      sender: { email: sender, name: "COMPETENCEHUB" },
      to: [{ email: recipient }],
      subject,
      textContent: text,
      htmlContent: html,
    });

    console.log(`✅ Email accepted by Brevo for ${recipient}`, {
      messageId: response?.messageId || null
    });
    return response;
  } catch (err) {
    // Brevo errors often include structured response bodies
    console.error(`❌ Failed to send email to ${recipient}:`, err.response?.body || err);
    throw err;
  }
};

export default sendEmail;

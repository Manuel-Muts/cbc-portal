import dotenv from 'dotenv';
import SibApiV3Sdk from 'sib-api-v3-sdk';

dotenv.config();


const client = SibApiV3Sdk.ApiClient.instance;

// Choose API key based on environment
const apiKey = process.env.BREVO_API_KEY;
client.authentications['api-key'].apiKey = apiKey;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const response = await apiInstance.sendTransacEmail({
      sender: { email: "cbcportal71@gmail.com", name: "Muts tech ltd" },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    });

    console.log(`✅ Email sent to ${to}`, response);
  } catch (err) {
    // Brevo errors often include structured response bodies
    console.error(`❌ Failed to send email to ${to}:`, err.response?.body || err);
    throw err;
  }
};

export default sendEmail;
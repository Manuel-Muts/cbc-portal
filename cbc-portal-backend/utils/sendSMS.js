import AfricasTalking from 'africastalking';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Utility to calculate number of SMS segments (credits) for a message.
 * Standard length is 160. Concatenated messages use 153 chars per segment.
 */
export const countSMSSegments = (message) => {
  if (!message) return 0;
  const len = message.length;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
};

/**
 * Utility to send SMS via Africa's Talking Gateway
 * @param {string|string[]} to - Recipient phone number(s) in international format (e.g. +254700000000)
 * @param {string} message - The message body
 */
const sendSMS = async (to, message) => {
  try {
    // 🆕 Initialize SDK inside the function to ensure fresh env variables
    const username = (process.env.AT_USERNAME || process.env.AFRICASTALKING_USERNAME || 'sandbox').trim();
    const apiKey = (process.env.AT_API_KEY || process.env.AFRICASTALKING_API_KEY || "").trim();

    if (!apiKey) {
      console.error("❌ AT Gateway Error: API Key missing in .env");
      return null;
    }

    const isSandbox = username.toLowerCase() === 'sandbox';
    const senderId = (process.env.AT_SENDER_ID || "").trim();

    console.log(`📡 AT Gateway: Initializing as [${username}] in ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} mode...`);
    if (!isSandbox && !senderId) {
      console.warn("⚠️ AT Gateway Warning: No AT_SENDER_ID found in .env. Transactional messages may be blocked by carrier DND filters.");
    }

    const sms = AfricasTalking({ username, apiKey }).SMS;

    const recipientsArray = Array.isArray(to) ? to : [to];

    // 🆕 Robust sanitization: Remove duplicates, spaces, and ensure +254 format
    const cleanRecipients = [...new Set(recipientsArray)]
      .map(num => String(num || "").replace(/[^\d+]/g, "").trim())
      .map(num => {
        // Handle Kenyan numbers starting with 0, 7, or 1
        if (num.startsWith("0")) return "254" + num.substring(1);
        if (num.startsWith("7") || num.startsWith("1")) return "254" + num;
        return num;
      })
      .filter(num => num.length >= 12) // Ensure it looks like an international number (e.g. 254...)
      .map(num => num.startsWith("+") ? num : "+" + num); // Prepend + for SDK compatibility

    if (cleanRecipients.length === 0) {
      console.warn(`⚠️ sendSMS: No valid recipients found after sanitizing: ${JSON.stringify(to)}`);
      return;
    }

    console.log(`[AT Gateway] Attempting to send to: ${cleanRecipients.join(', ')}`);

    const options = {
      to: cleanRecipients, // 🆕 Pass as Array to satisfy strict SDK type validation
      message: message,
      // Use Alphanumeric Sender ID only if it is explicitly set in the .env file
      // This is REQUIRED to bypass DND for Transactional SMS (OTPs/Marks)
      ...(senderId && { from: senderId })
    };

    // 🆕 Add a tiny delay for Sandbox to prevent 401 rate-limit errors
    if (isSandbox) {
      await new Promise(resolve => setTimeout(resolve, 150)); 
    }

    const response = await sms.send(options);
    console.log(`[AT Gateway] Message sent to ${cleanRecipients.length} numbers. Response:`, JSON.stringify(response));

    // 🆕 Detect DND/Blacklist status in the response to help troubleshooting
    response.SMSMessageData.Recipients.forEach(recipient => {
      if (recipient.statusCode === 406) {
        console.error(`🚩 AT Gateway Warning: ${recipient.number} is blacklisted (DND).`);
        console.error(`   Note: This parent has blocked shared shortcodes or is on the AT internal blacklist.`);
        console.error(`   Solution: Use an Alphanumeric Sender ID or ask recipient to send 'START' to the shortcode.`);
      }
    });

    return response;
  } catch (err) {
    // 🆕 Enhanced error reporting
    const errorMsg = err.response?.data || err.message;
    console.error("❌ SMS Gateway Error:", {
      status: err.response?.status,
      detail: errorMsg
    });
    return null;
  }
};

export default sendSMS;
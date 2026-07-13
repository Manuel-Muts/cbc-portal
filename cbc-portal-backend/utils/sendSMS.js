import axios from 'axios';
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

export const sanitizeRecipients = (to) => {
  const recipientsArray = Array.isArray(to) ? to : [to];

  const normalized = recipientsArray
    .map(num => String(num || '').replace(/[^\d+]/g, '').trim())
    .map(num => {
      if (num.startsWith('0')) return '254' + num.substring(1);
      if (num.startsWith('7') || num.startsWith('1')) return '254' + num;
      return num;
    })
    .filter(num => num.length >= 12)
    .map(num => num.startsWith('+') ? num : '+' + num);

  return [...new Set(normalized)];
};

export const classifySmsProviderResponse = (response) => {
  if (!response) return 'Failed';

  const directStatus = String(response?.status || response?.message || '').toLowerCase();
  if (['success', 'sent', 'accepted', 'queued', 'ok'].includes(directStatus)) return 'Sent';

  const recipients = response?.SMSMessageData?.Recipients || response?.data?.recipients || response?.recipients || [];
  const isSuccess = Array.isArray(recipients)
    ? recipients.some((recipient) => {
        const recipientStatus = String(recipient?.status || recipient?.state || recipient?.code || '').toLowerCase();
        return ['success', 'sent', 'accepted', 'queued', 'ok', '200', '202'].includes(recipientStatus);
      })
    : false;

  if (isSuccess) return 'Sent';

  const summary = response?.data?.summary || response?.summary || {};
  const successCount = Number(summary?.success || summary?.sent || summary?.accepted || 0);
  const failedCount = Number(summary?.failed || summary?.error || summary?.rejected || 0);
  if (successCount > 0 && failedCount === 0) return 'Sent';
  if (successCount > 0 && failedCount > 0) return 'Sent';

  return 'Failed';
};

/**
 * Utility to send SMS via Talksasa Gateway
 * @param {string|string[]} to - Recipient phone number(s) in international format (e.g. +254700000000)
 * @param {string} message - The message body
 */
const sendSMS = async (to, message) => {
  try {
    const apiKey = (process.env.TALKSASA_API_KEY || process.env.AT_API_KEY || process.env.AFRICASTALKING_API_KEY || '').trim();
    const senderId = (process.env.TALKSASA_SENDER_ID || process.env.AT_SENDER_ID || '').trim();
    const baseUrl = (process.env.TALKSASA_BASE_URL || 'https://bulksms.talksasa.com')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/api\/v3\/sms\/(?:send|balance)$/, '');

    if (!apiKey) {
      console.error('❌ Talksasa Gateway Error: API key missing in .env');
      return null;
    }

    const cleanRecipients = sanitizeRecipients(to);

    if (cleanRecipients.length === 0) {
      console.warn(`⚠️ sendSMS: No valid recipients found after sanitizing: ${JSON.stringify(to)}`);
      return;
    }

    console.log(`[Talksasa Gateway] Attempting to send to: ${cleanRecipients.join(', ')}`);

    const recipientList = cleanRecipients.join(',');

    const payload = {
      recipient: recipientList,
      sender_id: senderId || 'TALKSASA',
      type: 'plain',
      message,
      schedule_time: null
    };

    const response = await axios.post(`${baseUrl}/api/v3/sms/send`, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    console.log(`[Talksasa Gateway] Message sent to ${cleanRecipients.length} numbers. Response:`, JSON.stringify(response.data));
    return response.data;
  } catch (err) {
    const errorMsg = err.response?.data || err.message;
    console.error('❌ Talksasa SMS Gateway Error:', {
      status: err.response?.status,
      detail: errorMsg
    });
    return null;
  }
};

export default sendSMS;
import crypto from 'node:crypto';
import { SCHOOL_PLANS } from '../utils/planAccess.js';

const PLAN_PRICE_ENV_KEYS = {
  basic: 'MPESA_STK_SUBSCRIPTION_BASIC_AMOUNT',
  standard: 'MPESA_STK_SUBSCRIPTION_STANDARD_AMOUNT',
  premium: 'MPESA_STK_SUBSCRIPTION_PREMIUM_AMOUNT'
};

export const normalizeKenyanPhoneNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  const normalized = digits.startsWith('0') ? `254${digits.slice(1)}`
    : digits.startsWith('254') ? digits
      : `254${digits}`;

  if (!/^254(?:7|1)\d{8}$/.test(normalized)) {
    throw new Error('Enter a valid Kenyan mobile number.');
  }

  return normalized;
};

export const getTeacherPlanningPdfEntitlementKey = ({ academicYear, term, subject }) => {
  const normalizedYear = Number(academicYear);
  const normalizedTerm = String(term ?? '').trim();
  const normalizedSubject = String(subject ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

  if (!Number.isInteger(normalizedYear) || normalizedYear < 2000 || normalizedYear > 2200) {
    throw new Error('Academic year must be between 2000 and 2200.');
  }
  if (!['Term 1', 'Term 2', 'Term 3'].includes(normalizedTerm)) {
    throw new Error('Select a valid term.');
  }
  if (!normalizedSubject || normalizedSubject.length > 120) {
    throw new Error('Select a valid subject.');
  }

  return crypto
    .createHash('sha256')
    .update(JSON.stringify([normalizedYear, normalizedTerm, normalizedSubject]))
    .digest('hex');
};

export const getSubscriptionAmount = (plan, env = process.env) => {
  const normalizedPlan = String(plan || '').trim().toLowerCase();
  if (!SCHOOL_PLANS.includes(normalizedPlan) || normalizedPlan === 'basic') {
    throw new Error('Choose a paid school plan: standard or premium.');
  }

  const rawAmount = env[PLAN_PRICE_ENV_KEYS[normalizedPlan]];
  const amount = Number(rawAmount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Subscription pricing is not configured for the ${normalizedPlan} plan.`);
  }

  return amount;
};

export const getSubscriptionDurationDays = (env = process.env) => {
  const durationDays = Number(env.MPESA_STK_SUBSCRIPTION_DURATION_DAYS);
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    throw new Error('Subscription duration is not configured.');
  }

  return durationDays;
};

export const parseStkCallback = (payload) => {
  const callback = payload?.Body?.stkCallback;
  if (!callback || !callback.CheckoutRequestID || callback.ResultCode === undefined) {
    throw new Error('Invalid STK callback payload.');
  }
  const resultCode = Number(callback.ResultCode);
  if (!Number.isInteger(resultCode)) {
    throw new Error('Invalid STK callback result code.');
  }

  const metadata = Object.fromEntries(
    (callback.CallbackMetadata?.Item || [])
      .filter((item) => item?.Name)
      .map((item) => [item.Name, item.Value])
  );

  return {
    merchantRequestId: callback.MerchantRequestID || null,
    checkoutRequestId: String(callback.CheckoutRequestID),
    resultCode,
    resultDescription: String(callback.ResultDesc || ''),
    amount: metadata.Amount === undefined ? null : Number(metadata.Amount),
    receiptNumber: metadata.MpesaReceiptNumber ? String(metadata.MpesaReceiptNumber) : null,
    phoneNumber: metadata.PhoneNumber ? String(metadata.PhoneNumber) : null
  };
};

export const isSuccessfulStkCallback = (callback) => callback.resultCode === 0;
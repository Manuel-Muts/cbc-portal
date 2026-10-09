import axios from 'axios';
import { normalizeKenyanPhoneNumber } from './stkPaymentHelpers.js';

const DARAJA_ENDPOINTS = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke'
};

export const formatDarajaTimestamp = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
};

export const resolveDarajaSettings = (env = process.env) => {
  const environment = String(env.MPESA_ENV || 'sandbox').trim().toLowerCase();
  const baseUrl = DARAJA_ENDPOINTS[environment];
  if (!baseUrl) throw new Error('MPESA_ENV must be sandbox or production.');

  const consumerKey = String(env.MPESA_CONSUMER_KEY || env.DARAJA_CONSUMER_KEY || '').trim();
  const consumerSecret = String(env.MPESA_CONSUMER_SECRET || env.DARAJA_CONSUMER_SECRET || '').trim();
  const shortCode = String(env.MPESA_SHORT_CODE || '').trim();
  const passkey = String(env.MPESA_PASSKEY || '').trim();
  const callbackUrlValue = String(env.MPESA_STK_CALLBACK_URL || '').trim();
  const callbackToken = String(env.MPESA_STK_CALLBACK_TOKEN || '').trim();

  const missingCredentials = [];
  if (!consumerKey) missingCredentials.push('DARAJA_CONSUMER_KEY (or MPESA_CONSUMER_KEY)');
  if (!consumerSecret) missingCredentials.push('DARAJA_CONSUMER_SECRET (or MPESA_CONSUMER_SECRET)');
  if (!shortCode) missingCredentials.push('MPESA_SHORT_CODE');
  if (!passkey) missingCredentials.push('MPESA_PASSKEY');
  if (missingCredentials.length) {
    throw new Error(`Daraja configuration missing: ${missingCredentials.join(', ')}.`);
  }
  if (!callbackUrlValue) throw new Error('Daraja configuration missing: MPESA_STK_CALLBACK_URL.');
  if (callbackToken.length < 32) {
    throw new Error('MPESA_STK_CALLBACK_TOKEN must be at least 32 characters.');
  }

  let callbackUrl;
  try {
    callbackUrl = new URL(callbackUrlValue);
  } catch {
    throw new Error('MPESA_STK_CALLBACK_URL must be a valid HTTPS URL.');
  }
  if (callbackUrl.protocol !== 'https:') {
    throw new Error('MPESA_STK_CALLBACK_URL must use HTTPS.');
  }
  callbackUrl.searchParams.set('token', callbackToken);

  return {
    environment,
    baseUrl,
    consumerKey,
    consumerSecret,
    shortCode,
    passkey,
    callbackUrl: callbackUrl.toString()
  };
};

export const buildDarajaStkRequest = ({
  shortCode,
  passkey,
  phoneNumber,
  amount,
  callbackUrl,
  accountReference,
  transactionDesc,
  timestamp = formatDarajaTimestamp()
}) => {
  const normalizedAmount = Number(amount);
  if (!Number.isInteger(normalizedAmount) || normalizedAmount < 1) {
    throw new Error('STK amount must be a positive whole number of Kenyan shillings.');
  }

  return {
    BusinessShortCode: String(shortCode),
    Password: Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64'),
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: normalizedAmount,
    PartyA: normalizeKenyanPhoneNumber(phoneNumber),
    PartyB: String(shortCode),
    PhoneNumber: normalizeKenyanPhoneNumber(phoneNumber),
    CallBackURL: callbackUrl,
    AccountReference: String(accountReference).slice(0, 12),
    TransactionDesc: String(transactionDesc).slice(0, 13)
  };
};

export const initiateDarajaStkPush = async ({ amount, phoneNumber, accountReference, transactionDesc }) => {
  const settings = resolveDarajaSettings();
  const authorization = Buffer.from(`${settings.consumerKey}:${settings.consumerSecret}`).toString('base64');
  let tokenResponse;
  try {
    tokenResponse = await axios.get(
      `${settings.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${authorization}` },
        timeout: 15000
      }
    );
  } catch (error) {
    error.darajaStage = 'oauth';
    throw error;
  }
  const accessToken = tokenResponse.data?.access_token;
  if (!accessToken) throw new Error('Daraja did not return an access token.');

  const request = buildDarajaStkRequest({
    shortCode: settings.shortCode,
    passkey: settings.passkey,
    phoneNumber,
    amount,
    callbackUrl: settings.callbackUrl,
    accountReference,
    transactionDesc
  });
  let response;
  try {
    response = await axios.post(
      `${settings.baseUrl}/mpesa/stkpush/v1/processrequest`,
      request,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 20000
      }
    );
  } catch (error) {
    error.darajaRequestSent = true;
    error.darajaStage = 'stk_push';
    throw error;
  }

  if (String(response.data?.ResponseCode) !== '0') {
    throw new Error(response.data?.ResponseDescription || 'Daraja rejected the STK Push request.');
  }

  if (!response.data?.MerchantRequestID || !response.data?.CheckoutRequestID) {
    throw new Error('Daraja response did not include checkout request identifiers.');
  }

  return {
    merchantRequestId: String(response.data.MerchantRequestID),
    checkoutRequestId: String(response.data.CheckoutRequestID),
    customerMessage: String(response.data.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.')
  };
};
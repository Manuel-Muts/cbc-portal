import assert from 'node:assert/strict';
import {
  buildDarajaStkRequest,
  formatDarajaTimestamp,
  resolveDarajaSettings
} from '../services/darajaStkService.js';

const timestamp = formatDarajaTimestamp(new Date('2026-10-05T12:00:00.000Z'));
assert.equal(timestamp, '20261005150000');

const request = buildDarajaStkRequest({
  shortCode: '123456',
  passkey: 'test-passkey',
  phoneNumber: '0712345678',
  amount: 500,
  callbackUrl: 'https://portal.example/api/stk-payments/callback?token=long-token',
  accountReference: 'SMS_ABC123456789',
  transactionDesc: 'SMS credits',
  timestamp
});

assert.equal(request.BusinessShortCode, '123456');
assert.equal(request.Amount, 500);
assert.equal(request.PartyA, '254712345678');
assert.equal(request.PhoneNumber, '254712345678');
assert.equal(request.AccountReference, 'SMS_ABC12345');
assert.equal(request.TransactionType, 'CustomerPayBillOnline');
assert.equal(request.Password, Buffer.from(`123456test-passkey${timestamp}`).toString('base64'));
assert.throws(() => buildDarajaStkRequest({ ...request, amount: 500.5 }), /positive whole number/);

const settings = resolveDarajaSettings({
  MPESA_ENV: 'sandbox',
  DARAJA_CONSUMER_KEY: 'key',
  DARAJA_CONSUMER_SECRET: 'secret',
  MPESA_SHORT_CODE: '123456',
  MPESA_PASSKEY: 'passkey',
  MPESA_STK_CALLBACK_URL: 'https://portal.example/api/stk-payments/callback',
  MPESA_STK_CALLBACK_TOKEN: 'a'.repeat(40)
});
assert.equal(settings.baseUrl, 'https://sandbox.safaricom.co.ke');
assert.equal(new URL(settings.callbackUrl).searchParams.get('token'), 'a'.repeat(40));
assert.throws(() => resolveDarajaSettings({}), /DARAJA_CONSUMER_KEY.*MPESA_SHORT_CODE.*MPESA_PASSKEY/);
assert.throws(() => resolveDarajaSettings({
  MPESA_CONSUMER_KEY: 'key',
  MPESA_CONSUMER_SECRET: 'secret',
  MPESA_SHORT_CODE: '123456',
  MPESA_PASSKEY: 'passkey',
  MPESA_STK_CALLBACK_URL: 'http://portal.example/callback',
  MPESA_STK_CALLBACK_TOKEN: 'a'.repeat(40)
}), /must use HTTPS/);

console.log('Daraja STK service tests passed');
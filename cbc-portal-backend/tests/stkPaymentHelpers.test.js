import assert from 'node:assert/strict';
import {
  getSubscriptionAmount,
  getSubscriptionDurationDays,
  getTeacherPlanningPdfEntitlementKey,
  isSuccessfulStkCallback,
  normalizeKenyanPhoneNumber,
  parseStkCallback
} from '../services/stkPaymentHelpers.js';

assert.equal(normalizeKenyanPhoneNumber('0712345678'), '254712345678');
assert.equal(normalizeKenyanPhoneNumber('+254 712 345 678'), '254712345678');
assert.throws(() => normalizeKenyanPhoneNumber('12345'), /valid Kenyan mobile number/);
assert.equal(
  getTeacherPlanningPdfEntitlementKey({
    academicYear: '2026',
    term: 'Term 2',
    subject: '  ENGLISH  '
  }),
  getTeacherPlanningPdfEntitlementKey({
    academicYear: 2026,
    term: 'Term 2',
    subject: 'English'
  })
);
assert.notEqual(
  getTeacherPlanningPdfEntitlementKey({
    academicYear: 2026,
    term: 'Term 2',
    subject: 'English'
  }),
  getTeacherPlanningPdfEntitlementKey({
    academicYear: 2026,
    term: 'Term 3',
    subject: 'English'
  })
);
assert.throws(() => getTeacherPlanningPdfEntitlementKey({
  academicYear: 2026,
  term: 'Term 4',
  subject: 'English'
}), /valid term/);
assert.throws(() => getTeacherPlanningPdfEntitlementKey({
  academicYear: 2026,
  term: 'Term 2',
  subject: ''
}), /valid subject/);

assert.equal(getSubscriptionAmount('standard', {
  MPESA_STK_SUBSCRIPTION_STANDARD_AMOUNT: '1500'
}), 1500);
assert.throws(() => getSubscriptionAmount('premium', {}), /pricing is not configured/);
assert.throws(() => getSubscriptionAmount('basic', {}), /paid school plan/);
assert.equal(getSubscriptionDurationDays({ MPESA_STK_SUBSCRIPTION_DURATION_DAYS: '365' }), 365);
assert.throws(() => getSubscriptionDurationDays({}), /duration is not configured/);

const success = parseStkCallback({
  Body: {
    stkCallback: {
      MerchantRequestID: 'merchant-request',
      CheckoutRequestID: 'checkout-request',
      ResultCode: 0,
      ResultDesc: 'Success',
      CallbackMetadata: {
        Item: [
          { Name: 'Amount', Value: 1500 },
          { Name: 'MpesaReceiptNumber', Value: 'QGH123ABC' },
          { Name: 'PhoneNumber', Value: 254712345678 }
        ]
      }
    }
  }
});

assert.equal(success.checkoutRequestId, 'checkout-request');
assert.equal(success.amount, 1500);
assert.equal(success.receiptNumber, 'QGH123ABC');
assert.equal(isSuccessfulStkCallback(success), true);

const cancelled = parseStkCallback({
  Body: {
    stkCallback: {
      CheckoutRequestID: 'cancelled-request',
      ResultCode: 1032,
      ResultDesc: 'Request cancelled by user'
    }
  }
});

assert.equal(isSuccessfulStkCallback(cancelled), false);
assert.throws(() => parseStkCallback({}), /Invalid STK callback payload/);
assert.throws(() => parseStkCallback({
  Body: { stkCallback: { CheckoutRequestID: 'bad-code', ResultCode: 'invalid' } }
}), /Invalid STK callback result code/);

console.log('STK payment helper tests passed');
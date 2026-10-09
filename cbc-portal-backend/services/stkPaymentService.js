import cache from '../utils/cacheManager.js';
import { School } from '../models/school.js';
import { User } from '../models/User.js';
import StkPayment from '../models/StkPayment.js';
import { getPlanFeatures } from '../utils/planAccess.js';
import {
  getSubscriptionAmount,
  getSubscriptionDurationDays,
  getTeacherPlanningPdfEntitlementKey,
  isSuccessfulStkCallback,
  normalizeKenyanPhoneNumber,
  parseStkCallback
} from './stkPaymentHelpers.js';
import { initiateDarajaStkPush, resolveDarajaSettings } from './darajaStkService.js';

const TEACHER_PLANNING_PDF_PRICE = 1;
const TEACHER_PLANNING_PDF_ATTEMPT_TIMEOUT_MS = 45_000;

const getPlanningPdfPaymentFields = ({ schoolId, initiatedBy, academicYear, term, subject }) => ({
  schoolId,
  initiatedBy,
  purpose: 'planning_pdf',
  purposeReference: getTeacherPlanningPdfEntitlementKey({ academicYear, term, subject })
});

export const hasTeacherPlanningPdfAccess = async (scope) => {
  const fields = getPlanningPdfPaymentFields(scope);
  return Boolean(await StkPayment.exists({ ...fields, status: 'paid' }));
};

export const getTeacherPlanningPdfPaymentStatus = async ({ paymentId, schoolId, initiatedBy }) => {
  const payment = await StkPayment.findOne({
    _id: paymentId,
    schoolId,
    initiatedBy,
    purpose: 'planning_pdf'
  }).select('status amount receiptNumber resultDescription createdAt attemptStartedAt paidAt checkoutRequestId merchantRequestId phoneNumber');
  if (!payment) return null;
  const currentPayment = await expirePendingPlanningPdfAttempt(payment);
  return {
    status: currentPayment.status,
    amount: currentPayment.amount,
    receiptNumber: currentPayment.receiptNumber,
    resultDescription: currentPayment.resultDescription,
    createdAt: currentPayment.createdAt,
    attemptStartedAt: currentPayment.attemptStartedAt || currentPayment.createdAt,
    paidAt: currentPayment.paidAt
  };
};

const getPlanningPdfPaymentResponse = (payment) => ({
  unlocked: false,
  reused: true,
  paymentId: String(payment._id),
  status: payment.status,
  amount: payment.amount,
  attemptStartedAt: payment.attemptStartedAt || payment.createdAt
});

const expirePendingPlanningPdfAttempt = async (payment) => {
  if (!payment || payment.status !== 'pending') return payment;

  const attemptStartedAt = payment.attemptStartedAt || payment.createdAt;
  if (Date.now() - new Date(attemptStartedAt).getTime() < TEACHER_PLANNING_PDF_ATTEMPT_TIMEOUT_MS) {
    return payment;
  }

  const attemptQuery = payment.attemptStartedAt
    ? { attemptStartedAt: payment.attemptStartedAt }
    : {
        $or: [
          { attemptStartedAt: { $exists: false } },
          { attemptStartedAt: null }
        ],
        createdAt: payment.createdAt
      };
  const previousCheckout = payment.checkoutRequestId ? {
    merchantRequestId: payment.merchantRequestId,
    checkoutRequestId: payment.checkoutRequestId,
    amount: payment.amount,
    phoneNumber: payment.phoneNumber,
    startedAt: attemptStartedAt,
    status: 'expired'
  } : null;

  const expiredPayment = await StkPayment.findOneAndUpdate(
    {
      _id: payment._id,
      status: 'pending',
      ...attemptQuery
    },
    {
      ...(previousCheckout ? { $push: { checkoutHistory: previousCheckout } } : {}),
      $set: {
        status: 'failed',
        merchantRequestId: null,
        checkoutRequestId: null,
        resultDescription: 'STK request expired after 45 seconds without confirmed payment.'
      }
    },
    { new: true, runValidators: true }
  );
  if (expiredPayment) return expiredPayment;
  return StkPayment.findById(payment._id);
};

export const startTeacherPlanningPdfStkPayment = async ({
  schoolId,
  initiatedBy,
  academicYear,
  term,
  subject,
  phoneNumber
}) => {
  const fields = getPlanningPdfPaymentFields({
    schoolId, initiatedBy, academicYear, term, subject
  });
  const paidPayment = await StkPayment.findOne({ ...fields, status: 'paid' }).select('_id').lean();
  if (paidPayment) return { unlocked: true };

  let payment = await StkPayment.findOne(fields);
  if (payment?.status === 'paid') return { unlocked: true };
  if (payment && ['processing', 'review'].includes(payment.status)) {
    return getPlanningPdfPaymentResponse(payment);
  }
  if (payment?.status === 'pending') {
    payment = await expirePendingPlanningPdfAttempt(payment);
    if (payment?.status === 'pending') return getPlanningPdfPaymentResponse(payment);
  }

  const teacher = await User.findOne({
    _id: initiatedBy,
    schoolId,
    role: { $in: ['teacher', 'classteacher'] }
  }).select('allocations').lean();
  if (!teacher) {
    const error = new Error('Teacher account not found for this school.');
    error.statusCode = 403;
    throw error;
  }

  const normalizedSubject = String(subject ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  const isAllocatedSubject = (teacher.allocations || []).some(allocation => (
    Array.isArray(allocation.subjects)
    && allocation.subjects.some(name => (
      String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en') === normalizedSubject
    ))
  ));
  if (!isAllocatedSubject) {
    const error = new Error('You can only unlock PDF downloads for a subject allocated to you.');
    error.statusCode = 403;
    throw error;
  }

  const normalizedPhoneNumber = normalizeKenyanPhoneNumber(phoneNumber);
  resolveDarajaSettings();

  let shouldInitiatePush = false;
  if (payment?.status === 'failed') {
    payment = await StkPayment.findOneAndUpdate(
      { _id: payment._id, status: 'failed' },
      {
        $set: {
          status: 'pending',
          attemptStartedAt: new Date(),
          amount: TEACHER_PLANNING_PDF_PRICE,
          phoneNumber: normalizedPhoneNumber,
          merchantRequestId: null,
          checkoutRequestId: null,
          receiptNumber: null,
          resultCode: null,
          resultDescription: null,
          paidAt: null
        }
      },
      { new: true, runValidators: true }
    );
    shouldInitiatePush = true;
    if (!payment) {
      payment = await StkPayment.findOne(fields);
      if (payment) return getPlanningPdfPaymentResponse(payment);
    }
  } else if (!payment) {
    try {
      payment = await StkPayment.create({
        ...fields,
        attemptStartedAt: new Date(),
        amount: TEACHER_PLANNING_PDF_PRICE,
        phoneNumber: normalizedPhoneNumber
      });
      shouldInitiatePush = true;
    } catch (error) {
      if (error.code !== 11000) throw error;
      payment = await StkPayment.findOne(fields);
      if (!payment) throw error;
      if (payment.status === 'paid') return { unlocked: true };
      return getPlanningPdfPaymentResponse(payment);
    }
  }
  if (!payment) throw new Error('Could not prepare the planning PDF payment.');
  if (!shouldInitiatePush) return getPlanningPdfPaymentResponse(payment);

  try {
    const checkout = await initiateDarajaStkPush({
      amount: TEACHER_PLANNING_PDF_PRICE,
      phoneNumber: payment.phoneNumber,
      accountReference: `PDF${String(schoolId).slice(-9)}`,
      transactionDesc: 'Planning PDF'
    });
    let attachedPayment;
    try {
      attachedPayment = await attachStkCheckout({
        paymentId: payment._id,
        attemptStartedAt: payment.attemptStartedAt,
        ...checkout
      });
    } catch (error) {
      error.darajaRequestSent = true;
      throw error;
    }
    if (!attachedPayment) {
      await StkPayment.updateOne(
        {
          _id: payment._id,
          status: 'pending',
          attemptStartedAt: payment.attemptStartedAt
        },
        { $set: { status: 'review', resultDescription: 'Could not attach the Daraja checkout identifiers.' } }
      );
      const error = new Error('The STK request was sent, but its checkout reference could not be saved. Contact support before retrying.');
      error.statusCode = 503;
      error.paymentId = String(payment._id);
      throw error;
    }
    return {
      ...getPlanningPdfPaymentResponse(attachedPayment),
      reused: false,
      attemptStartedAt: attachedPayment.attemptStartedAt,
      checkoutRequestId: attachedPayment.checkoutRequestId,
      customerMessage: checkout.customerMessage
    };
  } catch (error) {
    if (error.paymentId) throw error;
    await StkPayment.updateOne(
      {
        _id: payment._id,
        status: 'pending',
        attemptStartedAt: payment.attemptStartedAt
      },
      {
        $set: {
          status: error.darajaRequestSent && !error.response ? 'review' : 'failed',
          resultDescription: String(
            `${error.darajaStage ? `${error.darajaStage}: ` : ''}${error.response?.data?.errorMessage || error.message || 'Could not initiate STK payment.'}`
          ).slice(0, 500)
        }
      }
    );
    const initiationError = new Error(error.darajaRequestSent && !error.response
      ? 'The payment request may have reached M-Pesa. Check payment status before trying again.'
      : `${error.darajaStage === 'stk_push' ? 'Daraja STK Push failed: ' : error.darajaStage === 'oauth' ? 'Daraja OAuth failed: ' : ''}${error.response?.data?.errorMessage || error.message || 'Could not initiate STK payment.'}`);
    initiationError.statusCode = error.darajaRequestSent && !error.response ? 503 : 502;
    initiationError.paymentId = String(payment._id);
    throw initiationError;
  }
};

export const startSmsTopupStkPayment = async ({ schoolId, initiatedBy, amount, phoneNumber }) => {
  const normalizedAmount = Number(amount);
  if (!Number.isInteger(normalizedAmount) || normalizedAmount < 10) {
    throw new Error('SMS top-up amount must be a whole number of at least KES 10.');
  }
  resolveDarajaSettings();
  const normalizedPhoneNumber = normalizeKenyanPhoneNumber(phoneNumber);

  const payment = await StkPayment.create({
    schoolId,
    initiatedBy,
    purpose: 'sms_topup',
    amount: normalizedAmount,
    smsCredits: normalizedAmount,
    phoneNumber: normalizedPhoneNumber
  });

  try {
    const checkout = await initiateDarajaStkPush({
      amount: normalizedAmount,
      phoneNumber: payment.phoneNumber,
      accountReference: `SMS${String(schoolId).slice(-9)}`,
      transactionDesc: 'SMS credits'
    });
    let attachedPayment;
    try {
      attachedPayment = await attachStkCheckout({
        paymentId: payment._id,
        ...checkout
      });
    } catch (error) {
      error.darajaRequestSent = true;
      throw error;
    }
    if (!attachedPayment) {
      await StkPayment.updateOne(
        { _id: payment._id, status: 'pending' },
        { $set: { status: 'review', resultDescription: 'Could not attach the Daraja checkout identifiers.' } }
      );
      const error = new Error('The STK request was sent, but its checkout reference could not be saved. Contact support before retrying.');
      error.statusCode = 503;
      error.paymentId = String(payment._id);
      throw error;
    }

    return {
      paymentId: String(attachedPayment._id),
      checkoutRequestId: attachedPayment.checkoutRequestId,
      customerMessage: checkout.customerMessage
    };
  } catch (error) {
    if (error.paymentId) throw error;
    await StkPayment.updateOne(
      { _id: payment._id, status: 'pending' },
      {
        $set: {
          status: error.darajaRequestSent && !error.response ? 'review' : 'failed',
          resultDescription: String(
            `${error.darajaStage ? `${error.darajaStage}: ` : ''}${error.response?.data?.errorMessage || error.message || 'Could not initiate STK payment.'}`
          ).slice(0, 500)
        }
      }
    );
    const errorPrefix = error.darajaStage === 'stk_push' ? 'Daraja STK Push failed: '
      : error.darajaStage === 'oauth' ? 'Daraja OAuth failed: '
        : '';
    const initiationError = new Error(error.darajaRequestSent && !error.response
      ? 'The payment request may have reached M-Pesa, but confirmation was not received. Check payment status before retrying.'
      : `${errorPrefix}${error.response?.data?.errorMessage || error.message || 'Could not initiate STK payment.'}`);
    initiationError.statusCode = error.darajaRequestSent && !error.response ? 503 : 502;
    initiationError.paymentId = String(payment._id);
    throw initiationError;
  }
};

export const createSubscriptionStkPayment = async ({ schoolId, initiatedBy, plan, phoneNumber }) => {
  const normalizedPlan = String(plan || '').trim().toLowerCase();
  const amount = getSubscriptionAmount(normalizedPlan);
  const durationDays = getSubscriptionDurationDays();

  return StkPayment.create({
    schoolId,
    initiatedBy,
    purpose: 'subscription',
    plan: normalizedPlan,
    amount,
    durationDays,
    phoneNumber: normalizeKenyanPhoneNumber(phoneNumber)
  });
};

export const attachStkCheckout = async ({ paymentId, attemptStartedAt, merchantRequestId, checkoutRequestId }) => {
  if (!merchantRequestId || !checkoutRequestId) {
    throw new Error('The STK provider response is missing request identifiers.');
  }

  return StkPayment.findOneAndUpdate(
    {
      _id: paymentId,
      status: 'pending',
      checkoutRequestId: null,
      ...(attemptStartedAt ? { attemptStartedAt } : {})
    },
    { $set: { merchantRequestId, checkoutRequestId } },
    { new: true, runValidators: true }
  );
};

export const processStkCallback = async (payload) => {
  const callback = parseStkCallback(payload);
  let payment = await StkPayment.findOne({ checkoutRequestId: callback.checkoutRequestId });
  let historicalAttempt = null;
  if (!payment) {
    payment = await StkPayment.findOne({
      'checkoutHistory.checkoutRequestId': callback.checkoutRequestId
    });
    historicalAttempt = payment?.checkoutHistory.find(
      attempt => attempt.checkoutRequestId === callback.checkoutRequestId
    ) || null;
  }

  if (!payment) return { outcome: 'unknown' };
  if (historicalAttempt) {
    if (historicalAttempt.status !== 'expired') {
      return { outcome: 'duplicate', status: historicalAttempt.status };
    }

    const historySelector = {
      _id: payment._id,
      checkoutHistory: {
        $elemMatch: {
          checkoutRequestId: callback.checkoutRequestId,
          status: 'expired'
        }
      }
    };
    if (!isSuccessfulStkCallback(callback)) {
      await StkPayment.updateOne(historySelector, {
        $set: {
          'checkoutHistory.$.status': 'failed',
          'checkoutHistory.$.resultCode': callback.resultCode,
          'checkoutHistory.$.resultDescription': callback.resultDescription
        }
      });
      return { outcome: 'failed' };
    }

    if (
      callback.amount !== historicalAttempt.amount
      || !callback.receiptNumber
      || callback.phoneNumber !== historicalAttempt.phoneNumber
    ) {
      await StkPayment.updateOne(historySelector, {
        $set: {
          'checkoutHistory.$.status': 'review',
          'checkoutHistory.$.resultCode': callback.resultCode,
          'checkoutHistory.$.resultDescription': 'Successful callback did not match the expected payment details.'
        }
      });
      return { outcome: 'review' };
    }

    const claimedAttempt = await StkPayment.findOneAndUpdate(
      historySelector,
      {
        $set: {
          'checkoutHistory.$.status': 'processing',
          'checkoutHistory.$.resultCode': callback.resultCode
        }
      },
      { new: true }
    );
    if (!claimedAttempt) return { outcome: 'duplicate', status: historicalAttempt.status };

    await StkPayment.updateOne(
      {
        _id: payment._id,
        checkoutHistory: {
          $elemMatch: {
            checkoutRequestId: callback.checkoutRequestId,
            status: 'processing'
          }
        }
      },
      {
        $set: {
          status: 'paid',
          'checkoutHistory.$.status': 'paid',
          'checkoutHistory.$.resultDescription': callback.resultDescription,
          'checkoutHistory.$.receiptNumber': callback.receiptNumber,
          receiptNumber: callback.receiptNumber,
          resultCode: callback.resultCode,
          resultDescription: callback.resultDescription,
          paidAt: new Date()
        }
      }
    );
    return { outcome: 'paid', purpose: payment.purpose, late: true };
  }

  if (payment.status !== 'pending') return { outcome: 'duplicate', status: payment.status };

  if (!isSuccessfulStkCallback(callback)) {
    await StkPayment.updateOne(
      { _id: payment._id, status: 'pending' },
      {
        $set: {
          status: 'failed',
          resultCode: callback.resultCode,
          resultDescription: callback.resultDescription
        }
      }
    );
    return { outcome: 'failed' };
  }

  if (
    callback.amount !== payment.amount
    || !callback.receiptNumber
    || callback.phoneNumber !== payment.phoneNumber
  ) {
    await StkPayment.updateOne(
      { _id: payment._id, status: 'pending' },
      {
        $set: {
          status: 'review',
          resultCode: callback.resultCode,
          resultDescription: 'Successful callback did not match the expected payment details.'
        }
      }
    );
    return { outcome: 'review' };
  }

  const claimedPayment = await StkPayment.findOneAndUpdate(
    { _id: payment._id, status: 'pending' },
    { $set: { status: 'processing' } },
    { new: true }
  );
  if (!claimedPayment) return { outcome: 'duplicate', status: payment.status };

  if (!['subscription', 'sms_topup', 'planning_pdf'].includes(claimedPayment.purpose)) {
    await StkPayment.updateOne(
      { _id: payment._id, status: 'processing' },
      { $set: { status: 'review', resultDescription: 'Purchase fulfillment is not configured.' } }
    );
    return { outcome: 'review' };
  }

  try {
    if (claimedPayment.purpose === 'subscription') {
      const school = await School.findById(payment.schoolId);
      if (!school) throw new Error('The school associated with this payment no longer exists.');
      if (!Number.isInteger(claimedPayment.durationDays) || claimedPayment.durationDays <= 0) {
        throw new Error('Subscription duration is missing or invalid.');
      }

      const now = new Date();
      const currentExpiry = school.subscriptionExpiresAt && school.subscriptionExpiresAt > now
        ? school.subscriptionExpiresAt
        : now;
      school.plan = claimedPayment.plan;
      school.planFeatures = getPlanFeatures(claimedPayment.plan);
      school.subscriptionExpiresAt = new Date(
        currentExpiry.getTime() + claimedPayment.durationDays * 24 * 60 * 60 * 1000
      );
      await school.save();
      cache.clearByPattern(String(payment.schoolId));
    }

    if (claimedPayment.purpose === 'sms_topup') {
      if (!Number.isInteger(claimedPayment.smsCredits) || claimedPayment.smsCredits <= 0) {
        throw new Error('SMS credit amount is missing or invalid.');
      }
      const school = await School.findByIdAndUpdate(
        claimedPayment.schoolId,
        { $inc: { smsCredits: claimedPayment.smsCredits } },
        { new: true }
      );
      if (!school) throw new Error('The school associated with this top-up no longer exists.');
      cache.clearByPattern(String(claimedPayment.schoolId));
    }

    await StkPayment.updateOne(
      { _id: payment._id, status: 'processing' },
      {
        $set: {
          status: 'paid',
          merchantRequestId: callback.merchantRequestId || payment.merchantRequestId,
          receiptNumber: callback.receiptNumber,
          resultCode: callback.resultCode,
          resultDescription: callback.resultDescription,
          paidAt: new Date()
        }
      }
    );
  } catch (error) {
    await StkPayment.updateOne(
      { _id: payment._id, status: 'processing' },
      { $set: { status: 'review', resultDescription: String(error.message || 'Payment fulfillment failed.').slice(0, 500) } }
    );
    throw error;
    }

  return { outcome: 'paid', purpose: payment.purpose };
};

export const getStkPaymentStatus = async ({ paymentId, schoolId }) => StkPayment.findOne({
  _id: paymentId,
  schoolId
}).select('status purpose amount smsCredits receiptNumber resultDescription createdAt paidAt').lean();
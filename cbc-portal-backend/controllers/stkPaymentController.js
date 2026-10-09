import crypto from 'node:crypto';
import {
  getSubscriptionAmount,
  getSubscriptionDurationDays,
  normalizeKenyanPhoneNumber
} from '../services/stkPaymentHelpers.js';
import { processStkCallback } from '../services/stkPaymentService.js';
import {
  getStkPaymentStatus as findStkPaymentStatus,
  hasTeacherPlanningPdfAccess,
  getTeacherPlanningPdfPaymentStatus as findTeacherPlanningPdfPaymentStatus,
  startSmsTopupStkPayment,
  startTeacherPlanningPdfStkPayment
} from '../services/stkPaymentService.js';

const callbackResponse = (res) => res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
const isTeacher = (user) => ['teacher', 'classteacher'].includes(user?.role) && Boolean(user.schoolId);

export const getTeacherPlanningPdfAccess = async (req, res) => {
  if (!isTeacher(req.user)) {
    return res.status(403).json({ message: 'Teacher access required.' });
  }

  try {
    const unlocked = await hasTeacherPlanningPdfAccess({
      schoolId: req.user.schoolId,
      initiatedBy: req.user.id,
      academicYear: req.query?.academicYear,
      term: req.query?.term,
      subject: req.query?.subject
    });
    return res.json({ unlocked });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Invalid planning PDF entitlement request.' });
  }
};

export const initiateTeacherPlanningPdfStk = async (req, res) => {
  if (!isTeacher(req.user)) {
    return res.status(403).json({ message: 'Teacher access required.' });
  }

  try {
    const payment = await startTeacherPlanningPdfStkPayment({
      schoolId: req.user.schoolId,
      initiatedBy: req.user.id,
      academicYear: req.body?.academicYear,
      term: req.body?.term,
      subject: req.body?.subject,
      phoneNumber: req.body?.phoneNumber
    });
    return res.status(payment.unlocked ? 200 : 202).json({
      ...payment,
      ...(payment.unlocked
        ? { message: 'PDF downloads are already unlocked for this subject and term.' }
        : {
            message: payment.reused
              ? 'A payment request for this subject and term is already active.'
              : 'STK Push sent. Approve the KES 1 payment on your phone.'
          })
    });
  } catch (error) {
    const status = error.statusCode || (
      error.message.includes('Daraja configuration missing')
      || error.message.includes('callback URL')
      || error.message.includes('MPESA_STK_CALLBACK_TOKEN')
      || error.message.includes('MPESA_ENV')
        ? 503
        : 400
    );
    return res.status(status).json({
      ...(error.paymentId ? { paymentId: error.paymentId } : {}),
      message: error.message || 'Could not initiate the planning PDF payment.'
    });
  }
};

export const getTeacherPlanningPdfPaymentStatus = async (req, res) => {
  if (!isTeacher(req.user)) {
    return res.status(403).json({ message: 'Teacher access required.' });
  }

  try {
    const payment = await findTeacherPlanningPdfPaymentStatus({
      paymentId: req.params.paymentId,
      schoolId: req.user.schoolId,
      initiatedBy: req.user.id
    });
    if (!payment) return res.status(404).json({ message: 'Planning PDF payment not found.' });
    return res.json(payment);
  } catch {
    return res.status(400).json({ message: 'Invalid payment reference.' });
  }
};

export const initiateSmsStkTopup = async (req, res) => {
  if (req.user?.role !== 'admin' || !req.user.schoolId) {
    return res.status(403).json({ message: 'School admin access required.' });
  }

  try {
    const payment = await startSmsTopupStkPayment({
      schoolId: req.user.schoolId,
      initiatedBy: req.user.id,
      amount: req.body?.amount,
      phoneNumber: req.body?.phone
    });
    return res.status(202).json({
      ...payment,
      message: 'STK Push sent. Check the phone and enter the M-Pesa PIN.'
    });
  } catch (error) {
    const status = error.statusCode || (error.message.includes('Daraja configuration missing')
      || error.message.includes('callback URL')
      || error.message.includes('MPESA_STK_CALLBACK_TOKEN')
      || error.message.includes('MPESA_ENV')
      ? 503
      : 400);
    return res.status(status).json({
      ...(error.paymentId ? { paymentId: error.paymentId } : {}),
      message: error.message
    });
  }
};

export const getStkPaymentStatus = async (req, res) => {
  if (req.user?.role !== 'admin' || !req.user.schoolId) {
    return res.status(403).json({ message: 'School admin access required.' });
  }

  try {
    const payment = await findStkPaymentStatus({
      paymentId: req.params.paymentId,
      schoolId: req.user.schoolId
    });
    if (!payment) return res.status(404).json({ message: 'Payment not found.' });
    return res.json(payment);
  } catch (error) {
    return res.status(400).json({ message: 'Invalid payment reference.' });
  }
};

export const initiateSubscriptionStk = async (req, res) => {
  if (req.user?.role !== 'admin' || !req.user.schoolId) {
    return res.status(403).json({ message: 'School admin access required.' });
  }

  try {
    const plan = String(req.body?.plan || '').trim().toLowerCase();
    getSubscriptionAmount(plan);
    getSubscriptionDurationDays();
    normalizeKenyanPhoneNumber(req.body?.phoneNumber);

    return res.status(503).json({
      code: 'STK_PURPOSE_NOT_ENABLED',
      message: 'Subscription STK initiation is not enabled yet.'
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const handleStkCallback = async (req, res) => {
  const expectedToken = String(process.env.MPESA_STK_CALLBACK_TOKEN || '');
  const suppliedToken = String(req.query?.token || '');
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);

  if (!expectedToken || expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ message: 'Unauthorized STK callback.' });
  }

  try {
    const result = await processStkCallback(req.body);
    if (result.outcome === 'unknown') {
      console.warn('STK callback did not match a stored checkout request.');
    }
    return callbackResponse(res);
  } catch (error) {
    console.error('STK callback processing failed:', error.message);
    return res.status(500).json({ ResultCode: 1, ResultDesc: 'Callback processing failed.' });
  }
};
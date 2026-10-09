// controllers/mpesaController.js
import { User } from "../models/User.js";
import { School } from "../models/school.js";
import bcrypt from "bcryptjs";
import {
  createFinancePayment,
  createFinanceUnmatchedPayment,
  hasFinancePaymentReference
} from '../services/financeRepository.js';

export const createMpesaController = ({
  UserModel = User,
  SchoolModel = School,
  createPayment = createFinancePayment,
  createUnmatchedPayment = createFinanceUnmatchedPayment,
  hasPaymentReference = hasFinancePaymentReference,
  hashPassword = (...args) => bcrypt.hash(...args),
  logger = console
} = {}) => {
  const mpesaValidation = async (req, res) => {
    try {
      const paybill = String(req.body?.BusinessShortCode || '').trim();
      const accountReference = String(req.body?.BillRefNumber || '').trim().toLowerCase();
      const amount = Number(req.body?.TransAmount);
      if (!paybill || !accountReference || !Number.isFinite(amount) || amount <= 0) {
        return res.json({ ResultCode: 1, ResultDesc: 'Rejected' });
      }

      const school = await SchoolModel.findOne({ paybill, status: 'Active' });
      if (!school) {
        return res.json({ ResultCode: 1, ResultDesc: 'Rejected' });
      }

      const student = await UserModel.findOne({
        username: accountReference,
        role: 'student',
        schoolId: school._id
      });
      if (!student) {
        return res.json({ ResultCode: 1, ResultDesc: 'Rejected' });
      }

      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    } catch (error) {
      logger.error('MPESA VALIDATION ERROR:', error);
      return res.json({ ResultCode: 1, ResultDesc: 'Rejected' });
    }
  };

  const mpesaCallback = async (req, res) => {
    try {
      const callback = req.body;

      // Handle C2B callbacks only
      let amount, receipt, phone, accountReference, businessShortCode;

      if (callback.TransID) {
        // C2B CALLBACK (Manual Paybill Payment)
        amount = Number(callback.TransAmount);
        receipt = String(callback.TransID).trim();
        phone = String(callback.MSISDN || '').trim();
        accountReference = String(callback.BillRefNumber || '').trim().toLowerCase();
        businessShortCode = String(callback.BusinessShortCode || '').trim();
      } else {
        logger.log('Unknown callback format');
        return res.json({ ResultCode: 0 });
      }

      const school = await SchoolModel.findOne({
        paybill: businessShortCode,
        status: 'Active'
      });

      if (!school) {
        logger.log(`No school found with paybill: ${businessShortCode}`);
        return res.json({ ResultCode: 0 });
      }

      if (await hasPaymentReference(receipt)) {
        logger.log(`Payment ${receipt} already recorded`);
        return res.json({ ResultCode: 0 });
      }

      const student = await UserModel.findOne({
        username: accountReference,
        role: 'student',
        schoolId: school._id
      });

      if (!student) {
        await createUnmatchedPayment({
          schoolId: school._id,
          amount,
          reference: receipt,
          admission: accountReference,
          phone
        });
        logger.log(`Unmatched payment account reference: ${accountReference}`);
        return res.json({ ResultCode: 0 });
      }

      let recorder = await UserModel.findOne({ role: 'accounts', schoolId: school._id });
      if (!recorder) {
        try {
          const sysEmail = `mpesa-system+${school._id}@local`;
          const raw = Math.random().toString(36).slice(2, 10);
          const hashed = await hashPassword(raw, 10);
          const sysUser = new UserModel({
            name: `MPESA System - ${school.name}`,
            role: 'accounts',
            email: sysEmail,
            password: hashed,
            passwordMustChange: false,
            schoolId: school._id,
            createdAt: new Date()
          });
          await sysUser.save();
          recorder = sysUser;
          logger.log(`Created system accounts user for school ${school.name}`);
        } catch (error) {
          logger.error('Failed to create system accounts user:', error);
        }
      }

      const recordedById = recorder ? recorder._id : null;
      if (!recordedById) throw new Error('Could not assign a system accounts user to the M-Pesa payment.');

      await createPayment({
        studentId: student._id,
        schoolId: school._id,
        amount,
        method: 'mpesa',
        reference: receipt,
        term: getCurrentTerm(),
        academicYear: new Date().getFullYear(),
        recordedBy: recordedById,
        recordedByRole: 'system'
      });

      logger.log(`C2B Payment recorded: ${amount} KES for student ${student.name} (${accountReference}) at ${school.name}`);
      return res.json({ ResultCode: 0 });
    } catch (error) {
      logger.error('MPESA CALLBACK ERROR:', error);
      return res.json({ ResultCode: 0 });
    }
  };

  return { mpesaValidation, mpesaCallback };
};

const mpesaController = createMpesaController();

export const mpesaValidation = mpesaController.mpesaValidation;
export const mpesaCallback = mpesaController.mpesaCallback;

function getCurrentTerm() {
  const month = new Date().getMonth() + 1;
  if (month <= 4) return "Term 1";
  if (month <= 8) return "Term 2";
  return "Term 3";
}

import StudentEnrollment from "../models/StudentEnrollment.js";
import {
  getFinanceBalanceSummary,
  getFinanceFeeStructure,
  listFinancePayments,
  upsertFinanceBalanceSummary
} from './financeRepository.js';

export const buildBalanceSummaryForStudent = async ({ studentId, schoolId, academicYear, grade = null }) => {
  const studentGrade = grade || null;

  let fee = null;
  if (studentGrade) {
    fee = await getFinanceFeeStructure({
      schoolId,
      grade: studentGrade,
      academicYear
    });
  }

  if (!fee && studentGrade) {
    fee = await getFinanceFeeStructure({
      schoolId,
      grade: studentGrade
    });
  }

  const payments = await listFinancePayments({
    studentId,
    schoolId,
    academicYear: Number(academicYear)
  });

  const termPayments = {
    "Term 1": 0,
    "Term 2": 0,
    "Term 3": 0
  };

  payments.forEach((payment) => {
    if (termPayments[payment.term] !== undefined) {
      termPayments[payment.term] += Number(payment.amount || 0);
    }
  });

  const term1Fee = Number(fee?.term1Fee || 0);
  const term2Fee = Number(fee?.term2Fee || 0);
  const term3Fee = Number(fee?.term3Fee || 0);
  const totalFee = Number(fee?.totalFee || term1Fee + term2Fee + term3Fee);

  const term1Paid = Number(termPayments["Term 1"] || 0);
  const term2Paid = Number(termPayments["Term 2"] || 0);
  const term3Paid = Number(termPayments["Term 3"] || 0);
  const totalPaid = term1Paid + term2Paid + term3Paid;
  const broughtForwardAmount = payments.reduce((sum, payment) => {
    if (payment.method === "fund_transfer") {
      return sum + Number(payment.amount || 0);
    }
    return sum;
  }, 0);

  const summary = {
    studentId,
    schoolId,
    academicYear: Number(academicYear),
    grade: studentGrade,
    totalFee,
    totalPaid,
    balance: totalFee - totalPaid,
    term1Fee,
    term1Paid,
    term1Balance: term1Fee - term1Paid,
    term2Fee,
    term2Paid,
    term2Balance: term2Fee - term2Paid,
    term3Fee,
    term3Paid,
    term3Balance: term3Fee - term3Paid,
    broughtForwardAmount,
    lastRecomputedAt: new Date()
  };

  return upsertFinanceBalanceSummary(summary);
};

export const getOrCreateBalanceSummary = async ({ studentId, schoolId, academicYear, grade = null }) => {
  const year = Number(academicYear);
  const existing = await getFinanceBalanceSummary({ studentId, schoolId, academicYear: year });
  if (existing) return existing;

  return buildBalanceSummaryForStudent({ studentId, schoolId, academicYear: year, grade });
};

export const refreshBalanceSummaryForStudent = async ({ studentId, schoolId, academicYear, grade = null }) => {
  return buildBalanceSummaryForStudent({ studentId, schoolId, academicYear, grade });
};

export const resolveStudentGradeForBalance = async ({ studentId, schoolId, academicYear }) => {
  const enrollment = await StudentEnrollment.findOne({
    studentId,
    schoolId,
    academicYear: Number(academicYear),
    status: "active"
  }).select("grade").lean();

  return enrollment?.grade || null;
};

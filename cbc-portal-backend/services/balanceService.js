// services/balanceService.js
import { getFinanceFeeStructure, getFinancePaymentsByTerm } from './financeRepository.js';

export const calculateBalance = async (student, grade = null, academicYear = new Date().getFullYear()) => {
  const studentGrade = grade || student.grade;

  // Try exact match first
  let fee = await getFinanceFeeStructure({
    schoolId: student.schoolId,
    grade: studentGrade,
    academicYear
  });

  // Fallback: if not found for the academicYear, return the latest fee for the grade
  if (!fee) {
    fee = await getFinanceFeeStructure({
      schoolId: student.schoolId,
      grade: studentGrade
    });
  }

  const termPayments = await getFinancePaymentsByTerm({
    studentId: student._id,
    schoolId: student.schoolId,
    academicYear
  });

  const totalPaid = Object.values(termPayments).reduce((sum, amount) => sum + amount, 0);

  // Calculate term balances
  const termBalances = {
    term1: {
      fee: fee?.term1Fee || 0,
      paid: termPayments['Term 1'] || 0,
      balance: (fee?.term1Fee || 0) - (termPayments['Term 1'] || 0)
    },
    term2: {
      fee: fee?.term2Fee || 0,
      paid: termPayments['Term 2'] || 0,
      balance: (fee?.term2Fee || 0) - (termPayments['Term 2'] || 0)
    },
    term3: {
      fee: fee?.term3Fee || 0,
      paid: termPayments['Term 3'] || 0,
      balance: (fee?.term3Fee || 0) - (termPayments['Term 3'] || 0)
    }
  };

  const totalFee = fee?.totalFee || 0;

  return {
    totalFee,
    totalPaid,
    balance: totalFee - totalPaid,
    termBalances
  };
};

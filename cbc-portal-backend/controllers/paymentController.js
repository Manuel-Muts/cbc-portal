// controllers/paymentController.js
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Student } from "../models/RoleModels.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { calculateBalance } from "../services/balanceService.js";
import cache from "../utils/cacheManager.js";
import { buildGradeMatch, getFinanceEnrollmentStatusFilter } from "../utils/accountsQueryHelpers.js";
import {
  getOrCreateBalanceSummary,
  refreshBalanceSummaryForStudent,
  resolveStudentGradeForBalance
} from "../services/balanceSummaryService.js";
import {
  countFinancePayments,
  createFinancePayment,
  deleteFinanceFeeStructure,
  getFinanceFeeStructuresForSchool,
  getFinanceTotalsByStudent,
  getFinanceFeeNote,
  getFinanceFeeStructure,
  getFinanceCarryForwardSummary,
  hasActiveFinanceBroughtForward,
  listFinanceFeeStructures,
  listFinancePayments,
  reverseFinancePayment,
  updateFinanceFeeStructure,
  upsertFinanceFeeNote,
  upsertFinanceFeeStructure
} from '../services/financeRepository.js';

const invalidateSchoolFinanceCaches = (schoolId) => {
  cache.clearByPattern(String(schoolId));
  cache.clearByPattern('outstanding_');
};

export const recordPayment = async (req, res) => {
  try {
    const { admission, amount, method, reference, term, academicYear } = req.body;

    if (!admission || !amount || !method || !reference || !term) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (method === "fund_transfer") {
      const normalizedYear = Number(academicYear);
      const normalizedAmount = Number(amount);
      if (!Number.isInteger(normalizedYear) || normalizedYear < 2000) {
        return res.status(400).json({ message: "A valid academic year is required for a brought-forward balance." });
      }
      if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
        return res.status(400).json({ message: "A brought-forward balance must be a non-zero amount." });
      }
      if (!["Term 1", "Term 2", "Term 3"].includes(term)) {
        return res.status(400).json({ message: "Select a valid term for the brought-forward balance." });
      }
    }

    // 🔎 Find student (scoped to school)
    const student = await Student.findOne({
      admission: { $eq: admission, $type: "string" },
      schoolId: req.user.schoolId
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const currentYear = academicYear || new Date().getFullYear();

    // ---------------------------
    // DUPLICATE CHECK FOR B/F
    // ---------------------------
    if (method === "fund_transfer") {
      const existingBFs = await hasActiveFinanceBroughtForward({
        studentId: student._id,
        schoolId: req.user.schoolId,
        academicYear: currentYear,
      });
      if (existingBFs) {
        return res.status(400).json({ message: "A brought forward balance already exists for this student in this academic year." });
      }
    }

    // ---------------------------
    // HANDLE AUTO-ALLOCATION
    // ---------------------------
    if (term === "Auto") {
      // Get current grade for balance calculation
      let enrollment = await StudentEnrollment.findOne({
        studentId: student._id,
        academicYear: currentYear,
        status: 'active'
      });
      const grade = enrollment ? enrollment.grade : null;

      // Calculate current balances per term
      const balanceData = await calculateBalance(student, grade, currentYear);
      const { term1, term2, term3 } = balanceData.termBalances;

      let remainingAmount = Number(amount);
      const paymentsCreated = [];
      
      // Helper to process term payment
      const processTermPayment = async (termName, termBalance, suffix) => {
        if (remainingAmount <= 0) return;
        
        let payAmount = 0;
        // If there is a debt, pay it off first
        if (termBalance > 0) {
          payAmount = Math.min(remainingAmount, termBalance);
        } 
        // If this is the last term (Term 3) and we still have money, dump it here (creates surplus/negative balance)
        else if (termName === "Term 3" && remainingAmount > 0) {
          payAmount = remainingAmount;
        }

        // Special case: If we reached Term 3 and have remainder, assume payAmount = remainder
        if (termName === "Term 3" && remainingAmount > 0) payAmount = remainingAmount;

        if (payAmount > 0) {
          const p = await createFinancePayment({
            studentId: student._id,
            schoolId: req.user.schoolId,
            amount: payAmount,
            method,
            reference: `${reference}-${suffix}`, // Append suffix to avoid duplicate key error
            term: termName,
            academicYear: currentYear,
            recordedBy: req.user.id,
            recordedByRole: "accounts"
          });
          paymentsCreated.push(p);
          remainingAmount -= payAmount;
        }
      };

      // Execute sequentially
      await processTermPayment("Term 1", term1.balance, "T1");
      await processTermPayment("Term 2", term2.balance, "T2");
      await processTermPayment("Term 3", term3.balance, "T3"); // T3 absorbs any excess

      invalidateSchoolFinanceCaches(req.user.schoolId);
      await refreshBalanceSummaryForStudent({
        studentId: student._id,
        schoolId: req.user.schoolId,
        academicYear: currentYear,
        grade
      });

      return res.status(201).json({
        message: "Payment auto-allocated successfully",
        payments: paymentsCreated
      });
    }

    // ---------------------------
    // STANDARD SINGLE TERM PAYMENT
    // ---------------------------
    const grade = await resolveStudentGradeForBalance({
      studentId: student._id,
      schoolId: req.user.schoolId,
      academicYear: currentYear
    });

    const payment = await createFinancePayment({
      studentId: student._id,
      schoolId: req.user.schoolId,
      amount,
      method,
      reference,
      term,
      academicYear: currentYear,
      recordedBy: req.user.id,
      recordedByRole: "accounts"
    });

    invalidateSchoolFinanceCaches(req.user.schoolId);
    await refreshBalanceSummaryForStudent({
      studentId: student._id,
      schoolId: req.user.schoolId,
      academicYear: currentYear,
      grade
    });

    res.status(201).json({
      message: "Payment recorded successfully",
      payment
    });

  } catch (err) {
    console.error("Record Payment Error:", err);
    // Mongoose validation error
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message).join(' | ');
      return res.status(400).json({ message: `Payment validation failed: ${messages}` });
    }
    // Duplicate key (unique reference)
    if (err.code === '23505') {
      if (err.constraint === 'payments_one_active_carry_forward_idx') {
        return res.status(400).json({ message: 'A brought-forward balance already exists for this student in this academic year.' });
      }
      return res.status(400).json({ message: 'Payment reference already exists' });
    }

    res.status(500).json({ message: err.message });
  }
};

export const getStudentLedger = async (req, res) => {
  try {
    const { admission } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; // Default to 50 for ledger history
    const skip = (page - 1) * limit;

    const student = await Student.findOne({
      admission: { $eq: admission, $type: "string" },
      schoolId: req.user.schoolId
    }).select("name admission _id"); // Select only necessary fields

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const total = await countFinancePayments({ studentId: student._id });
    const totalPages = Math.ceil(total / limit);

    const payments = await listFinancePayments({ studentId: student._id, limit, offset: skip });

    res.json({
      student: {
        name: student.name,
        admission: student.admission
      },
      payments,
      total,
      totalPages,
      currentPage: page
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getCarryForwardSummary = async (req, res) => {
  try {
    if (!req.user?.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    }
    const academicYear = Number(req.query.academicYear);
    if (!Number.isInteger(academicYear) || academicYear < 2000) {
      return res.status(400).json({ message: 'A valid academicYear is required.' });
    }

    const cacheKey = `carry_forward_summary_${req.user.schoolId}_${academicYear}`;
    const cachedSummary = cache.get(cacheKey);
    if (cachedSummary) return res.json(cachedSummary);

    const summary = await getFinanceCarryForwardSummary({
      schoolId: req.user.schoolId,
      academicYear
    });
    cache.set(cacheKey, summary, 300);
    return res.json(summary);
  } catch (error) {
    console.error('Get carry-forward summary error:', error.code, error);
    return res.status(500).json({ message: error.message || 'Could not load carry-forward summary.' });
  }
};

export const getStudentFeeStatement = async (req, res) => {
  try {
    const { admission } = req.params;
    const academicYear = Number(req.query.academicYear) || new Date().getFullYear();
    const gradeFilter = req.query.grade || req.query.class || "";

    if (!admission) {
      return res.status(400).json({ message: "Admission is required" });
    }

    const cacheKey = `student-fee-statement_${req.user.schoolId}_${admission}_${academicYear}_${gradeFilter}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    const student = await Student.findOne({
      admission: { $eq: admission, $type: "string" },
      schoolId: req.user.schoolId
    }).select("name admission _id");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    let grade = gradeFilter || null;
    if (!grade) {
      const enrollment = await StudentEnrollment.findOne({
        studentId: student._id,
        schoolId: req.user.schoolId,
        academicYear,
        status: getFinanceEnrollmentStatusFilter(academicYear)
      }).select("grade").lean();
      grade = enrollment?.grade || null;
    }

    const balanceSummary = await getOrCreateBalanceSummary({
      studentId: student._id,
      schoolId: req.user.schoolId,
      academicYear,
      grade
    });

    const response = {
      student: {
        name: student.name,
        admission: student.admission
      },
      grade: grade || "Not Enrolled",
      academicYear,
      feeStructure: {
        term1Fee: balanceSummary.term1Fee,
        term2Fee: balanceSummary.term2Fee,
        term3Fee: balanceSummary.term3Fee,
        totalFee: balanceSummary.totalFee
      },
      payments: [],
      totals: {
        totalFee: balanceSummary.totalFee,
        totalPaid: balanceSummary.totalPaid,
        totalBalance: balanceSummary.balance,
        termPaid: {
          "Term 1": balanceSummary.term1Paid,
          "Term 2": balanceSummary.term2Paid,
          "Term 3": balanceSummary.term3Paid
        }
      }
    };

    // keep the original payment history list for the fee statement
    const payments = await listFinancePayments({
      studentId: student._id,
      schoolId: req.user.schoolId,
      academicYear,
    });

    response.payments = payments;

    cache.set(cacheKey, response, 60);
    res.json(response);
  } catch (err) {
    console.error("Get Student Fee Statement Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET MY FEE STRUCTURE (for student dashboard)
// ---------------------------
export const getMyFeeStructure = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) return res.status(400).json({ message: 'No school assigned' });

    const year = Number(req.query.academicYear) || new Date().getFullYear();

    // Historical requests use that year's retained enrollment rather than the token's current grade.
    const enrollment = await StudentEnrollment.findOne({
      studentId: req.user.id,
      schoolId: req.user.schoolId,
      academicYear: year,
      status: getFinanceEnrollmentStatusFilter(year)
    }).select('grade').lean();
    const grade = enrollment?.grade || (year === new Date().getFullYear() ? req.user.classGrade : null);

    if (!grade) return res.status(400).json({ message: 'Student grade not available' });

    // Read the fee structure and payment note concurrently after resolving the grade.
    const [fee, note] = await Promise.all([
      getFinanceFeeStructure({
        schoolId: req.user.schoolId,
        grade,
        academicYear: year
      }),
      getFinanceFeeNote({ schoolId: req.user.schoolId, academicYear: year })
    ]);

    if (!fee) {
      return res.status(404).json({
        message: `No fee structure posted for ${grade} in academic year ${year}`
      });
    }

    res.json({ 
      grade: fee.grade, 
      academicYear: fee.academicYear, 
      term1Fee: fee.term1Fee,
      term2Fee: fee.term2Fee,
      term3Fee: fee.term3Fee,
      totalFee: fee.totalFee,
      additionalInfo: note
    });
  } catch (err) {
    console.error('Get My Fee Structure Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GLOBAL FEE NOTES
// ---------------------------
export const getGlobalFeeNote = async (req, res) => {
  try {
    const { academicYear } = req.query;
    if (!academicYear) return res.status(400).json({ message: "Year required" });

    const note = await getFinanceFeeNote({ schoolId: req.user.schoolId, academicYear });
    res.json({ note });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const saveGlobalFeeNote = async (req, res) => {
  try {
    const { academicYear, note } = req.body;
    if (!academicYear) return res.status(400).json({ message: "Year required" });

    await upsertFinanceFeeNote({ schoolId: req.user.schoolId, academicYear, note });

    invalidateSchoolFinanceCaches(req.user.schoolId);
    res.json({ message: "Global fee instructions updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET MY BALANCE (for students)
// ---------------------------
export const getMyBalance = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) return res.status(400).json({ message: 'No school assigned' });

    const year = Number(req.query.academicYear) || new Date().getFullYear();

    const enrollment = await StudentEnrollment.findOne({
      studentId: req.user.id,
      schoolId: req.user.schoolId,
      academicYear: year,
      status: getFinanceEnrollmentStatusFilter(year)
    }).select('grade').lean();
    const grade = enrollment?.grade || (year === new Date().getFullYear() ? req.user.classGrade : null);

    const balanceSummary = await getOrCreateBalanceSummary({
      studentId: req.user.id,
      schoolId: req.user.schoolId,
      academicYear: year,
      grade
    });

    const balanceData = {
      totalFee: balanceSummary.totalFee,
      totalPaid: balanceSummary.totalPaid,
      balance: balanceSummary.balance,
      termBalances: {
        term1: {
          fee: balanceSummary.term1Fee,
          paid: balanceSummary.term1Paid,
          balance: balanceSummary.term1Balance
        },
        term2: {
          fee: balanceSummary.term2Fee,
          paid: balanceSummary.term2Paid,
          balance: balanceSummary.term2Balance
        },
        term3: {
          fee: balanceSummary.term3Fee,
          paid: balanceSummary.term3Paid,
          balance: balanceSummary.term3Balance
        }
      }
    };

    res.json(balanceData);
  } catch (err) {
    console.error('Get My Balance Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET MY PAYMENTS (for students)
// ---------------------------
export const getMyPayments = async (req, res) => {
  try {
    const year = Number(req.query.academicYear) || new Date().getFullYear();

    const payments = await listFinancePayments({
      studentId: req.user.id,
      schoolId: req.user.schoolId,
      academicYear: year,
    });

    res.json({
      payments
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// LIST FEE STRUCTURES FOR SCHOOL (accounts)
// ---------------------------
export const listSchoolFeeStructures = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) return res.status(400).json({ message: 'No school assigned' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const { total, fees } = await listFinanceFeeStructures({
      schoolId: req.user.schoolId,
      academicYear: req.query.academicYear,
      grade: req.query.grade,
      page,
      limit
    });

    res.json({
      data: fees,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('List Fee Structures Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// UPDATE FEE STRUCTURE (accounts)
// ---------------------------
export const updateFeeStructure = async (req, res) => {
  try {
    const { id } = req.params;
    const { grade, academicYear, term1Fee, term2Fee, term3Fee } = req.body;

    if (!id) return res.status(400).json({ message: 'Missing fee id' });
    if (!req.user || !req.user.schoolId) return res.status(400).json({ message: 'No school assigned' });

    const fs = await getFinanceFeeStructure({ id });
    if (!fs) return res.status(404).json({ message: 'Fee structure not found' });
    if (String(fs.schoolId) !== String(req.user.schoolId)) return res.status(403).json({ message: 'Not allowed' });

    const updatedFeeStructure = await updateFinanceFeeStructure({
      id,
      schoolId: req.user.schoolId,
      changes: { grade, academicYear, term1Fee, term2Fee, term3Fee }
    });
    invalidateSchoolFinanceCaches(req.user.schoolId);
    res.json({ message: 'Fee structure updated', feeStructure: updatedFeeStructure });
  } catch (err) {
    console.error('Update Fee Structure Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// DELETE FEE STRUCTURE (accounts)
// ---------------------------
export const deleteFeeStructure = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Missing fee id' });
    if (!req.user || !req.user.schoolId) return res.status(400).json({ message: 'No school assigned' });

    const fs = await getFinanceFeeStructure({ id });
    if (!fs) return res.status(404).json({ message: 'Fee structure not found' });
    if (String(fs.schoolId) !== String(req.user.schoolId)) return res.status(403).json({ message: 'Not allowed' });

    await deleteFinanceFeeStructure({ id, schoolId: req.user.schoolId });
    invalidateSchoolFinanceCaches(req.user.schoolId);
    res.json({ message: 'Fee structure deleted' });
  } catch (err) {
    console.error('Delete Fee Structure Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// REVERSE PAYMENT
// ---------------------------
export const reversePayment = async (req, res) => {
  try {
    const { paymentId, reason } = req.body;

    const result = await reverseFinancePayment({ paymentId, schoolId: req.user.schoolId, reason, reversedBy: req.user.id });
    if (result.status === 'not_found') return res.status(404).json({ message: 'Payment not found' });
    if (result.status === 'already_reversed') {
      return res.status(400).json({ message: "Payment has already been reversed" });
    }
    const payment = result.payment;

    invalidateSchoolFinanceCaches(req.user.schoolId);
    await refreshBalanceSummaryForStudent({
      studentId: payment.studentId,
      schoolId: req.user.schoolId,
      academicYear: payment.academicYear,
      grade: null
    });
    res.json({ message: "Payment reversed and removed from ledger successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET ALL STUDENT ACCOUNTS
// ---------------------------
export const getAllStudentAccounts = async (req, res) => {
  try {
    const queryForCache = { ...req.query };
    const requestedLimit = parseInt(req.query.limit, 10);
    if (requestedLimit <= 50 || Number.isNaN(requestedLimit)) delete queryForCache._t;
    const cacheKey = `accounts_${req.user.schoolId}_${JSON.stringify(queryForCache)}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) return res.json(cachedResult);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const search = String(req.query.search || '').trim();
    const gradeFilter = req.query.class || '';
    const academicYear = parseInt(req.query.academicYear, 10) || new Date().getFullYear();
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);
    const schoolUser = await User.findById(req.user.id).select('schoolId').populate('schoolId', 'schoolType');
    const schoolType = schoolUser?.schoolId?.schoolType || 'full';
    const gradeMatch = buildGradeMatch(schoolType, gradeFilter);
    const enrollmentQuery = {
      schoolId,
      academicYear,
      status: getFinanceEnrollmentStatusFilter(academicYear),
      ...(typeof gradeMatch === 'string' ? { grade: gradeMatch } : { grade: gradeMatch })
    };
    const enrollments = await StudentEnrollment.find(enrollmentQuery)
      .select('studentId grade')
      .lean();
    const studentIds = [...new Set(enrollments.map(enrollment => String(enrollment.studentId)))];
    if (!studentIds.length) {
      const emptyResponse = { accounts: [], total: 0, totalPages: 0, currentPage: page };
      cache.set(cacheKey, emptyResponse, 300);
      return res.json(emptyResponse);
    }

    const students = await Student.find({
      _id: { $in: studentIds },
      schoolId,
      role: 'student'
    }).select('name admission schoolId').lean();
    const enrollmentByStudent = new Map(enrollments.map(enrollment => [String(enrollment.studentId), enrollment]));
    const filteredStudents = students.filter(student => {
      if (!search) return true;
      const admission = String(student.admission || '');
      const name = String(student.name || '');
      return /^\d+$/.test(search)
        ? admission === search
        : name.toLowerCase().includes(search.toLowerCase()) || admission.toLowerCase().includes(search.toLowerCase());
    }).sort((left, right) => String(left.admission || '').localeCompare(String(right.admission || ''), undefined, { numeric: true }));

    const filteredIds = filteredStudents.map(student => String(student._id));
    const [feeStructures, paymentTotals] = await Promise.all([
      getFinanceFeeStructuresForSchool({ schoolId: req.user.schoolId, academicYear }),
      getFinanceTotalsByStudent({ studentIds: filteredIds, schoolId: req.user.schoolId, academicYear })
    ]);
    const feesByGrade = new Map(feeStructures.map(fee => [fee.grade, fee]));
    const accounts = filteredStudents.map(student => {
      const studentId = String(student._id);
      const enrollment = enrollmentByStudent.get(studentId);
      const fee = feesByGrade.get(enrollment?.grade) || {};
      const totals = paymentTotals.get(studentId) || { 'Term 1': 0, 'Term 2': 0, 'Term 3': 0, broughtForwardAmount: 0 };
      const term1Fee = Number(fee.term1Fee || 0);
      const term2Fee = Number(fee.term2Fee || 0);
      const term3Fee = Number(fee.term3Fee || 0);
      const term1Paid = Number(totals['Term 1'] || 0);
      const term2Paid = Number(totals['Term 2'] || 0);
      const term3Paid = Number(totals['Term 3'] || 0);
      const expected = Number(fee.totalFee || term1Fee + term2Fee + term3Fee);
      const paid = term1Paid + term2Paid + term3Paid;
      return {
        _id: student._id,
        name: student.name,
        admission: student.admission,
        schoolId: student.schoolId,
        grade: enrollment?.grade,
        expected,
        paid,
        balance: expected - paid,
        termBalances: {
          term1: { fee: term1Fee, paid: term1Paid, balance: term1Fee - term1Paid },
          term2: { fee: term2Fee, paid: term2Paid, balance: term2Fee - term2Paid },
          term3: { fee: term3Fee, paid: term3Paid, balance: term3Fee - term3Paid }
        },
        hasBroughtForward: Number(totals.broughtForwardAmount || 0) > 0,
        broughtForwardAmount: Number(totals.broughtForwardAmount || 0)
      };
    });
    const total = accounts.length;
    const responseData = {
      accounts: accounts.slice((page - 1) * limit, page * limit),
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    };
    cache.set(cacheKey, responseData, 300);
    return res.json(responseData);
  } catch (err) {
    console.error('Get All Student Accounts Error:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// UPSERT FEE STRUCTURE (accounts)
// ---------------------------
export const upsertFeeStructure = async (req, res) => {
  try {
    const { grade, academicYear, term1Fee, term2Fee, term3Fee } = req.body;

    if (!grade || !academicYear || term1Fee === undefined || term2Fee === undefined || term3Fee === undefined) {
      return res.status(400).json({ message: 'Missing required fields: grade, academicYear, term1Fee, term2Fee, term3Fee' });
    }

    if (!req.user || !req.user.schoolId) return res.status(400).json({ message: 'No school assigned' });

    const feeStructure = await upsertFinanceFeeStructure({
      schoolId: req.user.schoolId,
      grade,
      academicYear,
      term1Fee,
      term2Fee,
      term3Fee
    });

    invalidateSchoolFinanceCaches(req.user.schoolId);
    res.json({ message: 'Fee structure saved', feeStructure });
  } catch (err) {
    console.error('Upsert Fee Structure Error:', err);
    if (err.code === '23505') return res.status(400).json({ message: 'Fee structure already exists' });
    res.status(500).json({ message: err.message });
  }
};

// controllers/paymentController.js
import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import { User } from "../models/User.js";
import PaymentReversal from "../models/PaymentReversal.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { calculateBalance } from "../services/balanceService.js";
import FeeStructure from "../models/FeeStructure.js";
import Setting from "../models/Setting.js";
import cache from "../utils/simpleCache.js";

const escapeRegex = (text) => {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

export const recordPayment = async (req, res) => {
  try {
    const { admission, amount, method, reference, term, academicYear } = req.body;

    if (!admission || !amount || !method || !reference || !term) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // 🔎 Find student (scoped to school)
    const student = await User.findOne({
      admission,
      role: "student",
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
      const existingBFs = await Payment.find({
        studentId: student._id,
        academicYear: currentYear,
        method: "fund_transfer",
        isReversed: { $ne: true }
      });
      if (existingBFs.length > 0) {
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
          const p = await Payment.create({
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

      // Invalidate cache for this school
      cache.clearByPattern(req.user.schoolId);

      return res.status(201).json({
        message: "Payment auto-allocated successfully",
        payments: paymentsCreated
      });
    }

    // ---------------------------
    // STANDARD SINGLE TERM PAYMENT
    // ---------------------------
    const payment = await Payment.create({
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

    // Invalidate cache for this school
    cache.clearByPattern(req.user.schoolId);

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
    if (err.code === 11000) {
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

    const student = await User.findOne({
      admission,
      role: "student",
      schoolId: req.user.schoolId
    }).select("name admission _id"); // Select only necessary fields

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const total = await Payment.countDocuments({ studentId: student._id, isReversed: { $ne: true } });
    const totalPages = Math.ceil(total / limit);

    const payments = await Payment.find({
      studentId: student._id,
      isReversed: { $ne: true }
    }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean();

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

// ---------------------------
// GET MY FEE STRUCTURE (for student dashboard)
// ---------------------------
export const getMyFeeStructure = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) return res.status(400).json({ message: 'No school assigned' });

    const year = Number(req.query.academicYear) || new Date().getFullYear();

    // Resolve student's current grade via StudentEnrollment if available
    let grade = req.user.classGrade || null;
    if (!grade) {
      let enrollment = await StudentEnrollment.findOne({
        studentId: req.user.id,
        academicYear: year,
        status: 'active'
      }).select('grade');
      if (!enrollment) {
        // Fallback: use the latest enrollment
        enrollment = await StudentEnrollment.findOne({
          studentId: req.user.id
        }).sort({ academicYear: -1 }).select('grade');
      }
      grade = enrollment?.grade || null;
    }

    if (!grade) return res.status(400).json({ message: 'Student grade not available' });

    // Find fee structure for the exact academic year
    const fee = await FeeStructure.findOne({
      schoolId: req.user.schoolId,
      grade,
      academicYear: year
    }).select('grade academicYear term1Fee term2Fee term3Fee totalFee');

    if (!fee) return res.status(404).json({ message: 'Fee structure not found for the selected academic year' });

    // Fetch Global Fee Note for the year
    const noteKey = `fee_note_${req.user.schoolId}_${year}`;
    const noteSetting = await Setting.findOne({ key: noteKey }).select('value');

    res.json({ 
      grade: fee.grade, 
      academicYear: fee.academicYear, 
      term1Fee: fee.term1Fee,
      term2Fee: fee.term2Fee,
      term3Fee: fee.term3Fee,
      totalFee: fee.totalFee,
      additionalInfo: noteSetting ? noteSetting.value : ""
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

    const key = `fee_note_${req.user.schoolId}_${academicYear}`;
    const setting = await Setting.findOne({ key });
    res.json({ note: setting ? setting.value : "" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const saveGlobalFeeNote = async (req, res) => {
  try {
    const { academicYear, note } = req.body;
    if (!academicYear) return res.status(400).json({ message: "Year required" });

    const key = `fee_note_${req.user.schoolId}_${academicYear}`;
    await Setting.findOneAndUpdate(
      { key },
      { value: note, schoolId: req.user.schoolId },
      { upsert: true, new: true }
    );

    cache.clearByPattern(req.user.schoolId);
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

    // Resolve student's current grade via StudentEnrollment if available
    let grade = req.user.classGrade || null;
    if (!grade) {
      let enrollment = await StudentEnrollment.findOne({
        studentId: req.user.id,
        academicYear: year,
        status: 'active'
      }).select('grade');
      if (!enrollment) {
        // Fallback: use the latest enrollment
        enrollment = await StudentEnrollment.findOne({
          studentId: req.user.id
        }).sort({ academicYear: -1 }).select('grade');
      }
      grade = enrollment?.grade || null;
    }

    // Use the balance service to calculate balance even if grade is not available
    const balanceData = await calculateBalance(req.user, grade, year);

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

    const payments = await Payment.find({
      studentId: req.user.id,
      academicYear: year,
      schoolId: req.user.schoolId,
      isReversed: { $ne: true }
    }).sort({ createdAt: -1 });

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

    const query = { schoolId: req.user.schoolId };
    
    if (req.query.academicYear) query.academicYear = Number(req.query.academicYear);
    if (req.query.grade) query.grade = req.query.grade;

    const total = await FeeStructure.countDocuments(query);
    const fees = await FeeStructure.find(query)
      .sort({ academicYear: -1, grade: 1 })
      .select('grade academicYear term1Fee term2Fee term3Fee totalFee')
      .skip(skip)
      .limit(limit)
      .lean();

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

    const fs = await FeeStructure.findById(id);
    if (!fs) return res.status(404).json({ message: 'Fee structure not found' });
    if (String(fs.schoolId) !== String(req.user.schoolId)) return res.status(403).json({ message: 'Not allowed' });

    fs.grade = grade || fs.grade;
    fs.academicYear = academicYear ? Number(academicYear) : fs.academicYear;
    fs.term1Fee = term1Fee !== undefined ? Number(term1Fee) : fs.term1Fee;
    fs.term2Fee = term2Fee !== undefined ? Number(term2Fee) : fs.term2Fee;
    fs.term3Fee = term3Fee !== undefined ? Number(term3Fee) : fs.term3Fee;

    await fs.save();
    cache.clearByPattern(req.user.schoolId); // Invalidate cache
    res.json({ message: 'Fee structure updated', feeStructure: fs });
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

    const fs = await FeeStructure.findById(id);
    if (!fs) return res.status(404).json({ message: 'Fee structure not found' });
    if (String(fs.schoolId) !== String(req.user.schoolId)) return res.status(403).json({ message: 'Not allowed' });

    await FeeStructure.deleteOne({ _id: id });
    cache.clearByPattern(req.user.schoolId); // Invalidate cache
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

    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    if (payment.isReversed) {
      return res.status(400).json({ message: "Payment has already been reversed" });
    }

    await PaymentReversal.create({
      paymentId,
      reason,
      reversedBy: req.user.id,
      amount: payment.amount
    });

    // Mark original as reversed so it is ignored by balance and ledger queries
    payment.isReversed = true;
    await payment.save();

    cache.clearByPattern(req.user.schoolId); // Invalidate cache
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
    // Generate a unique cache key based on school and query params
    const cacheKey = `accounts_${req.user.schoolId}_${JSON.stringify(req.query)}`;
    const cachedResult = cache.get(cacheKey);
    
    if (cachedResult) {
      return res.json(cachedResult);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const gradeFilter = req.query.class || "";
    const academicYear = parseInt(req.query.academicYear) || new Date().getFullYear();
    const skip = (page - 1) * limit;

    // Aggregation Pipeline for efficient Filtering, Searching & Pagination
    const pipeline = [
      // 1. Match Active Enrollments for School/Year
      { 
        $match: {
          schoolId: new mongoose.Types.ObjectId(req.user.schoolId),
          academicYear: academicYear,
          status: "active",
          ...(gradeFilter ? { grade: gradeFilter } : {})
        }
      },
      // 2. Join Student Data
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student"
        }
      },
      { $unwind: "$student" },
      // 3. Match Student Role & Search Criteria (Multi-field search)
      {
        $match: {
          "student.role": "student",
          ...(search ? {
            $or: [
              { "student.name": { $regex: escapeRegex(search), $options: "i" } },
              { "student.admission": { $regex: escapeRegex(search), $options: "i" } }
            ]
          } : {})
        }
      },
      // 4. Facet for Total Count & Paginated Data
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { "student.admission": 1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: "$student._id",
                name: "$student.name",
                admission: "$student.admission",
                schoolId: "$student.schoolId",
                grade: "$grade" // Direct grade from enrollment
              }
            }
          ]
        }
      }
    ];

    const aggResult = await StudentEnrollment.aggregate(pipeline);
    const metadata = aggResult[0].metadata[0];
    const total = metadata ? metadata.total : 0;
    const students = aggResult[0].data;
    const totalPages = Math.ceil(total / limit);

    // Batch fetch data to avoid N+1 queries
    const studentIds = students.map(s => s._id);

    // 1. Batch fetch Payments & Fee Structures
    const allPagePayments = await Payment.find({
      studentId: { $in: studentIds },
      academicYear,
      isReversed: { $ne: true }
    }).select("studentId amount term method").lean();

    // Resolve enrollments map (using data already fetched in aggregation)
    const enrollmentMap = new Map();
    const gradesToFetch = new Set();

    students.forEach(s => {
      const sId = String(s._id);
      // Use the grade directly from the aggregation pipeline result
      enrollmentMap.set(sId, { grade: s.grade });
      gradesToFetch.add(s.grade);
    });

    const feeStructures = await FeeStructure.find({
      schoolId: req.user.schoolId,
      grade: { $in: Array.from(gradesToFetch) },
      academicYear
    }).lean();

    // 2. Map data in-memory (No DB calls inside loop)
    const accounts = students.map((student) => {
        const sId = String(student._id);
        const enrollment = enrollmentMap.get(sId);
        const sPayments = allPagePayments.filter(p => String(p.studentId) === sId);
        
        // Calculate Balance
        const fee = enrollment ? feeStructures.find(f => f.grade === enrollment.grade) : null;
        const term1Paid = sPayments.filter(p => p.term === 'Term 1').reduce((sum, p) => sum + p.amount, 0);
        const term2Paid = sPayments.filter(p => p.term === 'Term 2').reduce((sum, p) => sum + p.amount, 0);
        const term3Paid = sPayments.filter(p => p.term === 'Term 3').reduce((sum, p) => sum + p.amount, 0);
        const totalPaid = term1Paid + term2Paid + term3Paid;

        const t1Fee = fee?.term1Fee || 0;
        const t2Fee = fee?.term2Fee || 0;
        const t3Fee = fee?.term3Fee || 0;
        const totalFee = fee?.totalFee || 0;

        // Check for brought forward balance
        const broughtForwardPayment = sPayments.find(p => p.method === 'fund_transfer');

        return {
          studentId: student._id,
          admission: student.admission,
          className: enrollment ? enrollment.grade : "Not Enrolled",
          studentName: student.name,
          academicYear,
          expected: totalFee,
          paid: totalPaid,
          balance: totalFee - totalPaid,
          termBalances: {
            term1: { fee: t1Fee, paid: term1Paid, balance: t1Fee - term1Paid },
            term2: { fee: t2Fee, paid: term2Paid, balance: t2Fee - term2Paid },
            term3: { fee: t3Fee, paid: term3Paid, balance: t3Fee - term3Paid }
          },
          hasBroughtForward: !!broughtForwardPayment, // Add this flag
          broughtForwardAmount: broughtForwardPayment ? broughtForwardPayment.amount : 0 // Include amount
        };
    });

    const responseData = { accounts, total, totalPages, currentPage: page };
    cache.set(cacheKey, responseData, 60); // Cache for 60 seconds
    res.json(responseData);
  } catch (err) {
    console.error("Get All Student Accounts Error:", err);
    res.status(500).json({ message: err.message });
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

    const query = {
      schoolId: req.user.schoolId,
      grade,
      academicYear: Number(academicYear)
    };

    const totalFee = Number(term1Fee) + Number(term2Fee) + Number(term3Fee);

    const update = {
      term1Fee: Number(term1Fee),
      term2Fee: Number(term2Fee),
      term3Fee: Number(term3Fee),
      totalFee
    };

    const opts = { upsert: true, new: true, setDefaultsOnInsert: true };

    const fs = await FeeStructure.findOneAndUpdate(query, update, opts);

    cache.clearByPattern(req.user.schoolId); // Invalidate cache
    res.json({ message: 'Fee structure saved', feeStructure: fs });
  } catch (err) {
    console.error('Upsert Fee Structure Error:', err);
    if (err.code === 11000) return res.status(400).json({ message: 'Fee structure already exists' });
    res.status(500).json({ message: err.message });
  }
};

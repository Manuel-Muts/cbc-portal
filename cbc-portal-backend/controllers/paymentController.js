// controllers/paymentController.js
import Payment from "../models/Payment.js";
import { User } from "../models/User.js";
import PaymentReversal from "../models/PaymentReversal.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { calculateBalance } from "../services/balanceService.js";
import FeeStructure from "../models/FeeStructure.js";

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

    const payment = await Payment.create({
      studentId: student._id,
      schoolId: req.user.schoolId,
      amount,
      method,
      reference,
      term,
      academicYear: academicYear || new Date().getFullYear(),
      recordedBy: req.user.id,
      recordedByRole: "accounts"
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
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Payment reference already exists' });
    }

    res.status(500).json({ message: err.message });
  }
};

export const getStudentLedger = async (req, res) => {
  try {
    const { admission } = req.params;

    const student = await User.findOne({
      admission,
      role: "student",
      schoolId: req.user.schoolId
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const payments = await Payment.find({
      studentId: student._id
    }).sort({ createdAt: -1 });

    res.json({
      student: {
        name: student.name,
        admission: student.admission
      },
      payments
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

    res.json({ 
      grade: fee.grade, 
      academicYear: fee.academicYear, 
      term1Fee: fee.term1Fee,
      term2Fee: fee.term2Fee,
      term3Fee: fee.term3Fee,
      totalFee: fee.totalFee 
    });
  } catch (err) {
    console.error('Get My Fee Structure Error:', err);
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
      schoolId: req.user.schoolId
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

    const fees = await FeeStructure.find({ schoolId: req.user.schoolId }).sort({ academicYear: -1, grade: 1 }).select('grade academicYear term1Fee term2Fee term3Fee totalFee');
    res.json(fees);
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

    await PaymentReversal.create({
      paymentId,
      reason,
      reversedBy: req.user.id,
      amount: payment.amount
    });

    // 🔁 Record negative payment
    await Payment.create({
      studentId: payment.studentId,
      schoolId: payment.schoolId,
      amount: -payment.amount,
      method: "reversal",
      reference: `REV-${payment.reference}`,
      term: payment.term,
      academicYear: payment.academicYear,
      recordedBy: req.user.id,
      recordedByRole: "accounts"
    });

    res.json({ message: "Payment reversed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET ALL STUDENT ACCOUNTS
// ---------------------------
export const getAllStudentAccounts = async (req, res) => {
  try {
    const currentAcademicYear = new Date().getFullYear();

    const students = await User.find({
      role: "student",
      schoolId: req.user.schoolId
    }).select("name admission schoolId");

    const accounts = await Promise.all(
      students.map(async (student) => {
        // Get current enrollment for the student
        let enrollment = await StudentEnrollment.findOne({
          studentId: student._id,
          academicYear: currentAcademicYear,
          status: "active"
        }).select("grade");

        if (!enrollment) {
          // Fallback: use the latest enrollment
          enrollment = await StudentEnrollment.findOne({
            studentId: student._id
          }).sort({ academicYear: -1 }).select("grade");
        }

        const balanceData = enrollment ? await calculateBalance(student, enrollment.grade, currentAcademicYear) : {
          totalFee: 0,
          totalPaid: 0,
          balance: 0,
          termBalances: {
            term1: { fee: 0, paid: 0, balance: 0 },
            term2: { fee: 0, paid: 0, balance: 0 },
            term3: { fee: 0, paid: 0, balance: 0 }
          }
        };
        return {
          studentId: student._id,
          admission: student.admission,
          className: enrollment ? enrollment.grade : "Not Enrolled",
          studentName: student.name,
          expected: balanceData.totalFee,
          paid: balanceData.totalPaid,
          balance: balanceData.balance,
          termBalances: balanceData.termBalances
        };
      })
    );

    res.json(accounts);
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

    res.json({ message: 'Fee structure saved', feeStructure: fs });
  } catch (err) {
    console.error('Upsert Fee Structure Error:', err);
    if (err.code === 11000) return res.status(400).json({ message: 'Fee structure already exists' });
    res.status(500).json({ message: err.message });
  }
};

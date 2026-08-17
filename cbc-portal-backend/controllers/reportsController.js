// controllers/reportsController.js
import mongoose from "mongoose"; 
import FeeStructure from "../models/FeeStructure.js";
import { User } from "../models/User.js";
import { Student, Teacher } from "../models/RoleModels.js";
import { School } from "../models/school.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { calculateBalance } from "../services/balanceService.js";
import PDFDocument from 'pdfkit';
import axios from "axios"; // Import axios
import Payment from "../models/Payment.js";
import { Expense } from '../models/Expense.js';
import { PassThrough } from 'stream';
import cache from "../utils/cacheManager.js";
import { buildGradeMatch, getAllowedGradesForSchoolType } from "../utils/accountsQueryHelpers.js";

const getCurrentTerm = () => {
  const month = new Date().getMonth() + 1;
  if (month <= 4) return 'Term 1';
  if (month <= 8) return 'Term 2';
  return 'Term 3';
};

const getImageBase64FromUrl = async (url) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return `data:${response.headers['content-type']};base64,${Buffer.from(response.data).toString('base64')}`;
  } catch (error) {
    console.error(`Error fetching image from URL ${url}:`, error);
    return null;
  }
};

const formatClassLabel = (grade, stream) => {
  const normalizedGrade = grade ? String(grade).trim() : "Not Assigned";
  const normalizedStream = stream ? String(stream).trim().toUpperCase() : "";

  const gradeText = normalizedGrade.toUpperCase().startsWith("GRADE ")
    ? normalizedGrade
    : (normalizedGrade === "PG" || normalizedGrade === "PP1" || normalizedGrade === "PP2" || /^\d+$/.test(normalizedGrade)
      ? `Grade ${normalizedGrade}`
      : normalizedGrade);

  return normalizedStream ? `${gradeText}${normalizedStream}` : gradeText;
};

const sortGradesForDisplay = (grades = []) => {
  const gradeRank = (value) => {
    const normalized = String(value || "").trim().toUpperCase();

    if (normalized === "PG") return 0;
    if (normalized === "PP1") return 1;
    if (normalized === "PP2") return 2;

    const match = normalized.match(/^(?:GRADE\s*)?(\d{1,2})$/);
    if (match) return 3 + Number(match[1]);

    return 1000;
  };

  return [...grades].sort((a, b) => {
    const aRank = gradeRank(a);
    const bRank = gradeRank(b);

    if (aRank !== bRank) return aRank - bRank;

    return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
  });
};

export const generateFeeStructuresPDF = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    }

    // Get school info for header
    // Optimize: Fetch only the school name as requested
    const school = await School.findById(req.user.schoolId).select('name');
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    // Get all fee structures for the school
    const feeStructures = await FeeStructure.find({
      schoolId: req.user.schoolId
    }).sort({ academicYear: -1, grade: 1 });

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margin: 35,
      info: {
        Title: 'Fee Structures Report',
        Author: school.name || 'CBC Student Portal',
        Subject: 'School Fee Structures'
      }
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fee_structures_${new Date().toISOString().split('T')[0]}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add school header
    doc.fontSize(20).font('Helvetica-Bold').text(school.name || 'School Name', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(16).font('Helvetica-Bold').text('FEE STRUCTURES REPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'center' });
    doc.moveDown(2);

    if (feeStructures.length === 0) {
      doc.fontSize(12).text('No fee structures found.', { align: 'center' });
    } else {
      // Table setup - adjusted for portrait
      const colWidths = [50, 45, 75, 75, 75, 75]; // Grade, Year, Term1, Term2, Term3, Total
      const headers = ['Grade', 'A.Yr', 'Term 1 Fee', 'Term 2 Fee', 'Term 3 Fee', 'Total Fee'];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      
      // Save initial Y position for headers
      let currentY = doc.y;

      // Draw header
      doc.fontSize(10).font('Helvetica-Bold');
      let xPos = 50;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], xPos, currentY, { width: colWidths[i], align: 'center', height: 25 });
        xPos += colWidths[i];
      }

      // Header underline
      doc.moveTo(50, currentY + 20).lineTo(50 + tableWidth, currentY + 20).stroke();
      currentY += 30;

      // Data rows
      doc.font('Helvetica');
      let rowIndex = 0;

      for (const fee of feeStructures) {
        // Check if we need a new page
        if (currentY > 650) {
          doc.addPage();
          currentY = 50;
          
          // Redraw headers
          doc.fontSize(10).font('Helvetica-Bold');
          xPos = 50;
          for (let i = 0; i < headers.length; i++) {
            doc.text(headers[i], xPos, currentY, { width: colWidths[i], align: 'center', height: 25 });
            xPos += colWidths[i];
          }
          doc.moveTo(50, currentY + 20).lineTo(50 + tableWidth, currentY + 20).stroke();
          currentY += 30;
          rowIndex = 0;
        }

        // Alternate row background
        if (rowIndex % 2 === 1) {
          doc.rect(50, currentY - 2, tableWidth, 25).fill('#f9f9f9');
          doc.fillColor('black');
        }

        // Draw each cell
        doc.fontSize(8).font('Helvetica');
        xPos = 50;
        
        const cells = [
          fee.grade,
          fee.academicYear.toString(),
          `KES ${fee.term1Fee.toLocaleString()}`,
          `KES ${fee.term2Fee.toLocaleString()}`,
          `KES ${fee.term3Fee.toLocaleString()}`,
          `KES ${fee.totalFee.toLocaleString()}`
        ];

        for (let i = 0; i < cells.length; i++) {
          doc.text(cells[i], xPos, currentY, { width: colWidths[i], align: 'center', height: 25, ellipsis: false });
          xPos += colWidths[i];
        }

        // Draw row border
        doc.moveTo(50, currentY + 25).lineTo(50 + tableWidth, currentY + 25).stroke();

        currentY += 28;
        rowIndex++;
      }

    }

    doc.end();

  } catch (err) {
    console.error('Generate Fee Structures PDF Error:', err);
    res.status(500).json({ message: err.message });
  }
};

export const generateStudentFeesPDF = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    }

    // Get school info for header
    // Optimize: Fetch only required fields
    const school = await School.findById(req.user.schoolId).select('name'); // Refactored to fetch only name
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    // --- Fetch Headteacher Signature (once) ---
    let headteacherSignatureBase64 = null;
    if (school.headteacherSignatureUrl) {
      // headteacherSignatureBase64 = await getImageBase64FromUrl(school.headteacherSignatureUrl); // Removed as per request to fetch only name
    }
    const { class: classFilter, term } = req.query;
    const currentAcademicYear = new Date().getFullYear();

    // 🔎 Get active enrollments for the current year
    const enrollmentMatch = {
      schoolId: req.user.schoolId,
      academicYear: currentAcademicYear,
      status: "active"
    };
    if (classFilter) enrollmentMatch.grade = classFilter;

    const activeEnrollments = await StudentEnrollment.find(enrollmentMatch)
      .select('studentId grade')
      .lean();

    const activeStudentIds = activeEnrollments.map(e => e.studentId);

    // 1. Fetch Student details for active students only
    let students = await Student.find({
      _id: { $in: activeStudentIds },
      schoolId: req.user.schoolId
    }).select("name admission schoolId").lean();

    // 2. Batch Fetch all data needed for balance calculations to avoid N+1
    const studentIds = students.map(s => s._id);
    const [allPayments, allFeeStructures] = await Promise.all([
      Payment.find({
        studentId: { $in: studentIds },
        academicYear: currentAcademicYear,
        isReversed: { $ne: true }
      }).lean(),
      FeeStructure.find({
        schoolId: req.user.schoolId,
        academicYear: currentAcademicYear
      }).lean()
    ]);

    // 3. Process balance data in-memory
    const studentData = [];
    for (const student of students) {
        const sId = String(student._id);
        const enrollment = activeEnrollments.find(e => String(e.studentId) === sId);
        
        if (!enrollment) continue;

        const fee = allFeeStructures.find(f => f.grade === enrollment.grade) || { term1Fee: 0, term2Fee: 0, term3Fee: 0, totalFee: 0 };
        const sPayments = allPayments.filter(p => String(p.studentId) === sId);

        const termPaid = { "Term 1": 0, "Term 2": 0, "Term 3": 0 };
        sPayments.forEach(p => { if (termPaid[p.term] !== undefined) termPaid[p.term] += p.amount; });
        
        const totalPaid = sPayments.reduce((sum, p) => sum + p.amount, 0);
        const totalFee = fee.totalFee || 0;

        const balanceData = {
            totalFee,
            totalPaid,
            balance: totalFee - totalPaid,
            termBalances: {
              term1: { fee: fee.term1Fee || 0, paid: termPaid["Term 1"], balance: (fee.term1Fee || 0) - termPaid["Term 1"] },
              term2: { fee: fee.term2Fee || 0, paid: termPaid["Term 2"], balance: (fee.term2Fee || 0) - termPaid["Term 2"] },
              term3: { fee: fee.term3Fee || 0, paid: termPaid["Term 3"], balance: (fee.term3Fee || 0) - termPaid["Term 3"] }
            }
        };

        studentData.push({
          studentId: student._id,
          admission: student.admission,
          className: enrollment ? enrollment.grade : "Not Enrolled",
          studentName: student.name,
          expected: balanceData.totalFee,
          paid: balanceData.totalPaid,
          balance: balanceData.balance,
          termBalances: balanceData.termBalances
        });
    }

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margin: 30,
      layout: 'landscape',
      info: {
        Title: 'Student Fees Report',
        Author: school.name || 'CBC Student Portal',
        Subject: 'Student Fee Balances'
      }
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="student_fees_${new Date().toISOString().split('T')[0]}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add school header
    doc.fontSize(20).font('Helvetica-Bold').text(school.name || 'School Name', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(16).font('Helvetica-Bold').text('STUDENT FEES REPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Academic Year: ${currentAcademicYear} | Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'center' });
    if (classFilter) {
      doc.text(`Class Filter: ${classFilter}`, { align: 'center' });
    }
    doc.moveDown(2);

    // Helper to parse classLabel into grade and stream
    const parseClassLabel = (label) => {
      const match = label.match(/Grade\s*(\d+)([A-Z])?/i);
      if (match) {
        return { grade: match[1], stream: match[2] || null };
      }
      return { grade: label, stream: null }; // Fallback
    };

    // --- Fetch Class Teacher Signature (if classFilter is present) ---
    let classTeacherSignatureBase64 = null;
    let classTeacherName = null;
    if (classFilter) {
      const { grade: parsedGrade, stream: parsedStream } = parseClassLabel(classFilter);
      const classTeacher = await Teacher.findOne({
        schoolId: req.user.schoolId,
        assignedClass: parsedGrade,
        assignedStream: parsedStream,
        isClassTeacher: true
      }).select("name signatureUrl");
      if (classTeacher && classTeacher.signatureUrl) {
        classTeacherSignatureBase64 = await getImageBase64FromUrl(classTeacher.signatureUrl);
        classTeacherName = classTeacher.name;
      }
    }
    if (studentData.length === 0) {
      doc.fontSize(12).text('No students found.', { align: 'center' });
    } else {
      console.log(`Generating PDF for ${studentData.length} students`);
      
      const colWidths = [65, 60, 40, 38, 38, 38, 38, 38, 38, 38, 38, 38, 42, 42, 42];
      const headers = ['Student', 'Admission', 'Class', 'T1 Fee', 'T1 Paid', 'T1 Bal', 'T2 Fee', 'T2 Paid', 'T2 Bal', 'T3 Fee', 'T3 Paid', 'T3 Bal', 'Total Fee', 'Total Paid', 'Total Bal'];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      
      // Function to draw table headers
      function drawHeaders(yPos) {
        // Header row
        doc.fontSize(9).font('Helvetica-Bold');
        let xPos = 50;
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], xPos, yPos, { width: colWidths[i], align: 'center', height: 20 });
          xPos += colWidths[i];
        }

        // Header underline
        doc.moveTo(50, yPos + 18).lineTo(50 + tableWidth, yPos + 18).stroke();
        return yPos + 25; // Return position for data rows
      }

      // Draw initial headers
      let yPosition = drawHeaders(doc.y);

      // Data rows
      doc.font('Helvetica');
      let rowIndex = 0;

      try {
        console.log(`Starting to process ${studentData.length} students in PDF`);
        for (const student of studentData) {
          console.log(`Processing student: ${student.studentName}`);
          
          // Check if we need a new page (leave space for headers)
          if (yPosition > 420) {
            doc.addPage();
            yPosition = drawHeaders(50);
            rowIndex = 0; // Reset row index for new page
          }

          const colWidths = [70, 65, 45, 40, 40, 40, 40, 40, 40, 40, 40, 40, 45, 45, 45];

          // Alternate row background
          if (rowIndex % 2 === 1) {
            doc.rect(50, yPosition - 3, colWidths.reduce((a, b) => a + b, 0), 22).fill('#f9f9f9').stroke();
            doc.fillColor('black');
          }

          // Prepare row data
          const rowData = [
            student.studentName.substring(0, 18),
            student.admission,
            student.className,
            student.termBalances.term1.fee.toLocaleString(),
            student.termBalances.term1.paid.toLocaleString(),
            student.termBalances.term1.balance.toLocaleString(),
            student.termBalances.term2.fee.toLocaleString(),
            student.termBalances.term2.paid.toLocaleString(),
            student.termBalances.term2.balance.toLocaleString(),
            student.termBalances.term3.fee.toLocaleString(),
            student.termBalances.term3.paid.toLocaleString(),
            student.termBalances.term3.balance.toLocaleString(),
            student.expected.toLocaleString(),
            student.paid.toLocaleString(),
            student.balance.toLocaleString()
          ];

        // Draw each cell
          doc.fontSize(7).font('Helvetica');
          let xPos = 50;
          for (let i = 0; i < rowData.length; i++) {
            doc.text(rowData[i], xPos, yPosition, { width: colWidths[i], align: 'center', height: 20, ellipsis: false });
            xPos += colWidths[i];
          }

          // Draw row border
          const tableWidth = colWidths.reduce((a, b) => a + b, 0);
          doc.moveTo(50, yPosition + 20).lineTo(50 + tableWidth, yPosition + 20).stroke();

          yPosition += 23;
          rowIndex++;
        }
        console.log(`Finished processing students. Total processed: ${rowIndex}`);
      } catch (err) {
        console.error('Error generating student fees PDF rows:', err);
        // Continue with summary even if row generation fails
      }

      // --- Add Signatures to the last page ---
      doc.addPage(); // Ensure signatures are on a new page
      let signatureY = doc.y + 50; // Starting Y position for signatures

      // Headteacher Signature
      if (headteacherSignatureBase64) {
        doc.image(headteacherSignatureBase64, doc.page.width / 2 - 75, signatureY, { width: 150 });
        signatureY += 50; // Move down for text
        doc.fontSize(10).text('__________________________', doc.page.width / 2 - 75, signatureY, { align: 'center' });
        signatureY += 15;
        doc.fontSize(10).text('Headteacher/Principal Signature', doc.page.width / 2 - 75, signatureY, { align: 'center' });
        signatureY += 30;
      }

      // Class Teacher Signature
      if (classTeacherSignatureBase64) {
        doc.image(classTeacherSignatureBase64, doc.page.width / 2 - 75, signatureY, { width: 150 });
        signatureY += 50;
        doc.fontSize(10).text('__________________________', doc.page.width / 2 - 75, signatureY, { align: 'center' });
        signatureY += 15;
        doc.fontSize(10).text(`Class Teacher: ${classTeacherName || ''}`, doc.page.width / 2 - 75, signatureY, { align: 'center' });
      }


      // Summary section on new page
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text('SUMMARY', { align: 'center' });
      doc.moveDown(1);

      const totalExpected = studentData.reduce((sum, s) => sum + s.expected, 0);
      const totalPaid = studentData.reduce((sum, s) => sum + s.paid, 0);
      const totalBalance = studentData.reduce((sum, s) => sum + s.balance, 0);

      doc.fontSize(10).font('Helvetica');
      doc.text(`Total Students: ${studentData.length}`);
      doc.text(`Total Expected: KES ${totalExpected.toLocaleString()}`);
      doc.text(`Total Paid: KES ${totalPaid.toLocaleString()}`);
      doc.text(`Total Outstanding: KES ${totalBalance.toLocaleString()}`);
    }

    doc.end();

  } catch (err) {
    console.error('Generate Student Fees PDF Error:', err);
    res.status(500).json({ message: err.message });
  }
};

export const getOutstandingFees = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    }

    const school = await School.findById(req.user.schoolId).select('schoolType').lean();
    if (!school) return res.status(404).json({ message: 'School not found' });

    const { name, class: classFilter, academicYear, term: rawTerm, page: pageQuery, limit: limitQuery, sort } = req.query;
    const term = (rawTerm || getCurrentTerm()).trim();
    const schoolType = school.schoolType || 'full';
    const gradeMatch = buildGradeMatch(schoolType, classFilter);

    // Construct cache key (ignore '_t' for standard UI browsing)
    const queryForCache = { ...req.query };
    const limitQueryInt = parseInt(limitQuery, 10);
    if (limitQueryInt <= 50 || isNaN(limitQueryInt)) delete queryForCache._t;

    const cacheKey = `outstanding_${req.user.schoolId}_${schoolType}_${JSON.stringify(queryForCache)}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const page = parseInt(pageQuery) || 1;
    const limit = parseInt(limitQuery) || 10;
    const skip = (page - 1) * limit;
    const yearToUse = parseInt(academicYear) || new Date().getFullYear();
    const schoolIdObj = new mongoose.Types.ObjectId(req.user.schoolId);
    const CACHE_TTL_SECONDS = 300; // 🚀 Increased from 120s to 5 minutes - fees don't change frequently

    const matchStage = {
      schoolId: schoolIdObj,
      academicYear: yearToUse,
      status: "active",
      grade: gradeMatch
    };

    const isNumericSearch = name && /^\d+$/.test(name);
    const searchStage = name
      ? (isNumericSearch
        ? [{ $match: { "student.admission": name } }]
        : [{ $match: { $or: [{ "student.name": { $regex: name, $options: "i" } }, { "student.admission": { $regex: name, $options: "i" } }] } }])
      : [];

    const termFilterStage = (() => {
      if (!term) return null;
      const termKey = term.toLowerCase().replace(/\s+/g, '');
      const balancePath = `termBalances.${termKey}.balance`;
      return { $match: { [balancePath]: { $gt: 0 } } };
    })();

    const sortStage = (() => {
      if (!sort) return { $sort: { balance: -1 } };
      const [field, order] = sort.split('_');
      const direction = order === 'asc' ? 1 : -1;
      if (field === 'balance') return { $sort: { balance: direction } };
      if (field === 'name') return { $sort: { studentName: direction } };
      if (field === 'admission') return { $sort: { admission: direction } };
      return { $sort: { balance: -1 } };
    })();

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student',
          pipeline: [
            { $project: { _id: 1, name: 1, admission: 1 } } // 🚀 Select only needed fields
          ]
        }
      },
      { $unwind: '$student' },
      ...searchStage,
      {
        $lookup: {
          from: 'feestructures',
          let: { eGrade: '$grade' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$schoolId', schoolIdObj] },
                    { $eq: ['$academicYear', yearToUse] },
                    { $eq: ['$grade', '$$eGrade'] }
                  ]
                }
              }
            },
            { $project: { totalFee: 1, term1Fee: 1, term2Fee: 1, term3Fee: 1 } } // 🚀 Select only needed fields
          ],
          as: 'feeStructure'
        }
      },
      { $unwind: { path: '$feeStructure', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'payments',
          let: { studentId: '$studentId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$studentId', '$$studentId'] },
                    { $eq: ['$schoolId', schoolIdObj] },
                    { $eq: ['$academicYear', yearToUse] },
                    { $ne: ['$isReversed', true] }
                  ]
                }
              }
            },
            { $project: { term: 1, amount: 1 } }, // 🚀 Select only needed fields
            { $group: { _id: '$term', totalAmount: { $sum: '$amount' } } }
          ],
          as: 'paymentSummaries'
        }
      },
      {
        $project: {
          _id: '$student._id',
          studentId: '$student._id',
          studentName: '$student.name',
          admission: '$student.admission',
          className: {
            $cond: [
              { $ifNull: ['$stream', false] },
              { $concat: ['$grade', '$stream'] },
              '$grade'
            ]
          },
          expected: { $ifNull: ['$feeStructure.totalFee', 0] },
          term1Fee: { $ifNull: ['$feeStructure.term1Fee', 0] },
          term2Fee: { $ifNull: ['$feeStructure.term2Fee', 0] },
          term3Fee: { $ifNull: ['$feeStructure.term3Fee', 0] },
          term1Paid: {
            $reduce: {
              input: '$paymentSummaries',
              initialValue: 0,
              in: {
                $cond: [{ $eq: ['$$this._id', 'Term 1'] }, { $add: ['$$value', '$$this.totalAmount'] }, '$$value']
              }
            }
          },
          term2Paid: {
            $reduce: {
              input: '$paymentSummaries',
              initialValue: 0,
              in: {
                $cond: [{ $eq: ['$$this._id', 'Term 2'] }, { $add: ['$$value', '$$this.totalAmount'] }, '$$value']
              }
            }
          },
          term3Paid: {
            $reduce: {
              input: '$paymentSummaries',
              initialValue: 0,
              in: {
                $cond: [{ $eq: ['$$this._id', 'Term 3'] }, { $add: ['$$value', '$$this.totalAmount'] }, '$$value']
              }
            }
          }
        }
      },
      {
        $addFields: {
          totalPaid: { $add: ['$term1Paid', '$term2Paid', '$term3Paid'] },
          balance: { $subtract: ['$expected', { $add: ['$term1Paid', '$term2Paid', '$term3Paid'] }] },
          termBalances: {
            term1: {
              fee: '$term1Fee',
              paid: '$term1Paid',
              balance: { $subtract: ['$term1Fee', '$term1Paid'] }
            },
            term2: {
              fee: '$term2Fee',
              paid: '$term2Paid',
              balance: { $subtract: ['$term2Fee', '$term2Paid'] }
            },
            term3: {
              fee: '$term3Fee',
              paid: '$term3Paid',
              balance: { $subtract: ['$term3Fee', '$term3Paid'] }
            }
          }
        }
      }
    ];

    if (termFilterStage) pipeline.push(termFilterStage);
    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [sortStage, { $skip: skip }, { $limit: limit }]
      }
    });

    const aggregationResult = await StudentEnrollment.aggregate(pipeline).allowDiskUse(true);
    const metadata = aggregationResult[0]?.metadata?.[0] || { total: 0 };
    const students = aggregationResult[0]?.data || [];
    const total = metadata.total || 0;

    const response = {
      students,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalFilteredStudents: total
    };

    cache.set(cacheKey, response, CACHE_TTL_SECONDS); // 🚀 Use extended cache TTL
    res.json(response);
  } catch (err) {
    console.error('Get Outstanding Fees Error:', err);
    res.status(500).json({ message: err.message });
  }
};

export const generateOutstandingFeesPDF = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    } // Refactored to fetch only name

    // Get school info for header
    const school = await School.findById(req.user.schoolId).select('name');
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    // --- Fetch Headteacher Signature (once) ---
    let headteacherSignatureBase64 = null;
    if (school.headteacherSignatureUrl) {
      // headteacherSignatureBase64 = await getImageBase64FromUrl(school.headteacherSignatureUrl); // Removed as per request to fetch only name
    }
    const { name, class: classFilter, term } = req.query;
    const currentAcademicYear = new Date().getFullYear();

    // 🔎 Get active enrollments for the current year
    const enrollmentMatch = {
      schoolId: req.user.schoolId,
      academicYear: currentAcademicYear,
      status: "active"
    };
    if (classFilter) enrollmentMatch.grade = classFilter;

    const activeEnrollments = await StudentEnrollment.find(enrollmentMatch)
      .select('studentId grade stream')
      .lean();

    const activeStudentIds = activeEnrollments.map(e => e.studentId);

    // Get student details for active students only
    let students = await Student.find({
      _id: { $in: activeStudentIds },
      schoolId: req.user.schoolId
    }).select("name admission schoolId").lean();

    // Filter by name if specified
    if (name) {
      // 🆕 Smart filtering: exact match for numeric admission, substring for names
      const isNumericSearch = /^\d+$/.test(name);
      
      students = students.filter(s => {
        if (isNumericSearch) {
          // For numeric searches, match admission exactly
          return s.admission && s.admission.toString() === name;
        } else {
          // For text searches, use substring on both name and admission
          return s.name.toLowerCase().includes(name.toLowerCase()) || 
            (s.admission && s.admission.toLowerCase().includes(name.toLowerCase()));
        }
      });
    }

    if (students.length === 0) {
      // Return empty report immediately if no students
    }

    // 2. Batch Fetch Payments
    const payments = await Payment.find({
      studentId: { $in: students.map(s => s._id) },
      academicYear: currentAcademicYear,
      isReversed: { $ne: true }
    }).select("studentId amount term").lean();

    // 3. Batch Fetch Fee Structures
    const feeStructures = await FeeStructure.find({
      schoolId: req.user.schoolId,
      academicYear: currentAcademicYear
    }).lean();

    // 4. Process in Memory
    let studentData = students.map(student => {
      const sId = String(student._id);
      const enrollment = activeEnrollments.find(e => String(e.studentId) === sId);
      let balanceData;

      if (enrollment) {
        const fee = feeStructures.find(f => f.grade === enrollment.grade) || {};
        const sPayments = payments.filter(p => String(p.studentId) === sId);
        
        const termPaid = { "Term 1": 0, "Term 2": 0, "Term 3": 0 };
        sPayments.forEach(p => {
          if (termPaid[p.term] !== undefined) termPaid[p.term] += p.amount;
        });
        
        const totalPaid = Object.values(termPaid).reduce((a, b) => a + b, 0);
        const totalFee = fee.totalFee || 0;
        
        balanceData = {
          totalFee,
          totalPaid,
          balance: totalFee - totalPaid,
          termBalances: {
            term1: { fee: fee.term1Fee || 0, paid: termPaid["Term 1"], balance: (fee.term1Fee || 0) - termPaid["Term 1"] },
            term2: { fee: fee.term2Fee || 0, paid: termPaid["Term 2"], balance: (fee.term2Fee || 0) - termPaid["Term 2"] },
            term3: { fee: fee.term3Fee || 0, paid: termPaid["Term 3"], balance: (fee.term3Fee || 0) - termPaid["Term 3"] }
          }
        };
      } else {
        balanceData = {
          totalFee: 0, totalPaid: 0, balance: 0,
          termBalances: { term1: { fee: 0, paid: 0, balance: 0 }, term2: { fee: 0, paid: 0, balance: 0 }, term3: { fee: 0, paid: 0, balance: 0 } }
        };
      }

      let className = "Not Enrolled";
      if (enrollment) {
        className = enrollment.stream ? `${enrollment.grade}${enrollment.stream}` : enrollment.grade;
      }

      return {
        studentId: student._id,
        admission: student.admission,
        className: className,
        studentName: student.name,
        expected: balanceData.totalFee,
        paid: balanceData.totalPaid,
        balance: balanceData.balance,
        termBalances: balanceData.termBalances
      };
    });

    // Filter by class if specified
    if (classFilter) {
      studentData = studentData.filter(s => s.className === classFilter);
    }

    // Filter students with outstanding balance > 0
    let outstandingStudents = studentData.filter(s => s.balance > 0);

    // Filter by term if specified
    if (term) {
      const termKey = term.toLowerCase().replace(/\s+/g, '');
      outstandingStudents = outstandingStudents.filter(s => s.termBalances[termKey] && s.termBalances[termKey].balance > 0);
    }

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margin: 30,
      layout: 'landscape',
      info: {
        Title: 'Outstanding Fees Report',
        Author: school.name || 'CBC Student Portal',
        Subject: 'Outstanding Student Fee Balances'
      }
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="outstanding_fees_${new Date().toISOString().split('T')[0]}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add school header
    doc.fontSize(20).font('Helvetica-Bold').text(school.name || 'School Name', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(school.address || '', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold').text('OUTSTANDING FEES REPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Academic Year: ${currentAcademicYear} | Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'center' });
    if (classFilter) {
      doc.text(`Filtered by Class: ${classFilter}`, { align: 'center' });
    }
    if (term) {
      doc.text(`Filtered by Term: ${term}`, { align: 'center' });
    }
    if (name) {
      doc.text(`Filtered by Name: ${name}`, { align: 'center' });
    }
    doc.moveDown(2);

    // Helper to parse classLabel into grade and stream
    const parseClassLabel = (label) => {
      const match = label.match(/Grade\s*(\d+)([A-Z])?/i);
      if (match) {
        return { grade: match[1], stream: match[2] || null };
      }
      return { grade: label, stream: null }; // Fallback
    };

    // --- Fetch Class Teacher Signature (if classFilter is present) ---
    let classTeacherSignatureBase64 = null;
    let classTeacherName = null;
    if (classFilter) {
      const { grade: parsedGrade, stream: parsedStream } = parseClassLabel(classFilter);
      const classTeacher = await Teacher.findOne({
        schoolId: req.user.schoolId,
        assignedClass: parsedGrade,
        assignedStream: parsedStream,
        isClassTeacher: true
      }).select("name signatureUrl");
      if (classTeacher && classTeacher.signatureUrl) {
        classTeacherSignatureBase64 = await getImageBase64FromUrl(classTeacher.signatureUrl);
        classTeacherName = classTeacher.name;
      }
    }

    if (outstandingStudents.length === 0) {
      doc.fontSize(12).text('No students with outstanding fees found.', { align: 'center' });
    } else {
      // Function to draw table headers
      function drawHeaders(yPos) {
        // Optimized column widths for better fitting - landscape
        const colWidths = [45, 70, 40, 38, 38, 38, 38, 38, 38, 38, 38, 38, 40, 40, 40];
        const headers = ['Adm', 'Student Name', 'Class', 'T1 Fee', 'T1 Paid', 'T1 Bal', 'T2 Fee', 'T2 Paid', 'T2 Bal', 'T3 Fee', 'T3 Paid', 'T3 Bal', 'Tot Fee', 'Tot Paid', 'Tot Bal'];
        
        // Header row with consistent positioning
        doc.fontSize(9).font('Helvetica-Bold');
        let xPos = 50;
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], xPos, yPos, { width: colWidths[i], align: 'center', height: 20 });
          xPos += colWidths[i];
        }

        // Header underline
        doc.moveTo(50, yPos + 18).lineTo(50 + colWidths.reduce((a, b) => a + b, 0), yPos + 18).stroke();
        return yPos + 25; // Return position for data rows
      }

      // Draw initial headers
      // Data rows
      doc.font('Helvetica');
      let yPosition = drawHeaders(doc.y);
      let rowIndex = 0;

      try {
        for (const student of outstandingStudents) {
          // Check if we need a new page (leave space for headers)
          if (yPosition > 420) {
            doc.addPage();
            yPosition = drawHeaders(50);
            rowIndex = 0; // Reset row index for new page
          }

          // Match column widths with headers
          const colWidths = [50, 75, 45, 40, 40, 40, 40, 40, 40, 40, 40, 40, 45, 45, 45];

          // Alternate row background
          if (rowIndex % 2 === 1) {
            doc.rect(50, yPosition - 3, colWidths.reduce((a, b) => a + b, 0), 22).fill('#f9f9f9').stroke();
            doc.fillColor('black');
          }

          const termBalances = student.termBalances || {};
          const t1 = termBalances.term1 || { fee: 0, paid: 0, balance: 0 };
          const t2 = termBalances.term2 || { fee: 0, paid: 0, balance: 0 };
          const t3 = termBalances.term3 || { fee: 0, paid: 0, balance: 0 };

          // Prepare row data
          const rowData = [
            student.admission || '',
            (student.studentName || '').substring(0, 20),
            student.className || '',
            t1.fee.toLocaleString(),
            t1.paid.toLocaleString(),
            t1.balance.toLocaleString(),
            t2.fee.toLocaleString(),
            t2.paid.toLocaleString(),
            t2.balance.toLocaleString(),
            t3.fee.toLocaleString(),
            t3.paid.toLocaleString(),
            t3.balance.toLocaleString(),
            (student.expected || 0).toLocaleString(),
            (student.paid || 0).toLocaleString(),
            (student.balance || 0).toLocaleString()
          ];

          // Draw each cell with proper positioning
          doc.fontSize(7).font('Helvetica');
          let xPos = 50;
          for (let i = 0; i < rowData.length; i++) {
            doc.text(rowData[i], xPos, yPosition, { width: colWidths[i], align: 'center', height: 20 });
            xPos += colWidths[i];
          }

          // Draw row border
          const tableWidth = colWidths.reduce((a, b) => a + b, 0);
          doc.moveTo(50, yPosition + 20).lineTo(50 + tableWidth, yPosition + 20).stroke();

          yPosition += 23;
          rowIndex++;
        }
      } catch (err) {
        console.error('Error generating PDF rows:', err);
        // Continue with summary even if row generation fails
      }

      // --- Add Signatures to the last page ---
      doc.addPage(); // Ensure signatures are on a new page
      let signatureY = doc.y + 50; // Starting Y position for signatures

      // Headteacher Signature
      if (headteacherSignatureBase64) {
        doc.image(headteacherSignatureBase64, doc.page.width / 2 - 75, signatureY, { width: 150 });
        signatureY += 50; // Move down for text
        doc.fontSize(10).text('__________________________', doc.page.width / 2 - 75, signatureY, { align: 'center' });
        signatureY += 15;
        doc.fontSize(10).text('Headteacher/Principal Signature', doc.page.width / 2 - 75, signatureY, { align: 'center' });
        signatureY += 30;
      }

      // Class Teacher Signature
      if (classTeacherSignatureBase64) {
        doc.image(classTeacherSignatureBase64, doc.page.width / 2 - 75, signatureY, { width: 150 });
        signatureY += 50;
        doc.fontSize(10).text('__________________________', doc.page.width / 2 - 75, signatureY, { align: 'center' });
        signatureY += 15;
        doc.fontSize(10).text(`Class Teacher: ${classTeacherName || ''}`, doc.page.width / 2 - 75, signatureY, { align: 'center' });
      }

      // Summary
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text('SUMMARY', { align: 'center' });
      doc.moveDown(1);

      const totalOutstanding = outstandingStudents.reduce((sum, s) => sum + s.balance, 0);
      const totalExpected = outstandingStudents.reduce((sum, s) => sum + s.expected, 0);
      const totalPaid = outstandingStudents.reduce((sum, s) => sum + s.paid, 0);

      doc.fontSize(12).font('Helvetica');
      doc.text(`Number of students with outstanding fees: ${outstandingStudents.length}`);
      doc.text(`Total expected fees: KES ${totalExpected.toLocaleString()}`);
      doc.text(`Total paid: KES ${totalPaid.toLocaleString()}`);
      doc.text(`Total outstanding: KES ${totalOutstanding.toLocaleString()}`, { bold: true });
    }

    doc.end();

  } catch (err) {
    console.error('Generate Outstanding Fees PDF Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Generate Outstanding Fees PDF from frontend data (POST)
export const generateOutstandingFeesPDFFromData = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    } // Refactored to fetch only name

    // Get school info for header
    const school = await School.findById(req.user.schoolId).select('name');
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    // --- Fetch Headteacher Signature (once) ---
    let headteacherSignatureBase64 = null;
    if (school.headteacherSignatureUrl) {
      // headteacherSignatureBase64 = await getImageBase64FromUrl(school.headteacherSignatureUrl); // Removed as per request to fetch only name
    }
    // Get the student data from request body (already filtered on frontend)
    const outstandingStudents = req.body || [];

    if (!Array.isArray(outstandingStudents)) {
      return res.status(400).json({ message: 'Invalid data format' });
    }

    console.log(`PDF Generation: Received ${outstandingStudents.length} students`);

    const currentAcademicYear = new Date().getFullYear();

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margin: 30,
      layout: 'landscape',
      info: {
        Title: 'Outstanding Fees Report',
        Author: school.name || 'CBC Student Portal',
        Subject: 'Outstanding Student Fee Balances'
      }
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="outstanding_fees_${new Date().toISOString().split('T')[0]}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add school header
    doc.fontSize(20).font('Helvetica-Bold').text(school.name || 'School Name', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(school.address || '', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold').text('OUTSTANDING FEES REPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Academic Year: ${currentAcademicYear} | Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'center' });
    doc.moveDown(2);

    // Helper to parse classLabel into grade and stream
    const parseClassLabel = (label) => {
      const match = label.match(/Grade\s*(\d+)([A-Z])?/i);
      if (match) {
        return { grade: match[1], stream: match[2] || null };
      }
      return { grade: label, stream: null }; // Fallback
    };

    // --- Fetch Class Teacher Signature (if a common class can be determined from students) ---
    let classTeacherSignatureBase64 = null;
    let classTeacherName = null;
    if (outstandingStudents.length > 0 && outstandingStudents[0].className) {
      const { grade: parsedGrade, stream: parsedStream } = parseClassLabel(outstandingStudents[0].className);
      const classTeacher = await Teacher.findOne({
        schoolId: req.user.schoolId,
        assignedClass: parsedGrade,
        assignedStream: parsedStream,
        isClassTeacher: true
      }).select("name signatureUrl");
      if (classTeacher && classTeacher.signatureUrl) {
        classTeacherSignatureBase64 = await getImageBase64FromUrl(classTeacher.signatureUrl);
        classTeacherName = classTeacher.name;
      }
    }
    if (outstandingStudents.length === 0) {
      doc.fontSize(12).text('No students with outstanding fees found.', { align: 'center' });
      doc.end();
      return;
    }

    // Optimized column widths for landscape layout
    const colWidths = [50, 75, 45, 38, 38, 38, 38, 38, 38, 38, 38, 38, 42, 42, 42];
    const headers = ['Adm', 'Student Name', 'Class', 'T1 Fee', 'T1 Paid', 'T1 Bal', 'T2 Fee', 'T2 Paid', 'T2 Bal', 'T3 Fee', 'T3 Paid', 'T3 Bal', 'Tot Fee', 'Tot Paid', 'Tot Bal'];
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);

    // Function to draw table headers
    function drawHeaders(yPos) {
      // Header row
      doc.fontSize(9).font('Helvetica-Bold');
      let xPos = 50;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], xPos, yPos, { width: colWidths[i], align: 'center', height: 18 });
        xPos += colWidths[i];
      }

      // Header underline
      doc.moveTo(50, yPos + 16).lineTo(50 + tableWidth, yPos + 16).stroke();
      return yPos + 22; // Return position for data rows
    }

    // Draw initial headers
    let yPosition = drawHeaders(doc.y);

    // Render data rows
    doc.font('Helvetica');
    let rowIndex = 0;

    console.log(`PDF Generation: Starting to render ${outstandingStudents.length} rows`);

    for (const student of outstandingStudents) {
      // Check if we need a new page (leave 60 points for headers and footer)
      if (yPosition > 480) {
        console.log(`PDF Generation: Adding new page at row ${rowIndex}`);
        doc.addPage();
        yPosition = drawHeaders(50);
      }

      // Alternate row background color
      if (rowIndex % 2 === 1) {
        doc.rect(50, yPosition - 2, tableWidth, 20).fill('#f5f5f5').stroke();
        doc.fillColor('black');
      }

      const termBalances = student.termBalances || {};
      const t1 = termBalances.term1 || { fee: 0, paid: 0, balance: 0 };
      const t2 = termBalances.term2 || { fee: 0, paid: 0, balance: 0 };
      const t3 = termBalances.term3 || { fee: 0, paid: 0, balance: 0 };

      // Prepare row data
      const rowData = [
        student.admission || '',
        (student.studentName || '').substring(0, 25),
        student.className || '',
        (t1.fee || 0).toLocaleString(),
        (t1.paid || 0).toLocaleString(),
        (t1.balance || 0).toLocaleString(),
        (t2.fee || 0).toLocaleString(),
        (t2.paid || 0).toLocaleString(),
        (t2.balance || 0).toLocaleString(),
        (t3.fee || 0).toLocaleString(),
        (t3.paid || 0).toLocaleString(),
        (t3.balance || 0).toLocaleString(),
        (student.expected || 0).toLocaleString(),
        (student.paid || 0).toLocaleString(),
        (student.balance || 0).toLocaleString()
      ];

      // Draw each cell with consistent positioning
      doc.fontSize(8).font('Helvetica');
      let xPos = 50;
      for (let i = 0; i < rowData.length; i++) {
        doc.text(rowData[i], xPos, yPosition, { width: colWidths[i], align: 'center', height: 18 });
        xPos += colWidths[i];
      }

      // Draw row border
      doc.moveTo(50, yPosition + 18).lineTo(50 + tableWidth, yPosition + 18).stroke();

      yPosition += 20;
      rowIndex++;
    }

    console.log(`PDF Generation: Completed rendering ${rowIndex} rows`);

    // --- Add Signatures to the last page ---
    doc.addPage(); // Ensure signatures are on a new page
    let signatureY = doc.y + 50; // Starting Y position for signatures

    // Headteacher Signature
    if (headteacherSignatureBase64) {
      doc.image(headteacherSignatureBase64, doc.page.width / 2 - 75, signatureY, { width: 150 });
      signatureY += 50; // Move down for text
      doc.fontSize(10).text('__________________________', doc.page.width / 2 - 75, signatureY, { align: 'center' });
      signatureY += 15;
      doc.fontSize(10).text('Headteacher/Principal Signature', doc.page.width / 2 - 75, signatureY, { align: 'center' });
      signatureY += 30;
    }

    // Class Teacher Signature
    if (classTeacherSignatureBase64) {
      doc.image(classTeacherSignatureBase64, doc.page.width / 2 - 75, signatureY, { width: 150 });
      signatureY += 50;
      doc.fontSize(10).text('__________________________', doc.page.width / 2 - 75, signatureY, { align: 'center' });
      signatureY += 15;
      doc.fontSize(10).text(`Class Teacher: ${classTeacherName || ''}`, doc.page.width / 2 - 75, signatureY, { align: 'center' });
    }

    // Summary page
    doc.addPage();
    doc.fontSize(14).font('Helvetica-Bold').text('SUMMARY', { align: 'center' });
    doc.moveDown(1);

    const totalOutstanding = outstandingStudents.reduce((sum, s) => sum + (s.balance || 0), 0);
    const totalExpected = outstandingStudents.reduce((sum, s) => sum + (s.expected || 0), 0);
    const totalPaid = outstandingStudents.reduce((sum, s) => sum + (s.paid || 0), 0);

    doc.fontSize(12).font('Helvetica');
    doc.text(`Number of students with outstanding fees: ${outstandingStudents.length}`);
    doc.text(`Total expected fees: KES ${totalExpected.toLocaleString()}`);
    doc.text(`Total paid: KES ${totalPaid.toLocaleString()}`);
    doc.text(`Total outstanding: KES ${totalOutstanding.toLocaleString()}`, { bold: true });

    doc.end();

  } catch (err) {
    console.error('Generate Outstanding Fees PDF Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET SCHOOL TOTALS (for expenses dashboard)
// ---------------------------
export const getSchoolTotals = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    }

    const academicYear = parseInt(req.query.academicYear) || new Date().getFullYear();
    const term = req.query.term;
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);

    // 🔎 Get school type to restrict grades
    const school = await School.findById(req.user.schoolId).select('schoolType').lean();
    if (!school) return res.status(404).json({ message: 'School not found' });
    const schoolType = school.schoolType || 'full';
    const gradeMatch = buildGradeMatch(schoolType, null);

    // 🔎 Get only active student IDs for this year and school type to filter income
    const enrollments = await StudentEnrollment.find({
      schoolId: schoolId,
      academicYear,
      status: "active",
      grade: gradeMatch
    }).select("studentId").lean();
    const activeStudentIds = enrollments.map(e => e.studentId);

    // This aggregation sums all successful payments for the specific school and year.
    // Restricted to active students only as per requirement.
    const totalPaidResult = await Payment.aggregate([
      { 
        $match: { 
          schoolId: schoolId, 
          academicYear: academicYear, 
          isReversed: { $ne: true },
          studentId: { $in: activeStudentIds },
          ...(term ? { term } : {})
        } 
      },
      { 
        $group: { 
          _id: null, 
          totalPaid: { $sum: '$amount' } 
        } 
      }
    ]);

    const totalPaid = totalPaidResult.length > 0 ? totalPaidResult[0].totalPaid : 0;

    res.json({ totalPaid });
  } catch (err) {
    console.error('Get School Totals Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET BALANCE SHEET SUMMARY
// ---------------------------
export const getBalanceSheet = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    }

    const academicYear = parseInt(req.query.academicYear) || new Date().getFullYear();
    const term = req.query.term?.trim();
    const category = req.query.category?.trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);

    const school = await School.findById(req.user.schoolId).select('schoolType').lean();
    if (!school) return res.status(404).json({ message: 'School not found' });

    const schoolType = school.schoolType || 'full';
    const gradeMatch = buildGradeMatch(schoolType, null);

    const enrollments = await StudentEnrollment.find({
      schoolId: schoolId,
      academicYear,
      status: 'active',
      grade: gradeMatch
    }).select('studentId').lean();

    const activeStudentIds = enrollments.map(e => e.studentId);

    const incomeMatch = {
      schoolId,
      academicYear,
      isReversed: { $ne: true },
      studentId: { $in: activeStudentIds }
    };
    if (term) incomeMatch.term = term;

    const totalIncomeResult = await Payment.aggregate([
      { $match: incomeMatch },
      { $group: { _id: null, totalIncome: { $sum: '$amount' } } }
    ]);

    const totalIncome = totalIncomeResult.length > 0 ? totalIncomeResult[0].totalIncome : 0;

    const expenseMatch = {
      schoolId,
      academicYear
    };
    if (term) expenseMatch.term = term;
    if (category) expenseMatch.category = category;

    const totalExpensesResult = await Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, totalExpenses: { $sum: '$amount' } } }
    ]);

    const totalExpenses = totalExpensesResult.length > 0 ? totalExpensesResult[0].totalExpenses : 0;
    const netCash = totalIncome - totalExpenses;

    const expenseCount = await Expense.countDocuments(expenseMatch);
    const expenses = await Expense.find(expenseMatch)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const categoryBreakdown = await Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]);

    res.json({
      academicYear,
      term: term || 'All Terms',
      category: category || 'All Categories',
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalCount: expenseCount,
        totalPages: Math.ceil(expenseCount / limit),
        hasNextPage: page * limit < expenseCount,
        hasPreviousPage: page > 1
      },
      totals: {
        totalIncome,
        totalExpenses,
        netCash
      },
      breakdown: {
        categories: categoryBreakdown
      },
      expenses
    });
  } catch (err) {
    console.error('Get Balance Sheet Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET SCHOOL OVERVIEW STATS (for accounts dashboard cards)
// ---------------------------
export const getSchoolOverviewStats = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    }

    const academicYear = parseInt(req.query.academicYear) || new Date().getFullYear();
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);
    const { grade, term } = req.query;

    // 🔎 Get school type to restrict grades if no specific class filter is provided
    const school = await School.findById(req.user.schoolId).select('schoolType').lean();
    if (!school) return res.status(404).json({ message: 'School not found' });
    const schoolType = school.schoolType || 'full';
    const gradeMatch = buildGradeMatch(schoolType, grade);

    // ---------------------------
    // 1. Get Enrolled Students
    // ---------------------------
    const enrollmentMatch = {
      schoolId: schoolId,
      academicYear,
      status: "active",
      grade: gradeMatch
    };

    const enrollments = await StudentEnrollment.find(enrollmentMatch)
      .select("studentId grade")
      .lean();

    const studentIds = enrollments.map(e => e.studentId);

    // ---------------------------
    // 2. Totals in one aggregation pass
    // ---------------------------
    let feeField = "$feeStructure.totalFee";

    if (term === "Term 1") feeField = "$feeStructure.term1Fee";
    else if (term === "Term 2") feeField = "$feeStructure.term2Fee";
    else if (term === "Term 3") feeField = "$feeStructure.term3Fee";

    const overviewStatsResult = await StudentEnrollment.aggregate([
      { $match: enrollmentMatch },
      {
        $lookup: {
          from: "feestructures",
          let: { eGrade: "$grade" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$schoolId", schoolId] },
                    { $eq: ["$grade", "$$eGrade"] },
                    { $eq: ["$academicYear", academicYear] }
                  ]
                }
              }
            }
          ],
          as: "feeStructure"
        }
      },
      {
        $unwind: {
          path: "$feeStructure",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "payments",
          let: { studentId: "$studentId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$studentId", "$$studentId"] },
                    { $eq: ["$schoolId", schoolId] },
                    { $eq: ["$academicYear", academicYear] },
                    { $ne: ["$isReversed", true] },
                    ...(term ? [{ $eq: ["$term", term] }] : [])
                  ]
                }
              }
            }
          ],
          as: "payments"
        }
      },
      {
        $addFields: {
          paidAmount: {
            $reduce: {
              input: "$payments",
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.amount", 0] }] }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: "$paidAmount" },
          totalExpectedFees: { $sum: { $ifNull: [feeField, 0] } },
          totalLearners: { $sum: 1 }
        }
      }
    ]);

    const stats = overviewStatsResult[0] || {
      totalPaid: 0,
      totalExpectedFees: 0,
      totalLearners: 0
    };

    const totalPaid = stats.totalPaid || 0;
    const totalExpectedFees = stats.totalExpectedFees || 0;
    const totalLearners = stats.totalLearners || 0;

    // ---------------------------
    // 3. Outstanding Balance
    // ---------------------------
    const totalOutstandingBalance = totalExpectedFees - totalPaid;

    res.json({
      totalPaid,
      totalExpectedFees,
      totalOutstandingBalance,
      totalLearners
    });

  } catch (err) {
    console.error("Get School Overview Stats Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET LEARNER DEMOGRAPHICS ANALYTICS (Admin Dashboard)
// ---------------------------
export const getLearnerDemographics = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    }

    const academicYear = parseInt(req.query.academicYear) || new Date().getFullYear();
    const { grade, stream } = req.query;
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);

    // 🔎 Get school info
    const school = await School.findById(req.user.schoolId).select('schoolType').lean();
    if (!school) return res.status(404).json({ message: 'School not found' });

    // Build match stage for enrollments
    const matchStage = {
      schoolId: schoolId,
      academicYear: academicYear,
      status: "active"
    };

    // Apply grade filter if provided
    if (grade) {
      matchStage.grade = grade;
    }

    // Apply stream filter if provided
    if (stream) {
      matchStage.stream = stream;
    }

    // Get all unique grades and streams for filter options
    const gradesAndStreams = await StudentEnrollment.aggregate([
      { $match: { schoolId: schoolId, academicYear: academicYear, status: "active" } },
      {
        $group: {
          _id: null,
          grades: { $addToSet: "$grade" },
          streams: { $addToSet: "$stream" }
        }
      },
      { $project: { grades: 1, streams: { $filter: { input: "$streams", cond: { $ne: ["$$this", null] } } } } }
    ]);

    const availableGrades = gradesAndStreams[0]?.grades || [];
    const availableStreams = gradesAndStreams[0]?.streams || [];

    // ---------------------------
    // 1. OVERALL DEMOGRAPHICS
    // ---------------------------
    const overallDemographics = await StudentEnrollment.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student"
        }
      },
      { $unwind: "$student" },
      {
        $group: {
          _id: "$student.gender",
          count: { $sum: 1 }
        }
      }
    ]);

    // Format overall demographics
    const genderBreakdown = {
      male: 0,
      female: 0,
      other: 0,
      notSpecified: 0
    };

    let totalLearners = 0;
    overallDemographics.forEach(item => {
      if (!item._id) {
        genderBreakdown.notSpecified = item.count;
      } else if (item._id.toLowerCase() === 'male') {
        genderBreakdown.male = item.count;
      } else if (item._id.toLowerCase() === 'female') {
        genderBreakdown.female = item.count;
      } else {
        genderBreakdown.other = item.count;
      }
      totalLearners += item.count;
    });

    // Calculate percentages
    const malePercentage = totalLearners > 0 ? ((genderBreakdown.male / totalLearners) * 100).toFixed(2) : 0;
    const femalePercentage = totalLearners > 0 ? ((genderBreakdown.female / totalLearners) * 100).toFixed(2) : 0;

    // ---------------------------
    // 2. DEMOGRAPHICS BY CLASS / STREAM
    // ---------------------------
    const byClass = await StudentEnrollment.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student"
        }
      },
      { $unwind: "$student" },
      {
        $group: {
          _id: {
            grade: "$grade",
            stream: "$stream",
            gender: "$student.gender"
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.grade": 1, "_id.stream": 1 }
      }
    ]);

    const classMap = {};
    byClass.forEach(item => {
      const gradeValue = item._id.grade || "Not Assigned";
      const streamValue = item._id.stream || null;
      const classKey = formatClassLabel(gradeValue, streamValue);

      if (!classMap[classKey]) {
        classMap[classKey] = {
          label: classKey,
          grade: gradeValue,
          stream: streamValue,
          male: 0,
          female: 0,
          other: 0,
          notSpecified: 0,
          total: 0
        };
      }

      const genderKey = !item._id.gender
        ? "notSpecified"
        : item._id.gender.toLowerCase() === "male"
        ? "male"
        : item._id.gender.toLowerCase() === "female"
        ? "female"
        : "other";

      classMap[classKey][genderKey] = item.count;
      classMap[classKey].total += item.count;
    });

    const classBreakdown = Object.values(classMap).map(entry => ({
      ...entry,
      malePercentage: entry.total > 0 ? ((entry.male / entry.total) * 100).toFixed(2) : 0,
      femalePercentage: entry.total > 0 ? ((entry.female / entry.total) * 100).toFixed(2) : 0
    }));

    const gradeBreakdown = classBreakdown;
    const streamBreakdown = [];

    // ---------------------------
    // 4. AGE STATISTICS (if DOB available)
    // ---------------------------
    const ageStats = await StudentEnrollment.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student"
        }
      },
      { $unwind: "$student" },
      { $match: { "student.dateOfBirth": { $exists: true, $ne: null } } },
      {
        $project: {
          age: {
            $divide: [
              { $subtract: [new Date(), "$student.dateOfBirth"] },
              1000 * 60 * 60 * 24 * 365.25
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgAge: { $avg: "$age" },
          minAge: { $min: "$age" },
          maxAge: { $max: "$age" },
          countWithDOB: { $sum: 1 }
        }
      }
    ]);

    const ageData = ageStats[0] || {
      avgAge: 0,
      minAge: 0,
      maxAge: 0,
      countWithDOB: 0
    };

    // Round age values
    const avgAge = ageData.avgAge ? Math.round(ageData.avgAge * 100) / 100 : 0;
    const minAge = ageData.minAge ? Math.round(ageData.minAge * 100) / 100 : 0;
    const maxAge = ageData.maxAge ? Math.round(ageData.maxAge * 100) / 100 : 0;

    // Response
    res.json({
      summary: {
        totalLearners,
        totalLearnersCounted: totalLearners,
        academicYear,
        filters: {
          grade: grade || null,
          stream: stream || null
        }
      },
      genderBreakdown: {
        ...genderBreakdown,
        malePercentage: parseFloat(malePercentage),
        femalePercentage: parseFloat(femalePercentage),
        total: totalLearners
      },
      classBreakdown,
      gradeBreakdown,
      streamBreakdown,
      ageStatistics: {
        averageAge: avgAge,
        minAge,
        maxAge,
        learnersWithDOB: ageData.countWithDOB
      },
      filterOptions: {
        availableGrades: sortGradesForDisplay(availableGrades),
        availableStreams: [...availableStreams].sort()
      }
    });

  } catch (err) {
    console.error("Get Learner Demographics Error:", err);
    res.status(500).json({ message: err.message });
  }
};
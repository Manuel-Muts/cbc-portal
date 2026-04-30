// controllers/reportsController.js
import FeeStructure from "../models/FeeStructure.js";
import { User } from "../models/User.js";
import { School } from "../models/school.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { calculateBalance } from "../services/balanceService.js";
import PDFDocument from 'pdfkit';
import axios from "axios"; // Import axios
import Payment from "../models/Payment.js";
import { PassThrough } from 'stream';
import cache from "../utils/simpleCache.js";

export const generateFeeStructuresPDF = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(400).json({ message: 'No school assigned' });
    }

    // Get school info for header
    const school = await School.findById(req.user.schoolId);
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
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(school.address || '', { align: 'center' });
    doc.moveDown(0.5);
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
    const school = await School.findById(req.user.schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    // --- Fetch Headteacher Signature (once) ---
    let headteacherSignatureBase64 = null;
    if (school.headteacherSignatureUrl) {
      headteacherSignatureBase64 = await getImageBase64FromUrl(school.headteacherSignatureUrl);
    }
    const { class: classFilter, term } = req.query;
    const currentAcademicYear = new Date().getFullYear();

    // Get students with their balances
    let students = await User.find({
      role: "student",
      schoolId: req.user.schoolId
    }).select("name admission schoolId");

    // Filter by class if specified
    if (classFilter) {
      const enrollments = await StudentEnrollment.find({
        studentId: { $in: students.map(s => s._id) },
        academicYear: currentAcademicYear,
        status: "active",
        grade: classFilter
      }).select('studentId');

      const enrolledStudentIds = enrollments.map(e => e.studentId);
      students = students.filter(s => enrolledStudentIds.includes(s._id));
    }

    // Get balance data for each student
    const studentData = [];
    for (const student of students) {
      try {
        let enrollment = await StudentEnrollment.findOne({
          studentId: student._id,
          academicYear: currentAcademicYear,
          status: "active"
        }).select("grade");

        if (!enrollment) {
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
      } catch (err) {
        console.error(`Error calculating balance for student ${student.name}:`, err);
        // Skip this student but continue with others
        studentData.push({
          studentId: student._id,
          admission: student.admission,
          className: "Error",
          studentName: student.name,
          expected: 0,
          paid: 0,
          balance: 0,
          termBalances: {
            term1: { fee: 0, paid: 0, balance: 0 },
            term2: { fee: 0, paid: 0, balance: 0 },
            term3: { fee: 0, paid: 0, balance: 0 }
          }
        });
      }
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
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(school.address || '', { align: 'center' });
    doc.moveDown(0.5);
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
      const classTeacher = await User.findOne({
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

    // Cache key specific to school and query parameters
    const cacheKey = `outstanding_${req.user.schoolId}_${JSON.stringify(req.query)}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const { name, class: classFilter, academicYear, term, page: pageQuery, limit: limitQuery, sort } = req.query;
    const page = parseInt(pageQuery) || 1;
    const limit = parseInt(limitQuery) || 10;
    const yearToUse = parseInt(academicYear) || new Date().getFullYear();

    // 1. Fetch Students
    const userQuery = {
      role: "student",
      schoolId: req.user.schoolId
    };
    if (name) {
      userQuery.$or = [
        { name: { $regex: name, $options: "i" } },
        { admission: { $regex: name, $options: "i" } }
      ];
    }
    const students = await User.find(userQuery).select("name admission _id").lean();

    if (students.length === 0) {
       return res.json({ students: [], total: 0, totalPages: 0, currentPage: page });
    }

    const studentIds = students.map(s => s._id);

    // 2. Batch Fetch Enrollments (Active only, matching current logic)
    const enrollments = await StudentEnrollment.find({
      studentId: { $in: studentIds },
      academicYear: yearToUse,
      status: "active"
    }).select("studentId grade stream").lean();

    // 3. Batch Fetch Payments
    const payments = await Payment.find({
      studentId: { $in: studentIds },
      academicYear: yearToUse
    }).select("studentId amount term").lean();

    // 4. Batch Fetch Fee Structures
    const feeStructures = await FeeStructure.find({
      schoolId: req.user.schoolId,
      academicYear: yearToUse
    }).lean();

    // 5. Process in memory
    let studentData = students.map(student => {
      const sId = String(student._id);
      const enrollment = enrollments.find(e => String(e.studentId) === sId);
      
      let balanceData;
      
      if (enrollment) {
        // Calculate balance logic inline to avoid N+1 service calls
        const fee = feeStructures.find(f => f.grade === enrollment.grade) || {};
        const sPayments = payments.filter(p => String(p.studentId) === sId);
        
        // Group payments
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
          termBalances: {
            term1: { fee: 0, paid: 0, balance: 0 },
            term2: { fee: 0, paid: 0, balance: 0 },
            term3: { fee: 0, paid: 0, balance: 0 }
          }
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

    // Filter by class if specified (supports both with and without stream)
    if (classFilter) {
      studentData = studentData.filter(s => {
        // Match exact format or partial match (for backward compatibility)
        if (!s.className.startsWith(classFilter)) return false;
        // Ensure we don't match "Grade 10" when filtering "Grade 1"
        const nextChar = s.className.charAt(classFilter.length);
        return !/\d/.test(nextChar); // True if next char is NOT a digit (e.g. space, letter, or empty)
      });
    }

    let outstandingStudents;
    if (term) {
      const termKey = term.toLowerCase().replace(/\s+/g, '');
      outstandingStudents = studentData.filter(s => s.termBalances && s.termBalances[termKey] && s.termBalances[termKey].balance > 0);
    } else {
      // Filter students with outstanding balance > 0 (Annual)
      outstandingStudents = studentData.filter(s => s.balance > 0);
    }

    // Sorting Logic
    if (sort) {
      const [field, order] = sort.split('_'); // e.g. "balance_desc" -> field="balance", order="desc"
      const multiplier = order === 'desc' ? -1 : 1;

      outstandingStudents.sort((a, b) => {
        if (field === 'balance') {
          return (a.balance - b.balance) * multiplier;
        }
        if (field === 'name') {
          return a.studentName.localeCompare(b.studentName) * multiplier;
        }
        if (field === 'admission') {
          // numeric comparison for admission strings if possible
          return a.admission.localeCompare(b.admission, undefined, { numeric: true }) * multiplier;
        }
        return 0;
      });
    }

    // Server-side pagination of the result set
    const total = outstandingStudents.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedStudents = outstandingStudents.slice(startIndex, endIndex);

    // Return structure matching pagination standards
    const response = { 
      students: paginatedStudents, 
      total, 
      totalPages, 
      currentPage: page,
      totalFilteredStudents: studentData.length 
    };
    cache.set(cacheKey, response, 120); // Cache for 2 minutes
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
    }

    // Get school info for header
    const school = await School.findById(req.user.schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    // --- Fetch Headteacher Signature (once) ---
    let headteacherSignatureBase64 = null;
    if (school.headteacherSignatureUrl) {
      headteacherSignatureBase64 = await getImageBase64FromUrl(school.headteacherSignatureUrl);
    }
    const { name, class: classFilter, term } = req.query;
    const currentAcademicYear = new Date().getFullYear();

    // Get students with their balances
    let students = await User.find({
      role: "student",
      schoolId: req.user.schoolId
    }).select("name admission schoolId");

    // Filter by name if specified
    if (name) {
      students = students.filter(s => 
        s.name.toLowerCase().includes(name.toLowerCase()) || 
        (s.admission && s.admission.toLowerCase().includes(name.toLowerCase()))
      );
    }

    if (students.length === 0) {
      // Return empty report immediately if no students
    }

    const studentIds = students.map(s => s._id);

    // 1. Batch Fetch Enrollments
    const enrollments = await StudentEnrollment.find({
      studentId: { $in: studentIds },
      academicYear: currentAcademicYear,
      status: "active"
    }).select("studentId grade stream").lean();

    // 2. Batch Fetch Payments
    const payments = await Payment.find({
      studentId: { $in: studentIds },
      academicYear: currentAcademicYear
    }).select("studentId amount term").lean();

    // 3. Batch Fetch Fee Structures
    const feeStructures = await FeeStructure.find({
      schoolId: req.user.schoolId,
      academicYear: currentAcademicYear
    }).lean();

    // 4. Process in Memory
    let studentData = students.map(student => {
      const sId = String(student._id);
      const enrollment = enrollments.find(e => String(e.studentId) === sId);
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
      const classTeacher = await User.findOne({
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
    }

    // Get school info for header
    const school = await School.findById(req.user.schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    // --- Fetch Headteacher Signature (once) ---
    let headteacherSignatureBase64 = null;
    if (school.headteacherSignatureUrl) {
      headteacherSignatureBase64 = await getImageBase64FromUrl(school.headteacherSignatureUrl);
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
      const classTeacher = await User.findOne({
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
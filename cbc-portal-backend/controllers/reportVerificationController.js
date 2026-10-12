import { createHash, randomBytes } from 'node:crypto';
import ReportVerification from '../models/ReportVerification.js';
import { School } from '../models/school.js';
import { User } from '../models/User.js';

const MAX_REPORTS_PER_REQUEST = 500;

const hashToken = token => createHash('sha256').update(token).digest('hex');

const canIssueReports = user =>
  user?.role === 'admin' || user?.role === 'super_admin' || user?.isDean === true;

export const issueReportVerifications = async (req, res) => {
  try {
    if (!canIssueReports(req.user) || !req.user.schoolId) {
      return res.status(403).json({ message: 'Dean or school admin access is required.' });
    }

    const { reports } = req.body;
    if (!Array.isArray(reports) || reports.length === 0 || reports.length > MAX_REPORTS_PER_REQUEST) {
      return res.status(400).json({ message: `Submit between 1 and ${MAX_REPORTS_PER_REQUEST} learner reports.` });
    }

    const school = await School.findById(req.user.schoolId).select('name schoolCode').lean();
    if (!school) return res.status(404).json({ message: 'School not found.' });

    const admissions = reports.map(report => String(report?.admission || '').trim());
    if (admissions.some(admission => !admission) || new Set(admissions).size !== admissions.length) {
      return res.status(400).json({ message: 'Each report must have a unique learner admission number.' });
    }

    const academicYear = Number(reports[0]?.academicYear);
    const term = String(reports[0]?.term || '').trim();
    const assessment = String(reports[0]?.assessment || '').trim();
    const grade = String(reports[0]?.grade || '').trim();

    if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2200
      || !term || term.length > 40 || !assessment || assessment.length > 80
      || !grade || grade.length > 40) {
      return res.status(400).json({ message: 'Valid report term, assessment, grade, and academic year are required.' });
    }

    const learners = await User.find({
      schoolId: req.user.schoolId,
      role: 'student',
      admission: { $in: admissions }
    }).select('name admission').lean();
    const learnersByAdmission = new Map(learners.map(learner => [String(learner.admission).trim(), learner]));
    const missingAdmissions = admissions.filter(admission => !learnersByAdmission.has(admission));
    if (missingAdmissions.length) {
      return res.status(400).json({ message: 'One or more learners could not be verified for this school.' });
    }

    const issuedAt = new Date();
    const issued = reports.map(report => {
      const learner = learnersByAdmission.get(String(report.admission).trim());
      const token = randomBytes(32).toString('base64url');
      return {
        token,
        record: {
          tokenHash: hashToken(token),
          schoolId: req.user.schoolId,
          schoolName: school.name,
          schoolCode: school.schoolCode || '',
          learnerName: learner.name,
          grade,
          stream: String(report.stream || '').trim().slice(0, 40),
          term,
          academicYear,
          assessment,
          issuedBy: req.user.id,
          issuedAt
        },
        admission: String(learner.admission).trim()
      };
    });

    await ReportVerification.insertMany(issued.map(item => item.record), { ordered: true });
    return res.status(201).json({
      reports: issued.map(({ token, admission }) => ({ admission, token, issuedAt }))
    });
  } catch (error) {
    console.error('Issue report verifications error:', error);
    return res.status(500).json({ message: 'Could not issue report verification codes.' });
  }
};

export const verifyReport = async (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
      return res.status(200).json({ valid: false });
    }

    const record = await ReportVerification.findOne({
      tokenHash: hashToken(token),
      active: true
    }).select('schoolName learnerName grade term academicYear').lean();

    if (!record) return res.status(200).json({ valid: false });

    return res.json({
      valid: true,
      report: {
        schoolName: record.schoolName,
        learnerName: record.learnerName,
        grade: record.grade,
        term: record.term,
        academicYear: record.academicYear
      }
    });
  } catch (error) {
    console.error('Verify learner report error:', error);
    return res.status(500).json({ message: 'Could not verify this report right now.' });
  }
};

export const revokeReportVerification = async (req, res) => {
  try {
    if (!canIssueReports(req.user) || !req.user.schoolId) {
      return res.status(403).json({ message: 'Dean or school admin access is required.' });
    }

    const token = String(req.body?.token || '');
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
      return res.status(400).json({ message: 'A valid report verification token is required.' });
    }

    const result = await ReportVerification.updateOne(
      { schoolId: req.user.schoolId, tokenHash: hashToken(token), active: true },
      { $set: { active: false } }
    );
    if (!result.modifiedCount) return res.status(404).json({ message: 'Active report verification was not found.' });

    return res.json({ message: 'Report verification revoked.' });
  } catch (error) {
    console.error('Revoke report verification error:', error);
    return res.status(500).json({ message: 'Could not revoke this report verification.' });
  }
};

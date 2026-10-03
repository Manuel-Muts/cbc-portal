const SCHOOL_TYPE_GRADES = {
  full: ['PG', 'PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'],
  primary_junior: ['PG', 'PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'],
  senior: ['Grade 10', 'Grade 11', 'Grade 12']
};

export const getAllowedGradesForSchoolType = (schoolType) => {
  const normalized = String(schoolType || 'full').toLowerCase().replace(/[^a-z]/g, '_');

  if (normalized.includes('primary') || normalized.includes('junior')) {
    return SCHOOL_TYPE_GRADES.primary_junior;
  }

  if (normalized.includes('senior')) {
    return SCHOOL_TYPE_GRADES.senior;
  }

  return SCHOOL_TYPE_GRADES.full;
};

export const buildGradeMatch = (schoolType, gradeFilter) => {
  const allowedGrades = getAllowedGradesForSchoolType(schoolType);
  return gradeFilter ? gradeFilter : { $in: allowedGrades };
};

export const buildActiveEnrollmentFilter = ({ schoolId, academicYear, grade, stream } = {}) => {
  const filter = {
    schoolId,
    academicYear: Number(academicYear) || new Date().getFullYear(),
    status: 'active'
  };
  if (grade) filter.grade = grade;
  if (stream) filter.stream = stream;
  return filter;
};

export const resolveActiveEnrollmentYear = ({ requestedYear, latestActiveYear, fallbackYear = new Date().getFullYear() } = {}) => {
  return Number(requestedYear) || Number(latestActiveYear) || Number(fallbackYear);
};

export const buildUserDirectoryEnrollmentFilter = ({ role, schoolId, academicYear, grade, stream } = {}) => {
  if (role !== 'accounts') {
    return buildActiveEnrollmentFilter({ schoolId, academicYear, grade, stream });
  }

  const filter = { schoolId };
  if (academicYear !== undefined && academicYear !== null && academicYear !== '') {
    filter.academicYear = Number(academicYear);
  }
  if (grade) filter.grade = grade;
  if (stream) filter.stream = stream;
  return filter;
};

export const getFinanceEnrollmentStatusFilter = (academicYear) => {
  return { $in: ['active', 'completed', 'transferred'] };
};

export const getOutstandingFeeStatus = (studentSummary = {}) => {
  const expected = Number(studentSummary.expected ?? studentSummary.totalFee ?? 0);
  const paid = Number(studentSummary.totalPaid ?? studentSummary.paid ?? 0);
  const balance = Number(studentSummary.balance ?? Math.max(expected - paid, 0));

  if (balance <= 0) return 'Paid';
  if (paid > 0) return 'Partial';
  return 'Unpaid';
};

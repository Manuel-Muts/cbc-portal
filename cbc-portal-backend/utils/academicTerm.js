const normalizeYear = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeTerm = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const resolveAcademicContext = (query = {}) => {
  const currentDate = new Date();
  const requestedYear = normalizeYear(query.year);
  const requestedTerm = normalizeTerm(query.term);

  const inferredYear = requestedYear ?? currentDate.getFullYear();
  const inferredTerm = requestedTerm ?? (() => {
    const month = currentDate.getMonth() + 1;
    if (month >= 5 && month <= 8) return 2;
    if (month >= 9) return 3;
    return 1;
  })();

  return { year: inferredYear, term: inferredTerm };
};

export const buildTeacherMarksQuery = (baseQuery = {}, academicContext = {}) => {
  const { year, term } = resolveAcademicContext(academicContext);
  return {
    ...baseQuery,
    year,
    term,
    // Generated Paper 1 + Paper 2 totals are for Dean analysis only.
    // Teacher-submitted combined marks have isPaperTotal false or unset and remain visible.
    isPaperTotal: { $ne: true }
  };
};

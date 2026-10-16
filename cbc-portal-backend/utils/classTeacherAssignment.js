const normalizeAssignmentGrade = (value) => {
  const grade = String(value || "").trim().replace(/^grade\s*/i, "");
  if (!grade) return null;
  if (/^(?:PG|PP\d+)$/i.test(grade)) return grade.toUpperCase();
  const numericGrade = grade.match(/\d+/);
  return numericGrade ? numericGrade[0] : grade.toUpperCase();
};

export const parseClassTeacherAssignment = (gradeValue, streamValue = null) => {
  const rawGrade = String(gradeValue || "").trim();
  if (!rawGrade) return null;

  const numericGrade = rawGrade.match(/^(?:grade\s*)?(\d{1,2})(?:\s*(?:stream\s*)?([a-z]+))?$/i);
  const earlyGrade = rawGrade.match(/^(?:grade\s*)?(pg|pp[12])(?:\s*(?:stream\s*)?([a-z]+))?$/i);
  const grade = numericGrade?.[1] || earlyGrade?.[1]?.toUpperCase() || normalizeAssignmentGrade(rawGrade);
  const embeddedStream = numericGrade?.[2] || earlyGrade?.[2] || null;
  const rawStream = String(streamValue || "").trim();
  const stream = /^(?:null|undefined|n\/?a|none|unassigned|no\s+stream|unstreamed|-)$/i.test(rawStream)
    ? null
    : rawStream ? rawStream.replace(/^stream\s+/i, "").toUpperCase() : null;

  if (embeddedStream && stream && embeddedStream.toUpperCase() !== stream) return null;
  const resolvedStream = stream || embeddedStream?.toUpperCase() || null;
  if (resolvedStream && !/^[A-Z]+$/.test(resolvedStream)) return null;
  return { grade: String(grade).toUpperCase(), stream: resolvedStream };
};

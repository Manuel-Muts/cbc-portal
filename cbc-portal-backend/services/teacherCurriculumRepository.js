import { queryPostgres } from './postgres.js';

const toTextArray = value => Array.isArray(value) ? value.map(item => String(item)) : [];

const toCurriculumUnit = row => row && ({
  id: row.id,
  grade: row.grade,
  subject: row.subject,
  strand: row.strand,
  subStrand: row.sub_strand,
  sequenceNumber: row.sequence_number,
  specificLearningOutcomes: toTextArray(row.specific_learning_outcomes),
  keyInquiryQuestions: toTextArray(row.key_inquiry_questions),
  coreCompetencies: toTextArray(row.core_competencies),
  values: toTextArray(row.curriculum_values),
  pertinentContemporaryIssues: toTextArray(row.pertinent_contemporary_issues),
  suggestedLearningExperiences: toTextArray(row.suggested_learning_experiences),
  resources: toTextArray(row.resources),
  assessmentGuidance: toTextArray(row.assessment_guidance),
  source: {
    title: row.source_title,
    url: row.source_url,
    revision: row.source_revision,
    verifiedAt: row.verified_at
  }
});

export const listTeacherCurriculumOptions = async ({ grade, subject, strand } = {}) => {
  const filters = [];
  const values = [];
  for (const [column, value] of [
    ['grade', grade],
    ['subject', subject],
    ['strand', strand]
  ]) {
    if (!value) continue;
    values.push(String(value).trim());
    filters.push(`${column} = $${values.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await queryPostgres(
    `SELECT DISTINCT grade, subject, strand, sub_strand, sequence_number
     FROM cbc_curriculum_units ${where}
     ORDER BY grade, subject, strand, sequence_number, sub_strand`,
    values
  );
  return result.rows.map(row => ({
    grade: row.grade,
    subject: row.subject,
    strand: row.strand,
    subStrand: row.sub_strand,
    sequenceNumber: row.sequence_number
  }));
};

export const getTeacherCurriculumUnit = async ({ grade, subject, strand, subStrand }) => {
  const result = await queryPostgres(
    `SELECT * FROM cbc_curriculum_units
     WHERE grade = $1 AND subject = $2 AND strand = $3 AND sub_strand = $4
     ORDER BY verified_at DESC, sequence_number
     LIMIT 1`,
    [grade, subject, strand, subStrand]
  );
  return toCurriculumUnit(result.rows[0]);
};

export const getTeachingWeeksForTerm = async term => {
  const result = await queryPostgres(
    'SELECT teaching_weeks FROM teacher_planning_term_lengths WHERE term = $1',
    [term]
  );
  return result.rows[0]?.teaching_weeks ?? null;
};

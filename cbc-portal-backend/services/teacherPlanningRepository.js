import { randomUUID } from 'node:crypto';
import { queryPostgres } from './postgres.js';

const ENTITIES = {
  schemes: {
    table: 'teacher_schemes_of_work',
    columns: [
      'academic_year', 'term', 'grade', 'subject', 'week_number', 'strand',
      'sub_strand', 'learning_outcomes', 'learning_experiences', 'resources', 'assessment'
    ],
    orderBy: 'academic_year DESC, term, grade, subject, week_number, updated_at DESC'
  },
  lessons: {
    table: 'teacher_lesson_plans',
    columns: [
      'lesson_date', 'academic_year', 'term', 'grade', 'subject', 'week_number',
      'lesson_number', 'scheme_id', 'topic',
      'strand', 'sub_strand', 'lesson_objectives', 'learning_activities',
      'resources', 'assessment', 'reflection'
    ],
    orderBy: 'lesson_date DESC NULLS LAST, academic_year DESC, term, grade, subject, updated_at DESC'
  }
};

const getEntity = (entity) => {
  const definition = ENTITIES[entity];
  if (!definition) throw new Error(`Unknown teacher planning entity: ${entity}`);
  return definition;
};

const toRecord = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    teacherId: row.teacher_id,
    academicYear: row.academic_year,
    term: row.term,
    grade: row.grade,
    subject: row.subject,
    ...(row.week_number !== undefined ? { weekNumber: row.week_number } : {}),
    ...(row.lesson_number !== undefined ? { lessonNumber: row.lesson_number } : {}),
    ...(row.scheme_id !== undefined ? { schemeId: row.scheme_id } : {}),
    ...(row.lesson_date !== undefined ? {
      lessonDate: row.lesson_date ? new Date(row.lesson_date).toISOString().slice(0, 10) : ''
    } : {}),
    ...(row.topic !== undefined ? { topic: row.topic } : {}),
    strand: row.strand,
    subStrand: row.sub_strand,
    ...(row.learning_outcomes !== undefined ? { learningOutcomes: row.learning_outcomes } : {}),
    ...(row.learning_experiences !== undefined ? { learningExperiences: row.learning_experiences } : {}),
    ...(row.lesson_objectives !== undefined ? { lessonObjectives: row.lesson_objectives } : {}),
    ...(row.learning_activities !== undefined ? { learningActivities: row.learning_activities } : {}),
    resources: row.resources,
    assessment: row.assessment,
    ...(row.reflection !== undefined ? { reflection: row.reflection } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const toColumnValue = (column, record) => {
  const values = {
    academic_year: record.academicYear,
    term: record.term,
    grade: record.grade,
    subject: record.subject,
    week_number: record.weekNumber,
    lesson_number: record.lessonNumber,
    scheme_id: record.schemeId || null,
    lesson_date: record.lessonDate || null,
    topic: record.topic,
    strand: record.strand,
    sub_strand: record.subStrand,
    learning_outcomes: record.learningOutcomes,
    learning_experiences: record.learningExperiences,
    lesson_objectives: record.lessonObjectives,
    learning_activities: record.learningActivities,
    resources: record.resources,
    assessment: record.assessment,
    reflection: record.reflection
  };
  return values[column];
};

export const listTeacherPlanningRecords = async ({ entity, teacherId }) => {
  const definition = getEntity(entity);
  const result = await queryPostgres(
    `SELECT * FROM ${definition.table} WHERE teacher_id = $1 ORDER BY ${definition.orderBy} LIMIT 500`,
    [String(teacherId)]
  );
  return result.rows.map(toRecord);
};

export const getTeacherPlanningRecord = async ({ entity, teacherId, id }) => {
  const definition = getEntity(entity);
  const result = await queryPostgres(
    `SELECT * FROM ${definition.table} WHERE id = $1 AND teacher_id = $2 LIMIT 1`,
    [String(id), String(teacherId)]
  );
  return toRecord(result.rows[0]);
};

export const createTeacherPlanningRecord = async ({ entity, teacherId, record }) => {
  const definition = getEntity(entity);
  const columns = ['id', 'teacher_id', ...definition.columns];
  const values = [randomUUID(), String(teacherId), ...definition.columns.map(column => toColumnValue(column, record))];
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const result = await queryPostgres(
    `INSERT INTO ${definition.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values
  );
  return toRecord(result.rows[0]);
};

export const updateTeacherPlanningRecord = async ({ entity, teacherId, id, record }) => {
  const definition = getEntity(entity);
  const values = definition.columns.map(column => toColumnValue(column, record));
  const assignments = definition.columns.map((column, index) => `${column} = $${index + 1}`);
  values.push(String(id), String(teacherId));
  const result = await queryPostgres(
    `UPDATE ${definition.table}
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND teacher_id = $${values.length}
     RETURNING *`,
    values
  );
  return toRecord(result.rows[0]);
};

export const deleteTeacherPlanningRecord = async ({ entity, teacherId, id }) => {
  const definition = getEntity(entity);
  const result = await queryPostgres(
    `DELETE FROM ${definition.table} WHERE id = $1 AND teacher_id = $2 RETURNING id`,
    [String(id), String(teacherId)]
  );
  return result.rowCount > 0;
};

import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { loadEnvironmentFiles } from '../utils/envConfig.js';
import { closePostgresPool, getPostgresPool } from '../services/postgres.js';

loadEnvironmentFiles({ env: process.env.NODE_ENV || 'production' });

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/importTeacherCurriculum.js <authorized-curriculum.json>');
  process.exitCode = 1;
} else {
  const normalizeList = (value, field, index) => {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
      throw new Error(`Unit ${index}: ${field} must be an array of non-empty strings.`);
    }
    return value.map(item => item.trim());
  };

  try {
    const data = JSON.parse(await fs.readFile(inputPath, 'utf8'));
    const { source, units } = data;
    if (!source || !['title', 'url', 'revision', 'verifiedAt'].every(key => (
      typeof source[key] === 'string' && source[key].trim()
    ))) {
      throw new Error('Source must include title, url, revision, and verifiedAt.');
    }
    const sourceUrl = new URL(source.url);
    if (sourceUrl.protocol !== 'https:') throw new Error('Curriculum source URL must use HTTPS.');
    if (!Array.isArray(units) || !units.length) {
      throw new Error('Curriculum import must contain at least one unit.');
    }

    const prepared = units.map((unit, index) => {
      for (const key of ['grade', 'subject', 'strand', 'subStrand']) {
        if (typeof unit[key] !== 'string' || !unit[key].trim()) {
          throw new Error(`Unit ${index + 1}: ${key} is required.`);
        }
      }
      const sequenceNumber = Number(unit.sequenceNumber);
      if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
        throw new Error(`Unit ${index + 1}: sequenceNumber must be a positive integer.`);
      }
      const preparedUnit = {
        ...unit,
        sequenceNumber,
        specificLearningOutcomes: normalizeList(unit.specificLearningOutcomes, 'specificLearningOutcomes', index + 1),
        keyInquiryQuestions: normalizeList(unit.keyInquiryQuestions, 'keyInquiryQuestions', index + 1),
        coreCompetencies: normalizeList(unit.coreCompetencies, 'coreCompetencies', index + 1),
        values: normalizeList(unit.values, 'values', index + 1),
        pertinentContemporaryIssues: normalizeList(unit.pertinentContemporaryIssues, 'pertinentContemporaryIssues', index + 1),
        suggestedLearningExperiences: normalizeList(unit.suggestedLearningExperiences, 'suggestedLearningExperiences', index + 1),
        resources: normalizeList(unit.resources, 'resources', index + 1),
        assessmentGuidance: normalizeList(unit.assessmentGuidance, 'assessmentGuidance', index + 1)
      };
      if (!preparedUnit.specificLearningOutcomes.length) {
        throw new Error(`Unit ${index + 1}: at least one verified specific learning outcome is required.`);
      }
      return preparedUnit;
    });
    const verifiedAt = new Date(source.verifiedAt);
    if (Number.isNaN(verifiedAt.getTime())) throw new Error('source.verifiedAt must be a valid date.');

    const pool = getPostgresPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const unit of prepared) {
        await client.query(
          `INSERT INTO cbc_curriculum_units (
             id, grade, subject, strand, sub_strand, sequence_number,
             specific_learning_outcomes, key_inquiry_questions, core_competencies,
             curriculum_values, pertinent_contemporary_issues, suggested_learning_experiences,
             resources, assessment_guidance, source_title, source_url, source_revision, verified_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
             $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17, $18
           )
           ON CONFLICT (grade, subject, strand, sub_strand, source_revision)
           DO UPDATE SET
             sequence_number = EXCLUDED.sequence_number,
             specific_learning_outcomes = EXCLUDED.specific_learning_outcomes,
             key_inquiry_questions = EXCLUDED.key_inquiry_questions,
             core_competencies = EXCLUDED.core_competencies,
             curriculum_values = EXCLUDED.curriculum_values,
             pertinent_contemporary_issues = EXCLUDED.pertinent_contemporary_issues,
             suggested_learning_experiences = EXCLUDED.suggested_learning_experiences,
             resources = EXCLUDED.resources,
             assessment_guidance = EXCLUDED.assessment_guidance,
             source_title = EXCLUDED.source_title,
             source_url = EXCLUDED.source_url,
             verified_at = EXCLUDED.verified_at,
             updated_at = NOW()`,
          [
            randomUUID(), unit.grade.trim(), unit.subject.trim(), unit.strand.trim(),
            unit.subStrand.trim(), unit.sequenceNumber,
            JSON.stringify(unit.specificLearningOutcomes),
            JSON.stringify(unit.keyInquiryQuestions),
            JSON.stringify(unit.coreCompetencies),
            JSON.stringify(unit.values),
            JSON.stringify(unit.pertinentContemporaryIssues),
            JSON.stringify(unit.suggestedLearningExperiences),
            JSON.stringify(unit.resources),
            JSON.stringify(unit.assessmentGuidance),
            source.title.trim(), source.url.trim(), source.revision.trim(), verifiedAt
          ]
        );
      }
      await client.query('COMMIT');
      console.log(`Imported ${prepared.length} verified curriculum units from ${source.title} (${source.revision}).`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Teacher curriculum import failed:', error);
    process.exitCode = 1;
  } finally {
    await closePostgresPool();
  }
}

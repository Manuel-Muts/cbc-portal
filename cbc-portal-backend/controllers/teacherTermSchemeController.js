import { listTeacherCurriculumUnits } from '../services/teacherCurriculumRepository.js';
import {
  generateGeminiTermScheme,
  isTeacherTermAiEnabled
} from '../services/teacherTermSchemeAi.js';

const TERMS = new Set(['Term 1', 'Term 2', 'Term 3']);
const MAX_TERM_WEEKS = 24;
const MAX_CURRICULUM_UNITS = 80;
const WEEK_FIELDS = [
  'strand', 'subStrand', 'learningOutcomes', 'learningExperiences', 'resources', 'assessment'
];
const WEEK_LIMITS = {
  strand: 200,
  subStrand: 200,
  learningOutcomes: 4000,
  learningExperiences: 4000,
  resources: 2000,
  assessment: 3000
};
const isHttpsUrl = value => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export const validateTermlyPlan = ({ weeklyPlan, weeksInTerm, breakWeeks }) => {
  if (!Array.isArray(weeklyPlan) || weeklyPlan.length !== weeksInTerm) {
    return { error: 'The generated plan must include exactly one entry for every term week.' };
  }
  const normalized = [];
  for (let index = 0; index < weeklyPlan.length; index += 1) {
    const week = weeklyPlan[index];
    const weekNumber = index + 1;
    if (!week || week.weekNumber !== weekNumber || typeof week.isBreak !== 'boolean') {
      return { error: 'The generated plan has invalid or out-of-order week numbers.' };
    }
    const expectedBreak = breakWeeks.includes(weekNumber);
    if (week.isBreak !== expectedBreak) {
      return { error: `The generated plan does not respect break week ${weekNumber}.` };
    }
    const cleanWeek = { weekNumber, isBreak: expectedBreak };
    for (const field of WEEK_FIELDS) {
      const value = week[field];
      if (typeof value !== 'string' || value.length > WEEK_LIMITS[field]) {
        return { error: `Week ${weekNumber} has invalid ${field} content.` };
      }
      cleanWeek[field] = value.trim();
    }
    if (expectedBreak) {
      if (WEEK_FIELDS.some(field => cleanWeek[field])) {
        return { error: `Break week ${weekNumber} must not contain teaching activities.` };
      }
    } else if (WEEK_FIELDS.some(field => !cleanWeek[field])) {
      return { error: `Week ${weekNumber} is missing part of its teaching plan.` };
    }
    normalized.push(cleanWeek);
  }
  return { weeklyPlan: normalized };
};

export const createTeacherTermSchemeController = ({
  listUnits = listTeacherCurriculumUnits,
  generatePlan = generateGeminiTermScheme,
  isEnabled = isTeacherTermAiEnabled,
  logger = console
} = {}) => async (req, res) => {
  const { grade, subject, term, weeksInTerm, breakWeeks = [] } = req.body || {};
  if (![grade, subject].every(value => typeof value === 'string' && value.trim())
    || grade.trim().length > 80
    || subject.trim().length > 120
    || !TERMS.has(term)) {
    return res.status(400).json({ message: 'Select a valid grade, subject, and term.' });
  }
  if (!Number.isInteger(weeksInTerm) || weeksInTerm < 1 || weeksInTerm > MAX_TERM_WEEKS) {
    return res.status(400).json({ message: `Term length must be between 1 and ${MAX_TERM_WEEKS} weeks.` });
  }
  if (!Array.isArray(breakWeeks)
    || breakWeeks.length >= weeksInTerm
    || breakWeeks.some(week => !Number.isInteger(week) || week < 1 || week > weeksInTerm)
    || new Set(breakWeeks).size !== breakWeeks.length) {
    return res.status(400).json({ message: 'Enter unique break week numbers within the term.' });
  }
  if (!isEnabled()) {
    return res.status(503).json({
      code: 'TERM_AI_DISABLED',
      message: 'AI term planning is currently disabled while provider eligibility is reviewed.'
    });
  }

  let curriculumUnits;
  try {
    curriculumUnits = await listUnits({
      grade: grade.trim(),
      subject: subject.trim(),
      limit: MAX_CURRICULUM_UNITS + 1
    });
  } catch (error) {
    logger.error('Failed to load verified curriculum for teacher term scheme:', error.message);
    return res.status(500).json({ message: 'Could not load verified curriculum units.' });
  }
  if (!curriculumUnits.length) {
    return res.status(404).json({
      code: 'CURRICULUM_UNITS_NOT_FOUND',
      message: 'No verified curriculum units are available for this grade and subject.'
    });
  }
  if (curriculumUnits.length > MAX_CURRICULUM_UNITS) {
    return res.status(422).json({
      message: 'Too many curriculum units are available to build a reliable term draft.'
    });
  }

  let weeklyPlan;
  try {
    weeklyPlan = await generatePlan({
      grade: grade.trim(),
      subject: subject.trim(),
      term,
      weeksInTerm,
      breakWeeks: [...breakWeeks].sort((left, right) => left - right),
      curriculumUnits
    });
  } catch (error) {
    if (error.code === 'TERM_AI_DISABLED') {
      return res.status(503).json({
        code: error.code,
        message: 'AI term planning is currently disabled while provider eligibility is reviewed.'
      });
    }
    logger.error('Failed to generate teacher term scheme:', error.code || error.message);
    if (error.code === 'TERM_AI_INVALID_RESPONSE') {
      return res.status(502).json({
        code: error.code,
        message: 'The AI provider returned an invalid response. Please try again.'
      });
    }
    if (error.code === 'TERM_AI_PROVIDER_FAILURE') {
      return res.status(502).json({
        code: error.code,
        message: 'The AI provider could not complete the request. Please try again later.'
      });
    }
    return res.status(502).json({
      code: 'TERM_AI_UNAVAILABLE',
      message: 'Could not generate the term draft. Please try again later.'
    });
  }

  const result = validateTermlyPlan({ weeklyPlan, weeksInTerm, breakWeeks });
  if (result.error) {
    logger.error('Gemini term plan failed structural validation.');
    return res.status(502).json({
      code: 'TERM_AI_INVALID_RESPONSE',
      message: 'The generated term draft was incomplete or invalid. Please try again.'
    });
  }
  const curriculumSources = [...new Map(curriculumUnits
    .filter(unit => unit.source?.title && isHttpsUrl(unit.source.url))
    .map(unit => [`${unit.source.title}|${unit.source.url}`, {
      title: unit.source.title,
      url: unit.source.url,
      revision: unit.source.revision || ''
    }])).values()];
  return res.json({
    draft: {
      weeklyPlan: result.weeklyPlan,
      weeksInTerm,
      breakWeeks: [...breakWeeks].sort((left, right) => left - right),
      curriculumSources
    }
  });
};

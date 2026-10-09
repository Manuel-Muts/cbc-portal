import {
  getTeachingWeeksForTerm,
  getTeacherCurriculumUnit,
  listTeacherCurriculumOptions
} from '../services/teacherCurriculumRepository.js';

const TERMS = new Set(['Term 1', 'Term 2', 'Term 3']);
const requiredText = (...values) => values.every(value => typeof value === 'string' && value.trim());
const asLines = values => values.join('\n');

export const createTeacherCurriculumController = ({
  listOptions = listTeacherCurriculumOptions,
  getUnit = getTeacherCurriculumUnit,
  getTermWeeks = getTeachingWeeksForTerm,
  logger = console
} = {}) => ({
  options: async (req, res) => {
    const filters = {};
    for (const key of ['grade', 'subject', 'strand', 'term']) {
      if (req.query[key] !== undefined) {
        if (typeof req.query[key] !== 'string' || !req.query[key].trim()) {
          return res.status(400).json({ message: `${key} must be a non-empty string.` });
        }
        filters[key] = req.query[key].trim();
      }
    }
    if (filters.term && !TERMS.has(filters.term)) {
      return res.status(400).json({ message: 'Select a valid term.' });
    }
    try {
      const [options, teachingWeeks] = await Promise.all([
        listOptions(filters),
        filters.term ? getTermWeeks(filters.term) : Promise.resolve(null)
      ]);
      return res.json({ options, teachingWeeks });
    } catch (error) {
      logger.error('Failed to load teacher curriculum options:', error);
      return res.status(500).json({ message: 'Could not load curriculum options.' });
    }
  },

  generateDraft: async (req, res) => {
    const { grade, subject, term, strand, subStrand, weekNumber, lessonsPerWeek } = req.body || {};
    if (!requiredText(grade, subject, term, strand, subStrand) || !TERMS.has(term)) {
      return res.status(400).json({ message: 'Select a valid grade, subject, term, strand, and sub-strand.' });
    }
    const week = Number(weekNumber);
    const lessonCount = Number(lessonsPerWeek);
    if (!Number.isInteger(week) || !Number.isInteger(lessonCount)
      || lessonCount < 1 || lessonCount > 20) {
      return res.status(400).json({ message: 'Week number and lessons per week must be valid.' });
    }

    try {
      const [unit, teachingWeeks] = await Promise.all([
        getUnit({
          grade: grade.trim(),
          subject: subject.trim(),
          strand: strand.trim(),
          subStrand: subStrand.trim()
        }),
        getTermWeeks(term)
      ]);
      if (!unit) {
        return res.status(404).json({
          code: 'CURRICULUM_UNIT_NOT_FOUND',
          message: 'No verified curriculum entry exists for that grade, subject, strand, and sub-strand.'
        });
      }
      if (!Number.isInteger(teachingWeeks) || week > teachingWeeks) {
        return res.status(400).json({
          message: `Week number must be between 1 and ${Number.isInteger(teachingWeeks) ? teachingWeeks : 52} for ${term}.`
        });
      }

      const outcomeList = unit.specificLearningOutcomes;
      const activityList = unit.suggestedLearningExperiences;
      const resourceList = unit.resources;
      const assessmentList = unit.assessmentGuidance;
      const outcomes = asLines(outcomeList);
      const activities = asLines(activityList);
      const resources = asLines(resourceList);
      const assessment = asLines(assessmentList);
      const lessonAt = (items, index) => items.length ? items[index % items.length] : '';
      const curriculumContext = {
        keyInquiryQuestions: unit.keyInquiryQuestions,
        coreCompetencies: unit.coreCompetencies,
        values: unit.values,
        pertinentContemporaryIssues: unit.pertinentContemporaryIssues,
        source: unit.source
      };

      return res.json({
        draft: {
          scheme: {
            grade: unit.grade,
            subject: unit.subject,
            term,
            weekNumber: week,
            strand: unit.strand,
            subStrand: unit.subStrand,
            learningOutcomes: outcomes,
            learningExperiences: activities,
            resources,
            assessment
          },
          lessons: Array.from({ length: lessonCount }, (_, index) => ({
            grade: unit.grade,
            subject: unit.subject,
            term,
            weekNumber: week,
            lessonNumber: index + 1,
            topic: unit.subStrand,
            strand: unit.strand,
            subStrand: unit.subStrand,
            lessonObjectives: lessonAt(outcomeList, index),
            learningActivities: lessonAt(activityList, index),
            resources: lessonAt(resourceList, index),
            assessment: lessonAt(assessmentList, index),
            reflection: ''
          })),
          curriculumContext,
          teachingWeeks
        }
      });
    } catch (error) {
      logger.error('Failed to generate teacher planning draft:', error);
      return res.status(500).json({ message: 'Could not generate the planning draft.' });
    }
  }
});

const controller = createTeacherCurriculumController();
export const teacherCurriculumOptions = controller.options;
export const generateTeacherPlanningDraft = controller.generateDraft;

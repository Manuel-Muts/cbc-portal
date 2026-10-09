import PDFDocument from 'pdfkit';
import {
  createTeacherPlanningRecord,
  deleteTeacherPlanningRecord,
  getTeacherPlanningRecord,
  listTeacherPlanningRecords,
  updateTeacherPlanningRecord
} from '../services/teacherPlanningRepository.js';
import { getTeachingWeeksForTerm } from '../services/teacherCurriculumRepository.js';
import { hasTeacherPlanningPdfAccess } from '../services/stkPaymentService.js';

const COMMON_FIELDS = ['academicYear', 'term', 'grade', 'subject'];
const TEXT_LIMITS = {
  grade: 80,
  subject: 120,
  strand: 200,
  subStrand: 200,
  learningOutcomes: 4000,
  learningExperiences: 4000,
  resources: 2000,
  assessment: 3000,
  topic: 250,
  lessonObjectives: 4000,
  learningActivities: 4000,
  reflection: 3000
};
const SCHEMES_FIELDS = [
  ...COMMON_FIELDS, 'weekNumber', 'strand', 'subStrand', 'learningOutcomes',
  'learningExperiences', 'resources', 'assessment'
];
const LESSON_FIELDS = [
  ...COMMON_FIELDS, 'weekNumber', 'lessonNumber', 'schemeId', 'lessonDate', 'topic', 'strand', 'subStrand',
  'lessonObjectives', 'learningActivities', 'resources', 'assessment', 'reflection'
];
const REQUIRED_FIELDS = {
  schemes: [...COMMON_FIELDS, 'weekNumber'],
  lessons: [...COMMON_FIELDS, 'topic', 'lessonObjectives', 'learningActivities']
};

const normalizeRecord = (entity, input) => {
  const fields = entity === 'schemes' ? SCHEMES_FIELDS : LESSON_FIELDS;
  const record = {};
  for (const field of fields) {
    const value = input?.[field];
    if (field === 'academicYear' || field === 'weekNumber' || field === 'lessonNumber') {
      record[field] = value === '' || value === undefined || value === null
        ? (field === 'academicYear' ? NaN : null)
        : Number(value);
    } else if (field === 'schemeId') {
      record[field] = value ? String(value).trim() : '';
    } else if (field === 'lessonDate') {
      record[field] = value ? String(value).trim() : '';
    } else {
      record[field] = String(value ?? '').trim();
    }
  }
  return record;
};

const validateRecord = (entity, record) => {
  const errors = [];
  for (const field of REQUIRED_FIELDS[entity]) {
    const value = record[field];
    if (typeof value === 'string' ? !value : !Number.isInteger(value)) {
      errors.push(`${field} is required.`);
    }
  }

  if (!Number.isInteger(record.academicYear) || record.academicYear < 2000 || record.academicYear > 2200) {
    errors.push('Academic year must be between 2000 and 2200.');
  }
  if (!['Term 1', 'Term 2', 'Term 3'].includes(record.term)) {
    errors.push('Select a valid term.');
  }
  if (entity === 'schemes' && (!Number.isInteger(record.weekNumber) || record.weekNumber < 1 || record.weekNumber > 52)) {
    errors.push('Week number must be between 1 and 52.');
  }
  if (entity === 'lessons' && record.weekNumber !== null
    && (!Number.isInteger(record.weekNumber) || record.weekNumber < 1 || record.weekNumber > 52)) {
    errors.push('Week number must be between 1 and 52.');
  }
  if (entity === 'lessons' && record.lessonNumber !== null
    && (!Number.isInteger(record.lessonNumber) || record.lessonNumber < 1 || record.lessonNumber > 20)) {
    errors.push('Lesson number must be between 1 and 20.');
  }
  if (entity === 'lessons' && record.schemeId && !isRecordId(record.schemeId)) {
    errors.push('Scheme reference is invalid.');
  }
  if (record.lessonDate) {
    const lessonDate = new Date(`${record.lessonDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.lessonDate)
      || Number.isNaN(lessonDate.getTime())
      || lessonDate.toISOString().slice(0, 10) !== record.lessonDate) {
      errors.push('Lesson date must be a valid date.');
    }
  }
  for (const [field, limit] of Object.entries(TEXT_LIMITS)) {
    if (record[field] !== undefined && record[field].length > limit) {
      errors.push(`${field} must be ${limit} characters or fewer.`);
    }
  }
  return errors;
};

const isRecordId = (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

export const createPlanningPdf = ({ entity, record, teacherName }) => new Promise((resolve, reject) => {
  const document = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: {
    Title: `${entity === 'schemes' ? 'Scheme of Work' : 'Lesson Plan'} - ${record.subject}`,
    Author: teacherName,
    Subject: 'Teacher planning record'
  } });
  const chunks = [];
  const pageWidth = document.page.width;
  const contentWidth = pageWidth - 84;
  const isLessonPlan = entity === 'lessons';
  const drawHeader = (continued = false) => {
    const title = entity === 'schemes' ? 'SCHEME OF WORK' : 'LESSON PLAN';
    const headerHeight = continued ? 66 : isLessonPlan ? 62 : 96;
    document.save();
    document.rect(0, 0, pageWidth, 6).fill('#0891b2');
    document.roundedRect(42, 25, contentWidth, headerHeight, 9).fill('#0f3752');
    document.roundedRect(42, 25, 5, headerHeight, 2).fill('#0ea5be');
    document.fillColor('#67e8f9').font('Helvetica-Bold').fontSize(8)
      .text('TEACHER PLANNING', 58, 38);
    document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(continued ? 14 : isLessonPlan ? 17 : 19)
      .text(isLessonPlan
        ? `${title}${continued ? ' (CONTINUED)' : ''}`
        : `${record.subject || 'TEACHER'} ${title}${continued ? ' (CONTINUED)' : ''}`, 58, 51, {
        width: contentWidth - 32,
        height: continued ? 23 : 30,
        ellipsis: true
      });
    if (!continued && !isLessonPlan) {
      const details = [
        `Grade ${record.grade || '—'}`,
        `Teacher: ${teacherName}`,
        ...(entity === 'schemes' ? [`Week ${record.weekNumber}`] : [])
      ].join('    |    ');
      document.fillColor('#e2e8f0').font('Helvetica').fontSize(9)
        .text(details, 58, 79, { width: contentWidth - 32, ellipsis: true });
    }
    document.restore();
    document.y = 25 + headerHeight + 16;
  };

  document.on('data', chunk => chunks.push(chunk));
  document.on('error', reject);
  document.on('pageAdded', () => drawHeader(true));
  document.on('end', () => resolve(Buffer.concat(chunks)));
  drawHeader();

  const metadataFields = [
    ['Academic year', record.academicYear],
    ['Term', record.term],
    ...(record.lessonDate ? [['Lesson date', record.lessonDate]] : []),
    ...(record.topic ? [['Topic', record.topic]] : [])
  ];
  if (isLessonPlan) {
    const drawMetadataRow = cells => {
      const gap = 8;
      const cellWidth = (contentWidth - gap * (cells.length - 1)) / cells.length;
      const measured = cells.map(([label, value]) => {
        document.font('Helvetica').fontSize(9);
        const valueHeight = document.heightOfString(String(value ?? '—'), {
          width: cellWidth - 20,
          lineGap: 1
        });
        return { label, value: String(value ?? '—'), height: Math.max(48, valueHeight + 31) };
      });
      const rowHeight = Math.max(...measured.map(cell => cell.height));
      const bottom = document.page.height - 64;
      if (document.y + rowHeight > bottom) document.addPage();
      const rowY = document.y;

      measured.forEach((cell, index) => {
        const x = 42 + index * (cellWidth + gap);
        const y = rowY;
        document.save();
        document.roundedRect(x, y, cellWidth, rowHeight, 5)
          .fillAndStroke('#f8fafc', '#cbd5e1');
        document.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5)
          .text(String(cell.label).toUpperCase(), x + 10, y + 8, {
            width: cellWidth - 20,
            ellipsis: true
          });
        document.fillColor('#0f172a').font('Helvetica').fontSize(9)
          .text(cell.value, x + 10, y + 21, {
            width: cellWidth - 20,
            height: rowHeight - 27,
            ellipsis: true
          });
        document.restore();
      });
      document.y = rowY + rowHeight + 8;
    };

    drawMetadataRow([
      ['Prepared by', teacherName],
      ['Prepared date', new Date().toLocaleDateString()]
    ]);
    drawMetadataRow([
      ['Subject', record.subject],
      ['Grade', record.grade],
      ['Topic / Unit', record.topic]
    ]);
    drawMetadataRow([
      ['Academic year', record.academicYear],
      ['Term', record.term],
      ['Lesson date', record.lessonDate || 'Not specified']
    ]);
    if (record.weekNumber || record.lessonNumber) {
      drawMetadataRow([
        ...(record.weekNumber ? [['Week', record.weekNumber]] : []),
        ...(record.lessonNumber ? [['Lesson number', record.lessonNumber]] : [])
      ]);
    }
  } else if (metadataFields.length) {
    document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
    for (const [label, value] of metadataFields) {
      document.fillColor('#475569').text(`${String(label).toUpperCase()}: `, { continued: true });
      document.fillColor('#0f172a').font('Helvetica').text(String(value), { continued: false });
      document.font('Helvetica-Bold');
    }
    document.moveDown(0.8);
  }

  const fields = entity === 'schemes'
    ? [
        ['Strand', record.strand],
        ['Sub-strand', record.subStrand],
        ['Learning outcomes', record.learningOutcomes],
        ['Learning experiences', record.learningExperiences],
        ['Resources', record.resources],
        ['Assessment', record.assessment]
      ]
    : [
        ['Curriculum focus', [
          record.strand ? `Strand: ${record.strand}` : '',
          record.subStrand ? `Sub-strand: ${record.subStrand}` : ''
        ].filter(Boolean).join('\n')],
        ['Lesson objectives', record.lessonObjectives],
        ['Teaching & learning activities', record.learningActivities],
        ['Learning resources', record.resources],
        ['Assessment / evidence of learning', record.assessment],
        ['Reflection / follow-up', record.reflection]
      ];
  const columnGap = 12;
  const columnWidth = (contentWidth - columnGap) / 2;
  const pageBottom = document.page.height - 64;
  const sectionData = fields.map(([label, rawValue]) => {
    const value = String(rawValue ?? '').trim() || '—';
    document.font('Helvetica').fontSize(10);
    const columnBodyHeight = document.heightOfString(value, {
      width: columnWidth - 24,
      lineGap: 3
    });
    return {
      label,
      value,
      columnBodyHeight,
      compact: value.length <= 240 && columnBodyHeight <= 72
    };
  });

  const drawCard = (section, x, y, width, height) => {
    document.save();
    document.roundedRect(x, y, width, height, 6)
      .fillAndStroke('#f8fafc', '#dbe5ee');
    document.roundedRect(x, y, width, 25, 5).fill('#e0f2fe');
    document.rect(x, y + 3, 4, 19).fill('#0891b2');
    document.fillColor('#075985').font('Helvetica-Bold').fontSize(9)
      .text(String(section.label).toUpperCase(), x + 12, y + 8, {
        width: width - 24,
        ellipsis: true
      });
    document.fillColor('#1e293b').font('Helvetica').fontSize(10)
      .text(section.value, x + 12, y + 33, {
        width: width - 24,
        height: height - 41,
        lineGap: 3,
        ellipsis: true
      });
    document.restore();
  };

  const moveToNewPage = () => {
    document.addPage();
    document.y = 25 + 66 + 16;
  };

  for (let index = 0; index < sectionData.length;) {
    const section = sectionData[index];
    if (section.compact && sectionData[index + 1]?.compact) {
      const next = sectionData[index + 1];
      const cardHeight = Math.max(section.columnBodyHeight, next.columnBodyHeight) + 45;
      if (document.y + cardHeight > pageBottom) moveToNewPage();
      const rowY = document.y;
      drawCard(section, 42, rowY, columnWidth, cardHeight);
      drawCard(next, 42 + columnWidth + columnGap, rowY, columnWidth, cardHeight);
      document.y = rowY + cardHeight + 12;
      index += 2;
      continue;
    }

    if (section.compact) {
      const cardHeight = section.columnBodyHeight + 45;
      if (document.y + cardHeight > pageBottom) moveToNewPage();
      const rowY = document.y;
      drawCard(section, 42, rowY, contentWidth, cardHeight);
      document.y = rowY + cardHeight + 12;
      index += 1;
      continue;
    }

    const fullBodyWidth = contentWidth - 24;
    document.font('Helvetica').fontSize(10);
    const fullBodyHeight = document.heightOfString(section.value, {
      width: fullBodyWidth,
      lineGap: 3
    });
    const sectionHeight = fullBodyHeight + 45;
    const availableHeight = pageBottom - document.y;
    const fullPageStart = 25 + 66 + 16;
    const fullPageHeight = pageBottom - fullPageStart;
    if (availableHeight < 58 || (sectionHeight <= fullPageHeight && sectionHeight > availableHeight)) {
      moveToNewPage();
    }
    const sectionY = document.y;
    document.save();
    document.roundedRect(42, sectionY, contentWidth, 25, 5).fill('#e0f2fe');
    document.rect(42, sectionY + 3, 4, 19).fill('#0891b2');
    document.fillColor('#075985').font('Helvetica-Bold').fontSize(9)
      .text(String(section.label).toUpperCase(), 55, sectionY + 8, {
        width: contentWidth - 26,
        ellipsis: true
      });
    document.restore();
    document.y = sectionY + 33;
    document.fillColor('#1e293b').font('Helvetica').fontSize(10)
      .text(section.value, 54, document.y, { width: fullBodyWidth, lineGap: 3 });
    document.moveDown(0.5);
    index += 1;
  }

  const pageRange = document.bufferedPageRange();
  for (let index = pageRange.start; index < pageRange.start + pageRange.count; index += 1) {
    document.switchToPage(index);
    document.strokeColor('#e2e8f0').moveTo(42, document.page.height - 60)
      .lineTo(pageWidth - 42, document.page.height - 60).stroke();
    document.fillColor('#64748b').font('Helvetica').fontSize(8)
      .text(`${teacherName}  |  ${entity === 'schemes' ? 'Scheme of Work' : 'Lesson Plan'}`, 42, document.page.height - 52);
    document.text(`Page ${index + 1} of ${pageRange.count}`, pageWidth - 130, document.page.height - 52, {
      width: 88,
      align: 'right'
    });
  }
  document.end();
});

export const downloadTeacherPlanningPdf = async (req, res) => {
  const { entity, id } = req.params;
  if (!['schemes', 'lessons'].includes(entity)) {
    return res.status(404).json({ message: 'Planning record not found.' });
  }
  if (!isRecordId(id)) return res.status(400).json({ message: 'Invalid planning record ID.' });

  try {
    const record = await getTeacherPlanningRecord({ entity, teacherId: req.user.id, id });
    if (!record) return res.status(404).json({ message: 'Planning record not found.' });
    const hasAccess = await hasTeacherPlanningPdfAccess({
      schoolId: req.user.schoolId,
      initiatedBy: req.user.id,
      academicYear: record.academicYear,
      term: record.term,
      subject: record.subject
    });
    if (!hasAccess) {
      return res.status(402).json({
        code: 'PLANNING_PDF_PAYMENT_REQUIRED',
        message: 'Pay KES 1 to unlock planning PDF downloads for this subject and term.'
      });
    }

    const pdf = await createPlanningPdf({
      entity,
      record,
      teacherName: String(req.user.name || 'Teacher')
    });
    const filename = `planning-${entity}-${record.grade}-${record.subject}-${record.academicYear}-${record.term}`
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || `planning-${entity}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    console.error(`Failed to generate teacher ${entity} PDF:`, error);
    return res.status(500).json({ message: 'Could not generate the planning PDF.' });
  }
};

const splitPlanningItems = value => String(value ?? '')
  .split(/\r?\n/)
  .map(item => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
  .filter(Boolean);

export const createSchemeLessonDraftHandler = ({
  getRecord = getTeacherPlanningRecord,
  logger = console
} = {}) => async (req, res) => {
  const { id } = req.params;
  if (!isRecordId(id)) return res.status(400).json({ message: 'Invalid scheme ID.' });
  const lessonsPerWeek = Number(req.body?.lessonsPerWeek);
  if (!Number.isInteger(lessonsPerWeek) || lessonsPerWeek < 1 || lessonsPerWeek > 20) {
    return res.status(400).json({ message: 'Lessons per week must be between 1 and 20.' });
  }

  try {
    const scheme = await getRecord({ entity: 'schemes', teacherId: req.user.id, id });
    if (!scheme) return res.status(404).json({ message: 'Scheme of work not found.' });
    const outcomes = splitPlanningItems(scheme.learningOutcomes);
    const experiences = splitPlanningItems(scheme.learningExperiences);
    const lessons = Array.from({ length: lessonsPerWeek }, (_, index) => ({
      schemeId: scheme.id,
      academicYear: scheme.academicYear,
      term: scheme.term,
      grade: scheme.grade,
      subject: scheme.subject,
      weekNumber: scheme.weekNumber,
      lessonNumber: index + 1,
      topic: scheme.subStrand || scheme.strand || scheme.subject,
      strand: scheme.strand,
      subStrand: scheme.subStrand,
      lessonObjectives: outcomes.length ? outcomes[index % outcomes.length] : '',
      learningActivities: experiences.length ? experiences[index % experiences.length] : '',
      resources: scheme.resources,
      assessment: scheme.assessment,
      reflection: ''
    }));

    return res.json({
      draft: {
        scheme: {
          id: scheme.id,
          academicYear: scheme.academicYear,
          term: scheme.term,
          grade: scheme.grade,
          subject: scheme.subject,
          weekNumber: scheme.weekNumber,
          strand: scheme.strand,
          subStrand: scheme.subStrand
        },
        lessons
      }
    });
  } catch (error) {
    logger.error('Failed to create lesson drafts from scheme:', error);
    return res.status(500).json({ message: 'Could not create lesson drafts from this scheme.' });
  }
};

export const createTeacherPlanningController = ({
  listRecords = listTeacherPlanningRecords,
  createRecord = createTeacherPlanningRecord,
  updateRecord = updateTeacherPlanningRecord,
  deleteRecord = deleteTeacherPlanningRecord,
  getRecord = getTeacherPlanningRecord,
  getTeachingWeeks = getTeachingWeeksForTerm,
  logger = console
} = {}) => {
  const createHandlers = (entity) => ({
    list: async (req, res) => {
      try {
        const records = await listRecords({ entity, teacherId: req.user.id });
        return res.json({ records });
      } catch (error) {
        logger.error(`Failed to list teacher ${entity}:`, error);
        return res.status(500).json({ message: 'Could not load planning records.' });
      }
    },
    create: async (req, res) => {
      const record = normalizeRecord(entity, req.body);
      const errors = validateRecord(entity, record);
      if (errors.length) return res.status(400).json({ message: errors[0], errors });

      try {
        if (entity === 'lessons' && record.schemeId) {
          const scheme = await getRecord({
            entity: 'schemes',
            teacherId: req.user.id,
            id: record.schemeId
          });
          if (!scheme) return res.status(404).json({ message: 'Linked scheme not found.' });
          if (scheme.weekNumber !== record.weekNumber
            || scheme.grade !== record.grade
            || scheme.subject !== record.subject
            || scheme.term !== record.term
            || scheme.academicYear !== record.academicYear) {
            return res.status(400).json({ message: 'Lesson details must match the linked scheme week.' });
          }
        }
        if (entity === 'schemes' || record.weekNumber !== null) {
          const teachingWeeks = await getTeachingWeeks(record.term);
          if (!Number.isInteger(teachingWeeks)) {
            return res.status(503).json({ message: 'Teaching-week settings are unavailable. Try again later.' });
          }
          if (record.weekNumber > teachingWeeks) {
            return res.status(400).json({ message: `Week number must be between 1 and ${teachingWeeks} for ${record.term}.` });
          }
        }
        const savedRecord = await createRecord({ entity, teacherId: req.user.id, record });
        return res.status(201).json({ record: savedRecord });
      } catch (error) {
        logger.error(`Failed to create teacher ${entity}:`, error);
        return res.status(500).json({ message: 'Could not save the planning record.' });
      }
    },
    update: async (req, res) => {
      if (!isRecordId(req.params.id)) return res.status(400).json({ message: 'Invalid record ID.' });
      const record = normalizeRecord(entity, req.body);
      const errors = validateRecord(entity, record);
      if (errors.length) return res.status(400).json({ message: errors[0], errors });

      try {
        if (entity === 'lessons' && record.schemeId) {
          const scheme = await getRecord({
            entity: 'schemes',
            teacherId: req.user.id,
            id: record.schemeId
          });
          if (!scheme) return res.status(404).json({ message: 'Linked scheme not found.' });
          if (scheme.weekNumber !== record.weekNumber
            || scheme.grade !== record.grade
            || scheme.subject !== record.subject
            || scheme.term !== record.term
            || scheme.academicYear !== record.academicYear) {
            return res.status(400).json({ message: 'Lesson details must match the linked scheme week.' });
          }
        }
        if (entity === 'schemes' || record.weekNumber !== null) {
          const teachingWeeks = await getTeachingWeeks(record.term);
          if (!Number.isInteger(teachingWeeks)) {
            return res.status(503).json({ message: 'Teaching-week settings are unavailable. Try again later.' });
          }
          if (record.weekNumber > teachingWeeks) {
            return res.status(400).json({ message: `Week number must be between 1 and ${teachingWeeks} for ${record.term}.` });
          }
        }
        const savedRecord = await updateRecord({
          entity,
          teacherId: req.user.id,
          id: req.params.id,
          record
        });
        if (!savedRecord) return res.status(404).json({ message: 'Planning record not found.' });
        return res.json({ record: savedRecord });
      } catch (error) {
        logger.error(`Failed to update teacher ${entity}:`, error);
        return res.status(500).json({ message: 'Could not update the planning record.' });
      }
    },
    remove: async (req, res) => {
      if (!isRecordId(req.params.id)) return res.status(400).json({ message: 'Invalid record ID.' });
      try {
        const deleted = await deleteRecord({ entity, teacherId: req.user.id, id: req.params.id });
        if (!deleted) return res.status(404).json({ message: 'Planning record not found.' });
        return res.status(204).end();
      } catch (error) {
        logger.error(`Failed to delete teacher ${entity}:`, error);
        return res.status(500).json({ message: 'Could not delete the planning record.' });
      }
    }
  });

  return {
    schemes: createHandlers('schemes'),
    lessons: createHandlers('lessons')
  };
};

const handlers = createTeacherPlanningController();
export const schemeOfWorkHandlers = handlers.schemes;
export const lessonPlanHandlers = handlers.lessons;

const weekSchema = {
  type: 'OBJECT',
  properties: {
    weekNumber: { type: 'INTEGER' },
    isBreak: { type: 'BOOLEAN' },
    strand: { type: 'STRING' },
    subStrand: { type: 'STRING' },
    learningOutcomes: { type: 'STRING' },
    learningExperiences: { type: 'STRING' },
    resources: { type: 'STRING' },
    assessment: { type: 'STRING' }
  },
  required: [
    'weekNumber', 'isBreak', 'strand', 'subStrand', 'learningOutcomes',
    'learningExperiences', 'resources', 'assessment'
  ],
  propertyOrdering: [
    'weekNumber', 'isBreak', 'strand', 'subStrand', 'learningOutcomes',
    'learningExperiences', 'resources', 'assessment'
  ]
};

const lessonPlanSchema = {
  type: 'OBJECT',
  properties: {
    topic: { type: 'STRING' },
    lessonObjectives: { type: 'STRING' },
    learningActivities: { type: 'STRING' },
    resources: { type: 'STRING' },
    assessment: { type: 'STRING' }
  },
  required: ['topic', 'lessonObjectives', 'learningActivities', 'resources', 'assessment'],
  propertyOrdering: ['topic', 'lessonObjectives', 'learningActivities', 'resources', 'assessment']
};

export const isTeacherTermAiEnabled = (env = process.env) => (
  env.TEACHER_TERM_AI_ENABLED === 'true'
  && env.TEACHER_TERM_AI_ELIGIBILITY_APPROVED === 'true'
  && Boolean(env.GEMINI_API_KEY?.trim())
);

export const generateGeminiTermScheme = async ({
  grade,
  subject,
  term,
  weeksInTerm,
  breakWeeks,
  curriculumUnits,
  fetchImpl = fetch,
  env = process.env
}) => {
  if (!isTeacherTermAiEnabled(env)) {
    const error = new Error('AI term planning is not enabled.');
    error.code = 'TERM_AI_DISABLED';
    throw error;
  }

  const model = env.GEMINI_TERM_MODEL || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY.trim()
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: [
            'You are drafting a Kenyan CBC teacher scheme of work.',
            'Use only the supplied verified curriculum units; do not invent curriculum requirements or add learner data.',
            'Distribute and sequence the supplied units progressively across the term.',
            'Return exactly one item for every numbered week.',
            'For a break week, set isBreak to true and all text fields to empty strings.',
            'For a teaching week, provide concise, actionable, age-appropriate outcomes, learning experiences, resources, and assessment grounded in the supplied unit content.',
            'The result is a teacher-review draft, not an official curriculum document.'
          ].join(' ')
        }]
      },
      contents: [{
        role: 'user',
        parts: [{
          text: JSON.stringify({
            grade,
            subject,
            term,
            weeksInTerm,
            breakWeeks,
            curriculumUnits: curriculumUnits.map(unit => ({
              strand: unit.strand,
              subStrand: unit.subStrand,
              learningOutcomes: unit.specificLearningOutcomes,
              suggestedLearningExperiences: unit.suggestedLearningExperiences,
              resources: unit.resources,
              assessmentGuidance: unit.assessmentGuidance
            }))
          })
        }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            weeklyPlan: {
              type: 'ARRAY',
              items: weekSchema
            }
          },
          required: ['weeklyPlan'],
          propertyOrdering: ['weeklyPlan']
        }
      }
    })
  });

  if (!response.ok) {
    const error = new Error(`Gemini request failed with status ${response.status}.`);
    error.code = 'TERM_AI_PROVIDER_FAILURE';
    throw error;
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim();
  if (!text) {
    const error = new Error('Gemini returned no term plan.');
    error.code = 'TERM_AI_INVALID_RESPONSE';
    throw error;
  }

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.weeklyPlan)) throw new Error('weeklyPlan is missing.');
    return parsed.weeklyPlan;
  } catch (cause) {
    const error = new Error('Gemini returned an invalid term plan.');
    error.code = 'TERM_AI_INVALID_RESPONSE';
    error.cause = cause;
    throw error;
  }
};

export const generateGeminiLessonPlan = async ({
  grade,
  subject,
  term,
  weekNumber,
  weekPlan,
  fetchImpl = fetch,
  env = process.env
}) => {
  if (!isTeacherTermAiEnabled(env)) {
    const error = new Error('AI lesson planning is not enabled.');
    error.code = 'TERM_AI_DISABLED';
    throw error;
  }

  const model = env.GEMINI_TERM_MODEL || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY.trim()
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: [
            'You are drafting one Kenyan CBC teacher lesson plan using only the supplied saved scheme of work week.',
            'Keep the lesson objectives aligned to that week’s learning outcomes.',
            'Build practical, age-appropriate learning activities from the week’s learning experiences.',
            'Use only the supplied resources and assessment guidance; do not invent curriculum requirements or claim unsupported facts.',
            'Return one lesson only. The teacher will review and edit this draft before use.'
          ].join(' ')
        }]
      },
      contents: [{
        role: 'user',
        parts: [{
          text: JSON.stringify({ grade, subject, term, weekNumber, schemeWeek: weekPlan })
        }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { lessonPlan: lessonPlanSchema },
          required: ['lessonPlan'],
          propertyOrdering: ['lessonPlan']
        }
      }
    })
  });

  if (!response.ok) {
    const error = new Error(`Gemini request failed with status ${response.status}.`);
    error.code = 'TERM_AI_PROVIDER_FAILURE';
    throw error;
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim();
  if (!text) {
    const error = new Error('Gemini returned no lesson plan.');
    error.code = 'TERM_AI_INVALID_RESPONSE';
    throw error;
  }

  try {
    const parsed = JSON.parse(text);
    const lesson = parsed.lessonPlan;
    const limits = {
      topic: 250,
      lessonObjectives: 4000,
      learningActivities: 4000,
      resources: 2000,
      assessment: 3000
    };
    if (!lesson || Object.entries(limits).some(([field, limit]) => (
      typeof lesson[field] !== 'string'
      || !lesson[field].trim()
      || lesson[field].length > limit
    ))) {
      throw new Error('Lesson plan fields are missing or invalid.');
    }
    return Object.fromEntries(Object.keys(limits).map(field => [field, lesson[field].trim()]));
  } catch (cause) {
    const error = new Error('Gemini returned an invalid lesson plan.');
    error.code = 'TERM_AI_INVALID_RESPONSE';
    error.cause = cause;
    throw error;
  }
};

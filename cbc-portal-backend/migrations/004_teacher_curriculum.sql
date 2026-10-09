CREATE TABLE IF NOT EXISTS cbc_curriculum_units (
  id TEXT PRIMARY KEY,
  grade TEXT NOT NULL,
  subject TEXT NOT NULL,
  strand TEXT NOT NULL,
  sub_strand TEXT NOT NULL,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  specific_learning_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_inquiry_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  core_competencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  curriculum_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  pertinent_contemporary_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_learning_experiences JSONB NOT NULL DEFAULT '[]'::jsonb,
  resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  assessment_guidance JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (grade, subject, strand, sub_strand, source_revision)
);

CREATE INDEX IF NOT EXISTS cbc_curriculum_units_lookup_idx
  ON cbc_curriculum_units (grade, subject, strand, sequence_number);

CREATE TABLE IF NOT EXISTS teacher_planning_term_lengths (
  term TEXT PRIMARY KEY CHECK (term IN ('Term 1', 'Term 2', 'Term 3')),
  teaching_weeks INTEGER NOT NULL CHECK (teaching_weeks BETWEEN 1 AND 52),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO teacher_planning_term_lengths (term, teaching_weeks)
VALUES ('Term 1', 13), ('Term 2', 14), ('Term 3', 9)
ON CONFLICT (term) DO NOTHING;

CREATE TABLE IF NOT EXISTS teacher_schemes_of_work (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  academic_year INTEGER NOT NULL CHECK (academic_year BETWEEN 2000 AND 2200),
  term TEXT NOT NULL CHECK (term IN ('Term 1', 'Term 2', 'Term 3')),
  grade TEXT NOT NULL,
  subject TEXT NOT NULL,
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 52),
  strand TEXT NOT NULL DEFAULT '',
  sub_strand TEXT NOT NULL DEFAULT '',
  learning_outcomes TEXT NOT NULL DEFAULT '',
  learning_experiences TEXT NOT NULL DEFAULT '',
  resources TEXT NOT NULL DEFAULT '',
  assessment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teacher_schemes_of_work_owner_idx
  ON teacher_schemes_of_work (teacher_id, academic_year DESC, term, grade, subject, week_number);

CREATE TABLE IF NOT EXISTS teacher_lesson_plans (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  lesson_date DATE,
  academic_year INTEGER NOT NULL CHECK (academic_year BETWEEN 2000 AND 2200),
  term TEXT NOT NULL CHECK (term IN ('Term 1', 'Term 2', 'Term 3')),
  grade TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  strand TEXT NOT NULL DEFAULT '',
  sub_strand TEXT NOT NULL DEFAULT '',
  lesson_objectives TEXT NOT NULL,
  learning_activities TEXT NOT NULL,
  resources TEXT NOT NULL DEFAULT '',
  assessment TEXT NOT NULL DEFAULT '',
  reflection TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teacher_lesson_plans_owner_date_idx
  ON teacher_lesson_plans (teacher_id, lesson_date DESC, academic_year DESC, term);

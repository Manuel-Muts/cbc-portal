ALTER TABLE teacher_lesson_plans
  ADD COLUMN IF NOT EXISTS scheme_id TEXT
    REFERENCES teacher_schemes_of_work(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS teacher_lesson_plans_scheme_idx
  ON teacher_lesson_plans (scheme_id, week_number, lesson_number)
  WHERE scheme_id IS NOT NULL;

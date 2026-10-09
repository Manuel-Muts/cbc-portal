ALTER TABLE teacher_lesson_plans
  ADD COLUMN IF NOT EXISTS week_number INTEGER
    CHECK (week_number IS NULL OR week_number BETWEEN 1 AND 52),
  ADD COLUMN IF NOT EXISTS lesson_number INTEGER
    CHECK (lesson_number IS NULL OR lesson_number BETWEEN 1 AND 20);

CREATE INDEX IF NOT EXISTS teacher_lesson_plans_owner_week_idx
  ON teacher_lesson_plans (teacher_id, academic_year DESC, term, grade, subject, week_number, lesson_number);

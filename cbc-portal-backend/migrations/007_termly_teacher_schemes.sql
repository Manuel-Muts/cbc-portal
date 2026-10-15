ALTER TABLE teacher_schemes_of_work
  ADD COLUMN IF NOT EXISTS scheme_type TEXT NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS weeks_in_term INTEGER,
  ADD COLUMN IF NOT EXISTS break_weeks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS weekly_plan JSONB,
  ADD COLUMN IF NOT EXISTS curriculum_sources JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE teacher_schemes_of_work
  ALTER COLUMN week_number DROP NOT NULL;

ALTER TABLE teacher_schemes_of_work
  DROP CONSTRAINT IF EXISTS teacher_schemes_of_work_week_number_check;

ALTER TABLE teacher_schemes_of_work
  ADD CONSTRAINT teacher_schemes_of_work_type_fields_check CHECK (
    (scheme_type = 'weekly' AND week_number BETWEEN 1 AND 52
      AND weeks_in_term IS NULL AND weekly_plan IS NULL)
    OR
    (scheme_type = 'termly' AND week_number IS NULL
      AND weeks_in_term BETWEEN 1 AND 24
      AND break_weeks IS NOT NULL
      AND jsonb_typeof(break_weeks) = 'array'
      AND weekly_plan IS NOT NULL
      AND jsonb_typeof(weekly_plan) = 'array')
  );

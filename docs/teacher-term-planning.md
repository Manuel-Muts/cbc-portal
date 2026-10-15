# Teacher term schemes

Schemes of Work are created as term plans. A teacher sets the term length and comma-separated break week numbers, then can either prepare editable week sections manually or request an AI first draft. Existing weekly schemes stay editable and available to view and export.

Lesson-plan creation starts from a saved Scheme of Work. The teacher selects a teaching week, and the backend loads that teacher-owned scheme and generates one editable lesson plan using only the selected week's saved outcomes, learning experiences, resources, and assessment guidance. Break weeks cannot be selected. Lesson generation uses the same optional Gemini feature gate as term-scheme generation; it does not accept scheme content from the browser as generation source data.

## Database

Apply the teacher curriculum migrations before deploying the updated backend:

```sh
cd cbc-portal-backend
npm run migrate:teacher-curriculum
```

Migration `007_termly_teacher_schemes.sql` adds term-level storage. Migration `008_clear_legacy_teacher_planning.sql` intentionally deletes all pre-termly lesson plans and weekly schemes as requested; newly created termly schemes are preserved. Apply migrations before deploying the new teacher planning interface. This cleanup is permanent and should only be run against the intended application database.

## Optional Gemini prototype

AI generation is **off by default**. Manual term planning and saving do not require Gemini. Term-scheme and saved-scheme lesson generation can only be activated when all three backend environment settings are provided:

- `GEMINI_API_KEY` — keep this secret on the backend; never place it in frontend configuration.
- `TEACHER_TERM_AI_ENABLED=true`
- `TEACHER_TERM_AI_ELIGIBILITY_APPROVED=true`
- Optional: `GEMINI_TERM_MODEL` (defaults to `gemini-2.5-flash`).

Do not set the two approval/enable flags until the school has reviewed current provider terms and confirmed that using this provider for this teacher-only function is eligible. Teacher sign-in and age do not by themselves determine whether the provider considers the wider school portal to be directed to or likely accessed by under-18s.

When enabled, generation is limited to authenticated teacher roles and rate-limited. Term-scheme generation sends the selected grade, subject, term, requested term/break weeks, and verified curriculum unit content. Lesson-plan generation sends the grade, subject, term, selected week number, and that week’s content loaded from the teacher’s saved scheme. Neither request includes teacher identity or learner records. Model output is schema-checked and remains an editable draft requiring teacher review; it is not presented as official curriculum guidance.

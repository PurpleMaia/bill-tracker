ALTER TABLE bill_versions
  ADD COLUMN summary_prompt_version text,
  ADD COLUMN summary_generated_at   timestamptz;

ALTER TABLE committee_reports
  ADD COLUMN summary_prompt_version text,
  ADD COLUMN summary_generated_at   timestamptz;

-- Grandfather summaries that predate provenance tracking so they are served as
-- cache hits and never re-billed. 'v0' means "written by an unknown prompt".
UPDATE bill_versions
   SET summary_prompt_version = 'v0'
 WHERE ai_summary IS NOT NULL;

UPDATE committee_reports
   SET summary_prompt_version = 'v0'
 WHERE ai_summary IS NOT NULL;

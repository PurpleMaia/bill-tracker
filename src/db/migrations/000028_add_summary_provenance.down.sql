ALTER TABLE bill_versions
  DROP COLUMN summary_prompt_version,
  DROP COLUMN summary_generated_at;

ALTER TABLE committee_reports
  DROP COLUMN summary_prompt_version,
  DROP COLUMN summary_generated_at;

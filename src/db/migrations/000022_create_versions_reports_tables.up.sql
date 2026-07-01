

CREATE TABLE bill_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  label       text NOT NULL,
  html_link   text,
  pdf_link    text,
  original_text    text,
  ai_summary  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),r
  UNIQUE (bill_id, label)
);

CREATE TABLE committee_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  label       text NOT NULL,
  report_code text,
  html_link   text,
  pdf_link    text,
  original_text    text,
  ai_summary  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (bill_id, label)
);

CREATE INDEX idx_bill_versions_bill_id ON bill_versions(bill_id);
CREATE INDEX idx_committee_reports_bill_id ON committee_reports(bill_id);


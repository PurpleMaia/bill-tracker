

CREATE TABLE IF NOT EXISTS committees (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    acronym     text NOT NULL UNIQUE,
    name        text NOT NULL,
    chamber     text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS committee_chairs (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    committee_id   uuid NOT NULL REFERENCES committees (id) ON DELETE CASCADE,
    legislator_id  uuid NOT NULL REFERENCES legislators (id),
    role           text NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    started_at  timestamptz NOT NULL DEFAULT now(),
    ended_at    timestamptz,
    created_at     timestamptz DEFAULT now(),
    updated_at     timestamptz DEFAULT now(),
    CONSTRAINT committee_chairs_role_check CHECK (role IN ('chair', 'vice_chair'))
    );

-- "which committees does this legislator chair" is the common reverse lookup.
CREATE INDEX IF NOT EXISTS committee_chairs_legislator_id_idx
    ON committee_chairs (legislator_id);

CREATE INDEX IF NOT EXISTS committee_chairs_committee_id_idx
    ON committee_chairs (committee_id);

CREATE UNIQUE INDEX committee_chairs_active_unique
    ON committee_chairs (committee_id, legislator_id, role)
    WHERE is_active;
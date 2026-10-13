-- Imported events often don't say what they cost. NULL = unknown (the UI says "see listing")
-- so a paid concert never shows up as "Free". 0 still means free.
ALTER TABLE events ALTER COLUMN price_cents DROP NOT NULL;
ALTER TABLE events ALTER COLUMN price_cents DROP DEFAULT;

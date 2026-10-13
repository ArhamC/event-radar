-- Who an event suits: going alone, going with a group, or either.
-- Its own column rather than a vibe tag so the filter can treat 'both' as matching either choice.
ALTER TABLE events
  ADD COLUMN good_for TEXT NOT NULL DEFAULT 'both'
    CHECK (good_for IN ('solo', 'group', 'both'));

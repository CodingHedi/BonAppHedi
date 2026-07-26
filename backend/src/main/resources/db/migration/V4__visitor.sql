-- Anonymous visitors, for rating and reaction dedupe.
--
-- rating and reaction have carried a visitor_id since V1 (ADR 0002) without
-- anything to issue one. This is that: a row per cookie, created the first time
-- somebody writes and never on a plain page view, which is what keeps it a
-- functional cookie rather than one needing a consent banner.
--
-- The fingerprint is a salted HMAC of address and user agent, never the address
-- itself - the privacy page states that no raw IP is stored, and this is the
-- table that has to honour it. It exists only to notice one person clearing
-- cookies to vote repeatedly, which a per-cookie unique constraint cannot see.

CREATE TABLE visitor (
    -- The cookie value. Opaque, random, and meaningless off this table.
    id          TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

-- Counting cookies per fingerprint is the only query this table serves.
CREATE INDEX ix_visitor_fingerprint ON visitor (fingerprint);

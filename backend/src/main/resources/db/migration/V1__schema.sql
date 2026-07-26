-- Schema, shaped to match core/api/models.ts on the frontend.
--
-- The contract was written first and the mock services implement it, so this
-- file satisfies the contract rather than defining it (ADR 0001). Anything that
-- disagrees with models.ts is a bug here, not there.
--
-- SQLite facts this file is written around (ADR 0002):
--   * booleans are INTEGER 0/1 - there is no boolean type
--   * CHECK constraints are the only real validation, because typing is dynamic
--   * there is no ALTER COLUMN, so every later migration is additive
--   * ON DELETE CASCADE only works when foreign_keys=on is set per connection,
--     which the JDBC URL does

-- --- People -----------------------------------------------------------------

CREATE TABLE author (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT NOT NULL UNIQUE,
    -- A proper noun. Never translated, so it does not live on the translation.
    display_name TEXT NOT NULL,
    avatar_url   TEXT
);

CREATE TABLE author_translation (
    author_id INTEGER NOT NULL REFERENCES author (id) ON DELETE CASCADE,
    locale    TEXT NOT NULL CHECK (locale IN ('fr', 'en')),
    bio       TEXT,
    PRIMARY KEY (author_id, locale)
);

-- --- Tags -------------------------------------------------------------------

CREATE TABLE tag (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Language-neutral identity. The slug is per-locale and lives below.
    key           TEXT NOT NULL UNIQUE,
    color_variant TEXT NOT NULL CHECK (color_variant IN ('accent', 'accent2'))
);

CREATE TABLE tag_translation (
    tag_id INTEGER NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('fr', 'en')),
    slug   TEXT NOT NULL,
    label  TEXT NOT NULL,
    PRIMARY KEY (tag_id, locale)
);

CREATE UNIQUE INDEX ux_tag_translation_slug ON tag_translation (locale, slug);

-- --- Recipes ----------------------------------------------------------------

CREATE TABLE recipe (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    key              TEXT NOT NULL UNIQUE,
    author_id        INTEGER NOT NULL REFERENCES author (id),
    status           TEXT NOT NULL DEFAULT 'PUBLISHED'
                          CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    -- ISO-8601 UTC as TEXT. SQLite has no date type; storing the ISO string
    -- keeps it sortable lexicographically, which is what every query needs.
    published_at     TEXT NOT NULL,
    prep_minutes     INTEGER CHECK (prep_minutes IS NULL OR prep_minutes >= 0),
    cook_minutes     INTEGER CHECK (cook_minutes IS NULL OR cook_minutes >= 0),
    difficulty       INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
    base_servings    INTEGER NOT NULL CHECK (base_servings >= 1),
    youtube_video_id TEXT,
    -- Position in the hero carousel. NULL means not featured.
    featured_rank    INTEGER
);

CREATE INDEX ix_recipe_status ON recipe (status, published_at DESC);

CREATE TABLE recipe_translation (
    recipe_id     INTEGER NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    locale        TEXT NOT NULL CHECK (locale IN ('fr', 'en')),
    slug          TEXT NOT NULL,
    title         TEXT NOT NULL,
    excerpt       TEXT NOT NULL DEFAULT '',
    -- The hero copy is deliberately longer than the card excerpt.
    hero_kicker   TEXT,
    hero_excerpt  TEXT,
    body_markdown TEXT NOT NULL DEFAULT '',
    -- Rendered and sanitized on write, so a read is a column select rather than
    -- a markdown parse on every request.
    body_html     TEXT NOT NULL DEFAULT '',
    -- Title, excerpt, tag labels and ingredient names concatenated, so the
    -- browser can search ingredients without the list endpoint shipping every
    -- ingredient row for every card.
    search_text   TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (recipe_id, locale)
);

-- A slug identifies one recipe within one language. The same string may exist
-- in both languages, and often does.
CREATE UNIQUE INDEX ux_recipe_translation_slug ON recipe_translation (locale, slug);

CREATE TABLE recipe_tag (
    recipe_id INTEGER NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, tag_id)
);

CREATE TABLE ingredient (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id     INTEGER NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    -- NULL for things like "salt and pepper, to taste" that have no quantity.
    base_quantity REAL,
    unit          TEXT NOT NULL DEFAULT '',
    -- 0 for anything that must not multiply with the serving count.
    scalable      INTEGER NOT NULL DEFAULT 1 CHECK (scalable IN (0, 1))
);

CREATE INDEX ix_ingredient_recipe ON ingredient (recipe_id, position);

CREATE TABLE ingredient_translation (
    ingredient_id INTEGER NOT NULL REFERENCES ingredient (id) ON DELETE CASCADE,
    locale        TEXT NOT NULL CHECK (locale IN ('fr', 'en')),
    name          TEXT NOT NULL,
    note          TEXT,
    PRIMARY KEY (ingredient_id, locale)
);

CREATE TABLE step (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id            INTEGER NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    position             INTEGER NOT NULL,
    duration_minutes     INTEGER,
    -- Offset into the recipe video, driving the (mm:ss) jump links.
    video_offset_seconds INTEGER
);

CREATE INDEX ix_step_recipe ON step (recipe_id, position);

CREATE TABLE step_translation (
    step_id INTEGER NOT NULL REFERENCES step (id) ON DELETE CASCADE,
    locale  TEXT NOT NULL CHECK (locale IN ('fr', 'en')),
    body    TEXT NOT NULL,
    PRIMARY KEY (step_id, locale)
);

-- --- Identity ---------------------------------------------------------------

CREATE TABLE app_user (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    provider         TEXT NOT NULL CHECK (provider IN ('google', 'facebook')),
    provider_user_id TEXT NOT NULL,
    display_name     TEXT NOT NULL,
    email            TEXT,
    avatar_url       TEXT,
    -- Recomputed from the email allowlist on every login, so removing an
    -- address from the config actually demotes the account (ADR 0003).
    is_admin         INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
    created_at       TEXT NOT NULL,
    UNIQUE (provider, provider_user_id)
);

-- --- Social -----------------------------------------------------------------
--
-- Ratings and reactions are anonymous, so they are keyed by a visitor
-- fingerprint rather than by a user. The uniqueness constraints are what make
-- them idempotent: rating again is an UPDATE, and reacting twice cannot count
-- twice. That rule lives here rather than in application code, because it is
-- the one place it cannot be forgotten.

CREATE TABLE rating (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    created_at TEXT NOT NULL,
    UNIQUE (recipe_id, visitor_id)
);

CREATE TABLE reaction (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (recipe_id, visitor_id)
);

CREATE TABLE comment (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id     INTEGER NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    -- NULL once the author deletes their account; the comment survives them,
    -- which is why the display name is copied rather than joined.
    user_id       INTEGER REFERENCES app_user (id) ON DELETE SET NULL,
    display_name  TEXT NOT NULL,
    body_markdown TEXT NOT NULL,
    body_html     TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'PUBLISHED'
                       CHECK (status IN ('PUBLISHED', 'PENDING', 'REJECTED')),
    created_at    TEXT NOT NULL
);

CREATE INDEX ix_comment_recipe ON comment (recipe_id, status, created_at DESC);
CREATE INDEX ix_comment_status ON comment (status, created_at);

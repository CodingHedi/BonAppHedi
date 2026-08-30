-- Saved recipes, per account (ADR 16).
--
-- Anonymous readers keep their list in the browser and never reach this table;
-- signing in merges it here so it follows them to another device. The merge is
-- a union, which the UNIQUE pair below is what makes safe to repeat: pushing
-- the same list twice is an INSERT OR IGNORE and not a duplicate.
--
-- ON DELETE CASCADE on both sides, deliberately unlike comment.user_id, which
-- is ON DELETE SET NULL because a comment outlives its author and copies the
-- display name for exactly that reason. A bookmark must not outlive anybody:
-- it is private, it is meaningless without its owner, and deleting an account
-- has to take it. Both cascades are inert without foreign_keys=on in the JDBC
-- URL (ADR 2).
--
-- recipe_id rather than the key the API speaks, because a foreign key should
-- point at a primary key. Nothing outside this database needs to know it does.

CREATE TABLE bookmark (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE (recipe_id, user_id)
);

-- Listing one reader's bookmarks is the only query this table serves.
CREATE INDEX ix_bookmark_user ON bookmark (user_id);

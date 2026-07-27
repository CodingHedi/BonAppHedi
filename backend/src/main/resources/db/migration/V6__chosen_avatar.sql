-- An avatar chosen on this site, and the removal of the ones that were not.
--
-- ADR 7. A commenter's avatar was the picture URL the identity provider returned,
-- and the comment thread rendered it directly, so opening a recipe with signed
-- comments made the reader's browser request lh3.googleusercontent.com. That is
-- the one request the YouTube facade, the self-hosted fonts and the plain-link
-- share bar all exist to prevent.
--
-- What replaces it is a token naming an icon and a tint slot -- 'carrot/3' --
-- validated against a closed set in Avatar.java and drawn from the icon registry
-- the frontend already ships. Nothing is fetched and nothing is stored as bytes.

ALTER TABLE app_user ADD COLUMN avatar TEXT;

-- The rest of this file is the actual fix.
--
-- Adding a column and rendering from it would leave every URL already collected
-- sitting in the database, one careless template away from being served again.
-- Those URLs are personal data about people who never chose to give them to this
-- site, so the migration deletes them rather than orphaning them.
--
-- Cleared rather than dropped: SQLite before 3.35 has no DROP COLUMN, every
-- migration here from V1 on is additive, and a value that is NULL everywhere is
-- already unreadable. The empty columns go in their own change, once nothing
-- selects them.
UPDATE app_user SET avatar_url = NULL WHERE avatar_url IS NOT NULL;

-- comment.avatar_url, added in V5, held a copy per comment. The avatar is now
-- resolved through comment.user_id instead of copied, so this column is dead as
-- well as disclosing -- and the copies outnumber the accounts.
UPDATE comment SET avatar_url = NULL WHERE avatar_url IS NOT NULL;

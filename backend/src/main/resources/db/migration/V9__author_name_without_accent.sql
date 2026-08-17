-- The byline is written "Hedi", without the accent, to match the wordmark.
--
-- V2 seeds it with the accent and is deliberately left alone: it has run on the
-- production database, Flyway records its checksum, and editing an applied
-- migration stops the application booting at all. So the seed still writes
-- "Hédi" on a fresh database and this immediately corrects it, which is the
-- additive discipline the comment on `flyway.baseline-on-migrate` describes.
--
-- Idempotent by being an UPDATE with a WHERE: on a fresh database it changes the
-- row V2 just wrote, on the live one it changes the row that has been there
-- since July, and on a database where it has already run it matches nothing.

UPDATE author SET display_name = 'Hedi' WHERE slug = 'hedi';

-- Deliberately NOT touching app_user or comment.
--
-- `author` is the site's own byline - the "Par Hedi" under a recipe - and is
-- content. `app_user.display_name` is whatever Google last said the account is
-- called, so a rewrite here would be undone by the next sign-in; and the name
-- carried on a comment belongs to whoever wrote it. The profile page is the
-- supported way to change an account's name, and it already propagates that
-- change to past comments (see AuthApiTest).

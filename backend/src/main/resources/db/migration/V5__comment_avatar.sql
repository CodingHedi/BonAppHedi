-- The commenter's avatar, copied onto the comment.
--
-- Same reasoning as display_name one column over, and the same trade: a comment
-- outlives the account that wrote it (user_id is ON DELETE SET NULL), so joining
-- app_user for the picture would blank the avatar on every historical comment
-- the moment somebody deletes their account. Copying keeps the row telling the
-- whole story of who wrote it.
--
-- Additive, because SQLite has no ALTER COLUMN and every migration from V1 on
-- has to be. NULL is the norm: it is what a provider that sends no picture
-- gives, and what all four seeded comments have.

ALTER TABLE comment ADD COLUMN avatar_url TEXT;

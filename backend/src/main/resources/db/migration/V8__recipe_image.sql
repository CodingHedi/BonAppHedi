-- Photographs for recipes (ADR 8).
--
-- On the recipe rather than on recipe_translation: a photograph of a babka is a
-- photograph of a babka in both languages. Only the alt text is per-locale, and
-- that is already derived from the translated title rather than stored.
--
-- image_file is a BARE FILENAME, never a path. The serving side resolves it
-- against one directory and refuses anything that escapes, so a row can never
-- name `../../etc/passwd` however it got written. Storing a path would move that
-- guarantee into whatever wrote the row.
--
-- width and height are stored rather than measured on read: `image.ts` reserves
-- its box with aspect-ratio so a photograph costs zero layout shift, and it can
-- only do that if the dimensions arrive with the JSON rather than with the file.
--
-- image_dominant is the average colour, used to tint the box while the photo
-- loads so it fills in rather than flashing an empty panel.
ALTER TABLE recipe ADD COLUMN image_file TEXT;
ALTER TABLE recipe ADD COLUMN image_width INTEGER;
ALTER TABLE recipe ADD COLUMN image_height INTEGER;
ALTER TABLE recipe ADD COLUMN image_dominant TEXT;

-- The seeded photographs, which ship as classpath resources and are copied into
-- the image directory on startup if they are not already there. That is what
-- keeps a `-Fresh` database, a restored backup and a first deploy all showing
-- the same six photographs, and it is why these rows can name files that no
-- upload ever created.
--
-- Every one is CC0 or public domain; provenance is in Docs/photo-mockup.md.
UPDATE recipe SET image_file = 'babka-au-chocolat.jpg',
                  image_width = 1600, image_height = 738,  image_dominant = '#908271'
 WHERE key = 'babka';

UPDATE recipe SET image_file = 'chakchouka.jpg',
                  image_width = 1600, image_height = 1062, image_dominant = '#251c17'
 WHERE key = 'shakshuka';

UPDATE recipe SET image_file = 'pain-au-levain.jpg',
                  image_width = 1600, image_height = 1332, image_dominant = '#8d653c'
 WHERE key = 'sourdough';

UPDATE recipe SET image_file = 'cheesecake-basque.jpg',
                  image_width = 1205, image_height = 1600, image_dominant = '#8b796b'
 WHERE key = 'basque-cheesecake';

UPDATE recipe SET image_file = 'tajine-de-boeuf.jpg',
                  image_width = 1600, image_height = 1200, image_dominant = '#b6513c'
 WHERE key = 'beef-tagine';

UPDATE recipe SET image_file = 'jus-grenade-orange.jpg',
                  image_width = 1200, image_height = 1600, image_dominant = '#96857f'
 WHERE key = 'pomegranate-juice';

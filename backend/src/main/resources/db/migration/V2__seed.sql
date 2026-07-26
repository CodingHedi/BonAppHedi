-- Seed content, transcribed from frontend/src/app/mock/seed-data.ts.
--
-- That file is the source and this is the copy (ADR 0001). The milestone-1 e2e
-- suite is the acceptance test for the mock-to-API swap, and those specs assert
-- exact content: five published recipes, a babka rated 4.0 from one vote, a step
-- at 02:14, a "poivron" findable only through an ingredient name. Drift by one
-- row and the suite fails somewhere unrelated and blames the wrong thing.
--
-- French copy is final design text lifted from Docs/Design; English is a
-- translation written for this project. Neither is placeholder.
--
-- Dates are computed from the frontend's SEED_NOW (2026-07-25T12:00:00Z) so
-- "il y a 4 jours" renders identically on both sides.
--
-- IDs are explicit rather than left to AUTOINCREMENT. This file has to be
-- readable as a whole, and the foreign keys below are the only thing tying six
-- recipes to their sixty-odd translation rows.

-- --- Author -----------------------------------------------------------------

INSERT INTO author (id, slug, display_name, avatar_url) VALUES
    (1, 'hedi', 'Hédi', NULL);

INSERT INTO author_translation (author_id, locale, bio) VALUES
    (1, 'fr', 'Je cuisine, je note, je recommence.'),
    (1, 'en', 'I cook, I take notes, I start over.');

-- --- Tags -------------------------------------------------------------------
-- Colour assignment comes from the prototype: gluten and dessert are teal,
-- chocolat and mijoté are terracotta.

INSERT INTO tag (id, key, color_variant) VALUES
    (1, 'gluten', 'accent2'),
    (2, 'dessert', 'accent2'),
    (3, 'chocolate', 'accent'),
    (4, 'slow-cooked', 'accent');

INSERT INTO tag_translation (tag_id, locale, slug, label) VALUES
    (1, 'fr', 'gluten', 'gluten'),
    (1, 'en', 'gluten', 'gluten'),
    (2, 'fr', 'dessert', 'dessert'),
    (2, 'en', 'dessert', 'dessert'),
    (3, 'fr', 'chocolat', 'chocolat'),
    (3, 'en', 'chocolate', 'chocolate'),
    (4, 'fr', 'mijote', 'mijoté'),
    (4, 'en', 'slow-cooked', 'slow-cooked');

-- --- Recipes ----------------------------------------------------------------

INSERT INTO recipe (id, key, author_id, status, published_at, prep_minutes, cook_minutes,
                    difficulty, base_servings, youtube_video_id, featured_rank) VALUES
    -- The video is the Blender Foundation's "Big Buck Bunny": openly licensed
    -- and unmistakably not a cookery video, so nobody mistakes it for finished
    -- content. It exists so the facade and the step-timestamp jumps are
    -- exercisable end to end, and the step offsets fall inside its runtime.
    (1, 'babka',             1, 'PUBLISHED', '2026-07-21T12:00:00Z', 15,  45, 1, 2, 'YE7VzlLtp-4', 1),
    (2, 'shakshuka',         1, 'PUBLISHED', '2026-06-30T12:00:00Z', 10,  25, 1, 2, NULL, 2),
    (3, 'sourdough',         1, 'PUBLISHED', '2026-06-21T12:00:00Z', 30,  45, 3, 2, NULL, 3),
    (4, 'basque-cheesecake', 1, 'PUBLISHED', '2026-07-13T12:00:00Z', 20,  50, 2, 2, NULL, NULL),
    (5, 'beef-tagine',       1, 'PUBLISHED', '2026-07-07T12:00:00Z', 25, 150, 2, 2, NULL, NULL),
    -- Unpublished on purpose. A status nothing ever exercises is a claim in a
    -- type rather than a behaviour; this one makes "invisible to the public,
    -- editable in the admin area" observable.
    (6, 'pomegranate-juice', 1, 'DRAFT',     '2026-07-05T12:00:00Z', 10, NULL, 1, 2, NULL, NULL);

INSERT INTO recipe_tag (recipe_id, tag_id) VALUES
    (1, 3), (1, 2),
    (3, 1),
    (4, 2),
    (5, 4);

INSERT INTO recipe_translation (recipe_id, locale, slug, title, excerpt, hero_kicker, hero_excerpt, body_markdown) VALUES
    (1, 'fr', 'babka-au-chocolat', 'Babka au chocolat',
     'Une brioche tressée au marbrage caractéristique et à la garniture chocolatée généreuse.',
     'Recette du moment',
     'Une brioche tressée à la mie marbrée, généreusement garnie de chocolat fondant. Le genre de recette qui parfume toute la maison.',
     'La babka est une brioche tressée d''origine polonaise, reconnaissable à sa mie marbrée et à sa garniture généreuse de chocolat. On la tranche encore tiède, pour que le chocolat file un peu — c''est le meilleur moment.'),
    (1, 'en', 'chocolate-babka', 'Chocolate babka',
     'A braided loaf with its unmistakable marbling and a generous chocolate filling.',
     'Recipe of the moment',
     'A braided loaf with a marbled crumb, generously filled with melting chocolate. The kind of recipe that fills the whole house with its scent.',
     'Babka is a braided Polish loaf, recognisable by its marbled crumb and its generous chocolate filling. Slice it while still warm, so the chocolate pulls a little — that is the best moment.'),

    (2, 'fr', 'chakchouka', 'Chakchouka',
     'Un plat originaire d''Afrique du Nord et du Moyen-Orient. Simple, savoureux, et parfait à partager.',
     'Petit-déjeuner copieux',
     'Œufs pochés dans une sauce tomate épicée, un classique d''Afrique du Nord à partager au centre de la table.',
     'La chakchouka se mange à la poêle, posée au centre de la table, avec beaucoup de pain pour saucer. C''est un plat du matin autant que du soir.'),
    (2, 'en', 'shakshuka', 'Shakshuka',
     'A dish from North Africa and the Middle East. Simple, full of flavour, and made for sharing.',
     'A hearty breakfast',
     'Eggs poached in a spiced tomato sauce — a North African classic, shared straight from the middle of the table.',
     'Shakshuka is eaten straight from the pan, set down in the middle of the table, with plenty of bread for mopping. It belongs to the morning as much as the evening.'),

    (3, 'fr', 'pain-au-levain', 'Pain au levain',
     'Le pain est un aliment de base composé de farine, d''eau et de levure ou de levain, puis cuit au four.',
     'Boulangerie maison',
     'Croûte craquante, mie alvéolée : la base de tout bon garde-manger, prête en une nuit de patience.',
     'Rien de compliqué ici, seulement du temps. Le levain travaille pendant que vous dormez ; le reste n''est qu''une question de four bien chaud.'),
    (3, 'en', 'sourdough-bread', 'Sourdough bread',
     'Bread is a staple made from flour, water and yeast or a sourdough starter, then baked in the oven.',
     'Home baking',
     'Crackling crust, open crumb: the foundation of any good pantry, ready after one night of patience.',
     'Nothing complicated here, only time. The starter works while you sleep; the rest is a matter of a properly hot oven.'),

    (4, 'fr', 'cheesecake-basque', 'Cheesecake basque',
     'Un cheesecake volontairement brûlé en surface pour un cœur coulant et un goût de caramel.',
     NULL, NULL,
     'Le dessus doit être presque noir : c''est là que se trouve tout le goût. Le centre, lui, reste coulant.'),
    (4, 'en', 'basque-cheesecake', 'Basque cheesecake',
     'A cheesecake deliberately burnt on top, for a molten centre and a taste of caramel.',
     NULL, NULL,
     'The top should be almost black: that is where all the flavour is. The centre stays molten.'),

    (5, 'fr', 'tajine-de-boeuf', 'Tajine de bœuf',
     'Un mijoté fondant aux épices douces, aux abricots secs et aux amandes torréfiées.',
     NULL, NULL,
     'Un plat qui ne se presse pas. Plus il mijote longtemps, plus la viande se défait toute seule.'),
    (5, 'en', 'beef-tagine', 'Beef tagine',
     'A meltingly tender stew with warm spices, dried apricots and toasted almonds.',
     NULL, NULL,
     'A dish that refuses to be hurried. The longer it simmers, the more the meat falls apart on its own.'),

    (6, 'fr', 'jus-grenade-orange', 'Jus grenade & orange',
     'Un jus frais pressé minute, vibrant et acidulé, à servir bien frais au petit-déjeuner.',
     NULL, NULL,
     'À boire dans les dix minutes : passé ce délai, il perd tout son mordant.'),
    (6, 'en', 'pomegranate-orange-juice', 'Pomegranate & orange juice',
     'Freshly pressed to order, bright and sharp, best served well chilled at breakfast.',
     NULL, NULL,
     'Drink it within ten minutes: after that it loses all its bite.');

-- --- Ingredients ------------------------------------------------------------
-- position is 0-based, matching the order the frontend renders them in.

INSERT INTO ingredient (id, recipe_id, position, base_quantity, unit, scalable) VALUES
    -- babka
    (1,  1, 0, 250, 'g',  1),
    (2,  1, 1, 100, 'g',  1),
    (3,  1, 2,  60, 'g',  1),
    (4,  1, 3,   7, 'g',  1),
    (5,  1, 4,   2, 'pc', 1),
    (6,  1, 5,  40, 'g',  1),
    (7,  1, 6,  80, 'ml', 1),
    -- shakshuka
    (8,  2, 0,   4, 'pc',   1),
    (9,  2, 1, 400, 'g',    1),
    (10, 2, 2,   1, 'pc',   1),
    (11, 2, 3,   1, 'pc',   1),
    (12, 2, 4,   2, 'tsp',  1),
    -- No quantity at all, and must never gain one by being multiplied.
    (13, 2, 5, NULL, '',    0),
    -- sourdough
    (14, 3, 0, 500, 'g',  1),
    (15, 3, 1, 350, 'ml', 1),
    (16, 3, 2, 100, 'g',  1),
    (17, 3, 3,  10, 'g',  1),
    -- basque cheesecake
    (18, 4, 0, 600, 'g',  1),
    (19, 4, 1, 200, 'g',  1),
    (20, 4, 2,   4, 'pc', 1),
    (21, 4, 3, 200, 'ml', 1),
    (22, 4, 4,  20, 'g',  1),
    -- beef tagine
    (23, 5, 0, 800, 'g',   1),
    (24, 5, 1, 150, 'g',   1),
    (25, 5, 2,  80, 'g',   1),
    (26, 5, 3,   2, 'pc',  1),
    (27, 5, 4,   2, 'tsp', 1),
    -- pomegranate juice
    (28, 6, 0,   2, 'pc', 1),
    (29, 6, 1,   4, 'pc', 1),
    (30, 6, 2, NULL, '',  0);

INSERT INTO ingredient_translation (ingredient_id, locale, name, note) VALUES
    (1,  'fr', 'Farine', NULL),              (1,  'en', 'Flour', NULL),
    (2,  'fr', 'Chocolat noir', NULL),       (2,  'en', 'Dark chocolate', NULL),
    (3,  'fr', 'Beurre', NULL),              (3,  'en', 'Butter', NULL),
    (4,  'fr', 'Levure fraîche', NULL),      (4,  'en', 'Fresh yeast', NULL),
    (5,  'fr', 'Œufs', NULL),                (5,  'en', 'Eggs', NULL),
    (6,  'fr', 'Sucre', NULL),               (6,  'en', 'Sugar', NULL),
    (7,  'fr', 'Lait tiède', NULL),          (7,  'en', 'Warm milk', NULL),

    (8,  'fr', 'Œufs', NULL),                (8,  'en', 'Eggs', NULL),
    (9,  'fr', 'Tomates concassées', NULL),  (9,  'en', 'Chopped tomatoes', NULL),
    (10, 'fr', 'Oignon', NULL),              (10, 'en', 'Onion', NULL),
    (11, 'fr', 'Poivron rouge', NULL),       (11, 'en', 'Red pepper', NULL),
    (12, 'fr', 'Cumin', NULL),               (12, 'en', 'Cumin', NULL),
    (13, 'fr', 'Sel et poivre', 'au goût'),  (13, 'en', 'Salt and pepper', 'to taste'),

    (14, 'fr', 'Farine T65', NULL),          (14, 'en', 'Bread flour', NULL),
    (15, 'fr', 'Eau', NULL),                 (15, 'en', 'Water', NULL),
    (16, 'fr', 'Levain actif', NULL),        (16, 'en', 'Active starter', NULL),
    (17, 'fr', 'Sel', NULL),                 (17, 'en', 'Salt', NULL),

    (18, 'fr', 'Fromage frais', NULL),       (18, 'en', 'Cream cheese', NULL),
    (19, 'fr', 'Sucre', NULL),               (19, 'en', 'Sugar', NULL),
    (20, 'fr', 'Œufs', NULL),                (20, 'en', 'Eggs', NULL),
    (21, 'fr', 'Crème liquide', NULL),       (21, 'en', 'Double cream', NULL),
    (22, 'fr', 'Farine', NULL),              (22, 'en', 'Plain flour', NULL),

    (23, 'fr', 'Épaule de bœuf', NULL),      (23, 'en', 'Beef shoulder', NULL),
    (24, 'fr', 'Abricots secs', NULL),       (24, 'en', 'Dried apricots', NULL),
    (25, 'fr', 'Amandes', NULL),             (25, 'en', 'Almonds', NULL),
    (26, 'fr', 'Oignons', NULL),             (26, 'en', 'Onions', NULL),
    (27, 'fr', 'Ras el-hanout', NULL),       (27, 'en', 'Ras el hanout', NULL),

    (28, 'fr', 'Grenades', NULL),            (28, 'en', 'Pomegranates', NULL),
    (29, 'fr', 'Oranges', NULL),             (29, 'en', 'Oranges', NULL),
    (30, 'fr', 'Glaçons', 'pour servir'),    (30, 'en', 'Ice cubes', 'to serve');

-- --- Steps ------------------------------------------------------------------

INSERT INTO step (id, recipe_id, position, duration_minutes, video_offset_seconds) VALUES
    -- babka. The offsets drive the "(mm:ss)" jump links; 134 is the 02:14 an
    -- e2e spec clicks on.
    (1,  1, 0, 15,  10),
    (2,  1, 1, 90,  52),
    (3,  1, 2, 10, 134),
    (4,  1, 3,  8, 277),
    (5,  1, 4, 45, 363),
    -- shakshuka
    (6,  2, 0, 10, NULL),
    (7,  2, 1, 15, NULL),
    (8,  2, 2,  8, NULL),
    -- sourdough
    (9,  3, 0,  30, NULL),
    (10, 3, 1, 240, NULL),
    (11, 3, 2, 720, NULL),
    (12, 3, 3,  45, NULL),
    -- basque cheesecake
    (13, 4, 0, 20, NULL),
    (14, 4, 1,  5, NULL),
    (15, 4, 2, 50, NULL),
    -- beef tagine
    (16, 5, 0,  15, NULL),
    (17, 5, 1,  10, NULL),
    (18, 5, 2, 150, NULL),
    (19, 5, 3,  10, NULL),
    -- pomegranate juice
    (20, 6, 0, 8, NULL),
    (21, 6, 1, 2, NULL);

INSERT INTO step_translation (step_id, locale, body) VALUES
    (1, 'fr', 'Mélanger la farine, le lait tiède, le sucre et la levure. Pétrir jusqu''à obtenir une pâte souple.'),
    (1, 'en', 'Combine the flour, warm milk, sugar and yeast. Knead until the dough is smooth and supple.'),
    (2, 'fr', 'Laisser pousser la pâte dans un endroit tiède jusqu''à ce qu''elle double de volume.'),
    (2, 'en', 'Leave the dough to rise somewhere warm until doubled in size.'),
    (3, 'fr', 'Étaler la pâte, la tartiner de ganache au chocolat, puis rouler et trancher en deux dans la longueur.'),
    (3, 'en', 'Roll the dough out, spread it with chocolate ganache, then roll it up and slice it lengthways in two.'),
    (4, 'fr', 'Tresser les deux bandes en gardant la coupe visible, puis déposer dans un moule à cake.'),
    (4, 'en', 'Twist the two strands together keeping the cut sides facing up, then lay them in a loaf tin.'),
    (5, 'fr', 'Enfourner à 180°C jusqu''à ce que la babka soit bien dorée, puis napper de sirop encore chaude.'),
    (5, 'en', 'Bake at 180°C until deeply golden, then brush with syrup while still hot.'),

    (6, 'fr', 'Faire revenir l''oignon et le poivron émincés jusqu''à ce qu''ils fondent.'),
    (6, 'en', 'Soften the sliced onion and pepper in a wide pan until they collapse.'),
    (7, 'fr', 'Ajouter les tomates et le cumin, puis laisser mijoter à découvert.'),
    (7, 'en', 'Add the tomatoes and cumin, then let it simmer uncovered.'),
    (8, 'fr', 'Creuser des puits dans la sauce, y casser les œufs, couvrir et cuire jusqu’à ce que le blanc soit pris.'),
    (8, 'en', 'Make wells in the sauce, crack in the eggs, cover and cook until the whites are just set.'),

    (9,  'fr', 'Mélanger farine et eau, puis laisser reposer une demi-heure (autolyse).'),
    (9,  'en', 'Mix the flour and water, then let it rest for half an hour (autolyse).'),
    (10, 'fr', 'Incorporer le levain et le sel, puis effectuer des rabats toutes les 30 minutes.'),
    (10, 'en', 'Work in the starter and salt, then fold the dough every 30 minutes.'),
    (11, 'fr', 'Façonner, puis laisser pousser une nuit au réfrigérateur.'),
    (11, 'en', 'Shape the loaf, then let it prove overnight in the fridge.'),
    (12, 'fr', 'Cuire en cocotte à 240°C, couvercle 20 minutes puis à découvert.'),
    (12, 'en', 'Bake in a covered pot at 240°C, lid on for 20 minutes then off.'),

    (13, 'fr', 'Fouetter le fromage et le sucre, puis ajouter les œufs un à un.'),
    (13, 'en', 'Whisk the cheese and sugar together, then beat in the eggs one at a time.'),
    (14, 'fr', 'Incorporer la crème et la farine tamisée sans travailler la pâte.'),
    (14, 'en', 'Fold in the cream and sifted flour without overworking the batter.'),
    (15, 'fr', 'Cuire à 220°C jusqu’à ce que la surface soit franchement brûlée et le centre encore tremblant.'),
    (15, 'en', 'Bake at 220°C until the top is properly burnt and the centre still wobbles.'),

    (16, 'fr', 'Saisir la viande de tous les côtés, puis réserver.'),
    (16, 'en', 'Brown the meat on all sides, then set it aside.'),
    (17, 'fr', 'Faire suer les oignons avec les épices jusqu’à ce qu’ils embaument.'),
    (17, 'en', 'Sweat the onions with the spices until the kitchen smells of them.'),
    (18, 'fr', 'Remettre la viande, mouiller à hauteur, puis laisser mijoter à couvert très doucement.'),
    (18, 'en', 'Return the meat, add water to just cover, then simmer very gently with the lid on.'),
    (19, 'fr', 'Ajouter les abricots en fin de cuisson, parsemer d’amandes torréfiées.'),
    (19, 'en', 'Add the apricots near the end, and scatter over the toasted almonds.'),

    (20, 'fr', 'Égrener les grenades et presser les oranges.'),
    (20, 'en', 'Seed the pomegranates and juice the oranges.'),
    (21, 'fr', 'Mixer brièvement, filtrer, puis servir immédiatement sur glace.'),
    (21, 'en', 'Blend briefly, strain, then serve straight away over ice.');

-- --- Social -----------------------------------------------------------------

-- One vote of 4 on the babka, so the detail page opens on "4.0 / 5 · 1 avis".
INSERT INTO rating (recipe_id, visitor_id, stars, created_at) VALUES
    (1, 'seed-visitor', 4, '2026-07-22T12:00:00Z');

-- Not translated, unlike everything above. A comment is written once, by a
-- visitor, in whatever language they chose, and it stays that way on both the
-- French and the English page: nobody translates a stranger's remark about a
-- babka. Hence no comment_translation table.
INSERT INTO comment (recipe_id, user_id, display_name, body_markdown, status, created_at) VALUES
    (1, NULL, 'Camille',
     'Faite hier soir, elle a tenu jusqu’au petit-déjeuner — de justesse. Le **double tour** de tressage vaut vraiment le coup.',
     'PUBLISHED', '2026-07-23T12:00:00Z'),
    (1, NULL, 'Tom',
     'Used 70% dark chocolate and cut the sugar to 30g. Still plenty sweet.',
     'PUBLISHED', '2026-07-24T12:00:00Z'),
    (2, NULL, 'Yasmine',
     'J’ajoute une pincée de cumin avec les poivrons, ça change tout.',
     'PUBLISHED', '2026-07-22T12:00:00Z'),
    -- Left pending so the moderation queue has something in it and the rule
    -- "a pending comment is not public reading" is observable.
    (2, NULL, 'Anonyme', 'premier !!!', 'PENDING', '2026-07-25T12:00:00Z');

-- --- Search text ------------------------------------------------------------
--
-- Derived rather than transcribed. It is title + excerpt + tag labels +
-- ingredient names, and writing that out by hand for twelve translation rows
-- would be sixty chances to introduce a typo that only ever shows up as a
-- search returning nothing.

UPDATE recipe_translation
SET search_text = title || ' ' || excerpt
    || COALESCE((SELECT ' ' || group_concat(tt.label, ' ')
                 FROM recipe_tag rt
                 JOIN tag_translation tt ON tt.tag_id = rt.tag_id AND tt.locale = recipe_translation.locale
                 WHERE rt.recipe_id = recipe_translation.recipe_id), '')
    || COALESCE((SELECT ' ' || group_concat(it.name, ' ')
                 FROM ingredient i
                 JOIN ingredient_translation it ON it.ingredient_id = i.id AND it.locale = recipe_translation.locale
                 WHERE i.recipe_id = recipe_translation.recipe_id), '');

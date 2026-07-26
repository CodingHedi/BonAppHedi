/**
 * Seed content.
 *
 * French copy is transcribed VERBATIM from Docs/Design/index.html (lines
 * 170-186) and recipe.html — it is final design copy, not placeholder text.
 * English is a translation written for this project and should be reviewed by
 * Hédi; it aims to match the French voice (warm, concise, sensory) rather than
 * translate it literally.
 *
 * Deliberately shaped like the database will be: a language-neutral record
 * holding quantities, durations and relationships, plus a per-locale
 * translation map. That way V3__seed.sql is a transcription of this file rather
 * than a reinterpretation of it, and the M2 swap produces an identical UI.
 */

import type { Locale } from '../core/i18n/locale';
import type { CommentStatus, Difficulty, RecipeStatus, TagVariant } from '../core/api/models';

/**
 * Publication dates are computed backwards from this instant rather than being
 * stored as the prototype's hardcoded strings ("il y a 4 jours").
 *
 * That is the point: it forces the relative-time pipe to actually produce those
 * strings from real dates, in both languages. A hardcoded string would pass a
 * screenshot comparison while proving nothing.
 */
export const SEED_NOW = new Date('2026-07-25T12:00:00.000Z');

const daysAgo = (days: number): string =>
  new Date(SEED_NOW.getTime() - days * 86_400_000).toISOString();

// --- Tags --------------------------------------------------------------------
// Colour assignment comes from the prototype: gluten and dessert are teal,
// chocolat and mijoté are terracotta.

export interface SeedTag {
  readonly key: string;
  readonly colorVariant: TagVariant;
  readonly t: Record<Locale, { readonly slug: string; readonly label: string }>;
}

export const SEED_TAGS: readonly SeedTag[] = [
  {
    key: 'gluten',
    colorVariant: 'accent2',
    t: { fr: { slug: 'gluten', label: 'gluten' }, en: { slug: 'gluten', label: 'gluten' } },
  },
  {
    key: 'dessert',
    colorVariant: 'accent2',
    t: { fr: { slug: 'dessert', label: 'dessert' }, en: { slug: 'dessert', label: 'dessert' } },
  },
  {
    key: 'chocolate',
    colorVariant: 'accent',
    t: { fr: { slug: 'chocolat', label: 'chocolat' }, en: { slug: 'chocolate', label: 'chocolate' } },
  },
  {
    key: 'slow-cooked',
    colorVariant: 'accent',
    t: {
      fr: { slug: 'mijote', label: 'mijoté' },
      en: { slug: 'slow-cooked', label: 'slow-cooked' },
    },
  },
];

// --- Author ------------------------------------------------------------------

export const SEED_AUTHOR = {
  slug: 'hedi',
  displayName: 'Hédi',
  avatarUrl: null,
  t: {
    fr: { bio: 'Je cuisine, je note, je recommence.' },
    en: { bio: 'I cook, I take notes, I start over.' },
  },
} as const;

// --- Recipes -----------------------------------------------------------------

interface SeedIngredient {
  readonly baseQuantity: number | null;
  readonly unit: string;
  readonly scalable?: boolean;
  readonly t: Record<Locale, { readonly name: string; readonly note?: string }>;
}

interface SeedStep {
  readonly durationMinutes: number | null;
  readonly videoOffsetSeconds: number | null;
  readonly t: Record<Locale, { readonly body: string }>;
}

interface SeedRecipeTranslation {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly heroKicker?: string;
  /** Hero copy is longer than the card excerpt — the prototype uses both. */
  readonly heroExcerpt?: string;
  readonly bodyMarkdown?: string;
}

export interface SeedRecipe {
  readonly key: string;
  /** Absent means PUBLISHED. Only the admin area can see anything else. */
  readonly status?: RecipeStatus;
  readonly tagKeys: readonly string[];
  readonly publishedAt: string;
  readonly prepMinutes: number | null;
  readonly cookMinutes: number | null;
  readonly difficulty: Difficulty;
  readonly baseServings: number;
  readonly youtubeVideoId: string | null;
  /** Position in the hero carousel; absent means not featured. */
  readonly featuredRank?: number;
  readonly ratingSum: number;
  readonly ratingCount: number;
  readonly reactionCount: number;
  readonly ingredients: readonly SeedIngredient[];
  readonly steps: readonly SeedStep[];
  readonly t: Record<Locale, SeedRecipeTranslation>;
}

export const SEED_RECIPES: readonly SeedRecipe[] = [
  {
    key: 'babka',
    tagKeys: ['chocolate', 'dessert'],
    publishedAt: daysAgo(4),
    prepMinutes: 15,
    cookMinutes: 45,
    difficulty: 1,
    baseServings: 2,
    /**
     * PLACEHOLDER — replace when a real babka video is filmed.
     *
     * This is the Blender Foundation's "Big Buck Bunny", chosen deliberately
     * because it is openly licensed and unmistakably not a cookery video, so
     * nobody can mistake it for finished content. It exists so the video
     * facade and the step-timestamp jumps are exercisable end to end; the step
     * offsets below fall within its runtime.
     */
    youtubeVideoId: 'YE7VzlLtp-4',
    featuredRank: 1,
    ratingSum: 4,
    ratingCount: 1,
    reactionCount: 0,
    ingredients: [
      { baseQuantity: 250, unit: 'g', t: { fr: { name: 'Farine' }, en: { name: 'Flour' } } },
      {
        baseQuantity: 100,
        unit: 'g',
        t: { fr: { name: 'Chocolat noir' }, en: { name: 'Dark chocolate' } },
      },
      { baseQuantity: 60, unit: 'g', t: { fr: { name: 'Beurre' }, en: { name: 'Butter' } } },
      {
        baseQuantity: 7,
        unit: 'g',
        t: { fr: { name: 'Levure fraîche' }, en: { name: 'Fresh yeast' } },
      },
      { baseQuantity: 2, unit: 'pc', t: { fr: { name: 'Œufs' }, en: { name: 'Eggs' } } },
      { baseQuantity: 40, unit: 'g', t: { fr: { name: 'Sucre' }, en: { name: 'Sugar' } } },
      { baseQuantity: 80, unit: 'ml', t: { fr: { name: 'Lait tiède' }, en: { name: 'Warm milk' } } },
    ],
    steps: [
      {
        durationMinutes: 15,
        videoOffsetSeconds: 10,
        t: {
          fr: {
            body: "Mélanger la farine, le lait tiède, le sucre et la levure. Pétrir jusqu'à obtenir une pâte souple.",
          },
          en: {
            body: 'Combine the flour, warm milk, sugar and yeast. Knead until the dough is smooth and supple.',
          },
        },
      },
      {
        durationMinutes: 90,
        videoOffsetSeconds: 52,
        t: {
          fr: {
            body: "Laisser pousser la pâte dans un endroit tiède jusqu'à ce qu'elle double de volume.",
          },
          en: { body: 'Leave the dough to rise somewhere warm until doubled in size.' },
        },
      },
      {
        durationMinutes: 10,
        videoOffsetSeconds: 134,
        t: {
          fr: {
            body: 'Étaler la pâte, la tartiner de ganache au chocolat, puis rouler et trancher en deux dans la longueur.',
          },
          en: {
            body: 'Roll the dough out, spread it with chocolate ganache, then roll it up and slice it lengthways in two.',
          },
        },
      },
      {
        durationMinutes: 8,
        videoOffsetSeconds: 277,
        t: {
          fr: {
            body: 'Tresser les deux bandes en gardant la coupe visible, puis déposer dans un moule à cake.',
          },
          en: {
            body: 'Twist the two strands together keeping the cut sides facing up, then lay them in a loaf tin.',
          },
        },
      },
      {
        durationMinutes: 45,
        videoOffsetSeconds: 363,
        t: {
          fr: {
            body: "Enfourner à 180°C jusqu'à ce que la babka soit bien dorée, puis napper de sirop encore chaude.",
          },
          en: {
            body: 'Bake at 180°C until deeply golden, then brush with syrup while still hot.',
          },
        },
      },
    ],
    t: {
      fr: {
        slug: 'babka-au-chocolat',
        title: 'Babka au chocolat',
        excerpt:
          'Une brioche tressée au marbrage caractéristique et à la garniture chocolatée généreuse.',
        heroKicker: 'Recette du moment',
        heroExcerpt:
          'Une brioche tressée à la mie marbrée, généreusement garnie de chocolat fondant. Le genre de recette qui parfume toute la maison.',
        bodyMarkdown:
          "La babka est une brioche tressée d'origine polonaise, reconnaissable à sa mie marbrée et à sa garniture généreuse de chocolat. On la tranche encore tiède, pour que le chocolat file un peu — c'est le meilleur moment.",
      },
      en: {
        slug: 'chocolate-babka',
        title: 'Chocolate babka',
        excerpt: 'A braided loaf with its unmistakable marbling and a generous chocolate filling.',
        heroKicker: 'Recipe of the moment',
        heroExcerpt:
          'A braided loaf with a marbled crumb, generously filled with melting chocolate. The kind of recipe that fills the whole house with its scent.',
        bodyMarkdown:
          'Babka is a braided Polish loaf, recognisable by its marbled crumb and its generous chocolate filling. Slice it while still warm, so the chocolate pulls a little — that is the best moment.',
      },
    },
  },

  {
    key: 'shakshuka',
    tagKeys: [],
    publishedAt: daysAgo(25),
    prepMinutes: 10,
    cookMinutes: 25,
    difficulty: 1,
    baseServings: 2,
    youtubeVideoId: null,
    featuredRank: 2,
    ratingSum: 0,
    ratingCount: 0,
    reactionCount: 0,
    ingredients: [
      { baseQuantity: 4, unit: 'pc', t: { fr: { name: 'Œufs' }, en: { name: 'Eggs' } } },
      {
        baseQuantity: 400,
        unit: 'g',
        t: { fr: { name: 'Tomates concassées' }, en: { name: 'Chopped tomatoes' } },
      },
      { baseQuantity: 1, unit: 'pc', t: { fr: { name: 'Oignon' }, en: { name: 'Onion' } } },
      {
        baseQuantity: 1,
        unit: 'pc',
        t: { fr: { name: 'Poivron rouge' }, en: { name: 'Red pepper' } },
      },
      { baseQuantity: 2, unit: 'tsp', t: { fr: { name: 'Cumin' }, en: { name: 'Cumin' } } },
      {
        baseQuantity: null,
        unit: '',
        scalable: false,
        t: {
          fr: { name: 'Sel et poivre', note: 'au goût' },
          en: { name: 'Salt and pepper', note: 'to taste' },
        },
      },
    ],
    steps: [
      {
        durationMinutes: 10,
        videoOffsetSeconds: null,
        t: {
          fr: { body: "Faire revenir l'oignon et le poivron émincés jusqu'à ce qu'ils fondent." },
          en: { body: 'Soften the sliced onion and pepper in a wide pan until they collapse.' },
        },
      },
      {
        durationMinutes: 15,
        videoOffsetSeconds: null,
        t: {
          fr: { body: 'Ajouter les tomates et le cumin, puis laisser mijoter à découvert.' },
          en: { body: 'Add the tomatoes and cumin, then let it simmer uncovered.' },
        },
      },
      {
        durationMinutes: 8,
        videoOffsetSeconds: null,
        t: {
          fr: {
            body: 'Creuser des puits dans la sauce, y casser les œufs, couvrir et cuire jusqu’à ce que le blanc soit pris.',
          },
          en: {
            body: 'Make wells in the sauce, crack in the eggs, cover and cook until the whites are just set.',
          },
        },
      },
    ],
    t: {
      fr: {
        slug: 'chakchouka',
        title: 'Chakchouka',
        excerpt:
          "Un plat originaire d'Afrique du Nord et du Moyen-Orient. Simple, savoureux, et parfait à partager.",
        heroKicker: 'Petit-déjeuner copieux',
        heroExcerpt:
          "Œufs pochés dans une sauce tomate épicée, un classique d'Afrique du Nord à partager au centre de la table.",
        bodyMarkdown:
          "La chakchouka se mange à la poêle, posée au centre de la table, avec beaucoup de pain pour saucer. C'est un plat du matin autant que du soir.",
      },
      en: {
        slug: 'shakshuka',
        title: 'Shakshuka',
        excerpt: 'A dish from North Africa and the Middle East. Simple, full of flavour, and made for sharing.',
        heroKicker: 'A hearty breakfast',
        heroExcerpt:
          'Eggs poached in a spiced tomato sauce — a North African classic, shared straight from the middle of the table.',
        bodyMarkdown:
          'Shakshuka is eaten straight from the pan, set down in the middle of the table, with plenty of bread for mopping. It belongs to the morning as much as the evening.',
      },
    },
  },

  {
    key: 'sourdough',
    tagKeys: ['gluten'],
    publishedAt: daysAgo(34),
    prepMinutes: 30,
    cookMinutes: 45,
    difficulty: 3,
    baseServings: 2,
    youtubeVideoId: null,
    featuredRank: 3,
    ratingSum: 0,
    ratingCount: 0,
    reactionCount: 0,
    ingredients: [
      { baseQuantity: 500, unit: 'g', t: { fr: { name: 'Farine T65' }, en: { name: 'Bread flour' } } },
      { baseQuantity: 350, unit: 'ml', t: { fr: { name: 'Eau' }, en: { name: 'Water' } } },
      { baseQuantity: 100, unit: 'g', t: { fr: { name: 'Levain actif' }, en: { name: 'Active starter' } } },
      { baseQuantity: 10, unit: 'g', t: { fr: { name: 'Sel' }, en: { name: 'Salt' } } },
    ],
    steps: [
      {
        durationMinutes: 30,
        videoOffsetSeconds: null,
        t: {
          fr: { body: "Mélanger farine et eau, puis laisser reposer une demi-heure (autolyse)." },
          en: { body: 'Mix the flour and water, then let it rest for half an hour (autolyse).' },
        },
      },
      {
        durationMinutes: 240,
        videoOffsetSeconds: null,
        t: {
          fr: {
            body: 'Incorporer le levain et le sel, puis effectuer des rabats toutes les 30 minutes.',
          },
          en: { body: 'Work in the starter and salt, then fold the dough every 30 minutes.' },
        },
      },
      {
        durationMinutes: 720,
        videoOffsetSeconds: null,
        t: {
          fr: { body: 'Façonner, puis laisser pousser une nuit au réfrigérateur.' },
          en: { body: 'Shape the loaf, then let it prove overnight in the fridge.' },
        },
      },
      {
        durationMinutes: 45,
        videoOffsetSeconds: null,
        t: {
          fr: { body: 'Cuire en cocotte à 240°C, couvercle 20 minutes puis à découvert.' },
          en: { body: 'Bake in a covered pot at 240°C, lid on for 20 minutes then off.' },
        },
      },
    ],
    t: {
      fr: {
        slug: 'pain-au-levain',
        title: 'Pain au levain',
        excerpt:
          "Le pain est un aliment de base composé de farine, d'eau et de levure ou de levain, puis cuit au four.",
        heroKicker: 'Boulangerie maison',
        heroExcerpt:
          'Croûte craquante, mie alvéolée : la base de tout bon garde-manger, prête en une nuit de patience.',
        bodyMarkdown:
          "Rien de compliqué ici, seulement du temps. Le levain travaille pendant que vous dormez ; le reste n'est qu'une question de four bien chaud.",
      },
      en: {
        slug: 'sourdough-bread',
        title: 'Sourdough bread',
        excerpt:
          'Bread is a staple made from flour, water and yeast or a sourdough starter, then baked in the oven.',
        heroKicker: 'Home baking',
        heroExcerpt:
          'Crackling crust, open crumb: the foundation of any good pantry, ready after one night of patience.',
        bodyMarkdown:
          'Nothing complicated here, only time. The starter works while you sleep; the rest is a matter of a properly hot oven.',
      },
    },
  },

  {
    key: 'basque-cheesecake',
    tagKeys: ['dessert'],
    publishedAt: daysAgo(12),
    prepMinutes: 20,
    cookMinutes: 50,
    difficulty: 2,
    baseServings: 2,
    youtubeVideoId: null,
    ratingSum: 0,
    ratingCount: 0,
    reactionCount: 0,
    ingredients: [
      {
        baseQuantity: 600,
        unit: 'g',
        t: { fr: { name: 'Fromage frais' }, en: { name: 'Cream cheese' } },
      },
      { baseQuantity: 200, unit: 'g', t: { fr: { name: 'Sucre' }, en: { name: 'Sugar' } } },
      { baseQuantity: 4, unit: 'pc', t: { fr: { name: 'Œufs' }, en: { name: 'Eggs' } } },
      {
        baseQuantity: 200,
        unit: 'ml',
        t: { fr: { name: 'Crème liquide' }, en: { name: 'Double cream' } },
      },
      {
        baseQuantity: 20,
        unit: 'g',
        t: { fr: { name: 'Farine' }, en: { name: 'Plain flour' } },
      },
    ],
    steps: [
      {
        durationMinutes: 20,
        videoOffsetSeconds: null,
        t: {
          fr: { body: 'Fouetter le fromage et le sucre, puis ajouter les œufs un à un.' },
          en: { body: 'Whisk the cheese and sugar together, then beat in the eggs one at a time.' },
        },
      },
      {
        durationMinutes: 5,
        videoOffsetSeconds: null,
        t: {
          fr: { body: 'Incorporer la crème et la farine tamisée sans travailler la pâte.' },
          en: { body: 'Fold in the cream and sifted flour without overworking the batter.' },
        },
      },
      {
        durationMinutes: 50,
        videoOffsetSeconds: null,
        t: {
          fr: {
            body: 'Cuire à 220°C jusqu’à ce que la surface soit franchement brûlée et le centre encore tremblant.',
          },
          en: {
            body: 'Bake at 220°C until the top is properly burnt and the centre still wobbles.',
          },
        },
      },
    ],
    t: {
      fr: {
        slug: 'cheesecake-basque',
        title: 'Cheesecake basque',
        excerpt:
          'Un cheesecake volontairement brûlé en surface pour un cœur coulant et un goût de caramel.',
        bodyMarkdown:
          "Le dessus doit être presque noir : c'est là que se trouve tout le goût. Le centre, lui, reste coulant.",
      },
      en: {
        slug: 'basque-cheesecake',
        title: 'Basque cheesecake',
        excerpt: 'A cheesecake deliberately burnt on top, for a molten centre and a taste of caramel.',
        bodyMarkdown:
          'The top should be almost black: that is where all the flavour is. The centre stays molten.',
      },
    },
  },

  {
    key: 'beef-tagine',
    tagKeys: ['slow-cooked'],
    publishedAt: daysAgo(18),
    prepMinutes: 25,
    cookMinutes: 150,
    difficulty: 2,
    baseServings: 2,
    youtubeVideoId: null,
    ratingSum: 0,
    ratingCount: 0,
    reactionCount: 0,
    ingredients: [
      {
        baseQuantity: 800,
        unit: 'g',
        t: { fr: { name: 'Épaule de bœuf' }, en: { name: 'Beef shoulder' } },
      },
      {
        baseQuantity: 150,
        unit: 'g',
        t: { fr: { name: 'Abricots secs' }, en: { name: 'Dried apricots' } },
      },
      {
        baseQuantity: 80,
        unit: 'g',
        t: { fr: { name: 'Amandes' }, en: { name: 'Almonds' } },
      },
      { baseQuantity: 2, unit: 'pc', t: { fr: { name: 'Oignons' }, en: { name: 'Onions' } } },
      {
        baseQuantity: 2,
        unit: 'tsp',
        t: { fr: { name: 'Ras el-hanout' }, en: { name: 'Ras el hanout' } },
      },
    ],
    steps: [
      {
        durationMinutes: 15,
        videoOffsetSeconds: null,
        t: {
          fr: { body: 'Saisir la viande de tous les côtés, puis réserver.' },
          en: { body: 'Brown the meat on all sides, then set it aside.' },
        },
      },
      {
        durationMinutes: 10,
        videoOffsetSeconds: null,
        t: {
          fr: { body: 'Faire suer les oignons avec les épices jusqu’à ce qu’ils embaument.' },
          en: { body: 'Sweat the onions with the spices until the kitchen smells of them.' },
        },
      },
      {
        durationMinutes: 150,
        videoOffsetSeconds: null,
        t: {
          fr: {
            body: 'Remettre la viande, mouiller à hauteur, puis laisser mijoter à couvert très doucement.',
          },
          en: {
            body: 'Return the meat, add water to just cover, then simmer very gently with the lid on.',
          },
        },
      },
      {
        durationMinutes: 10,
        videoOffsetSeconds: null,
        t: {
          fr: { body: 'Ajouter les abricots en fin de cuisson, parsemer d’amandes torréfiées.' },
          en: { body: 'Add the apricots near the end, and scatter over the toasted almonds.' },
        },
      },
    ],
    t: {
      fr: {
        slug: 'tajine-de-boeuf',
        title: 'Tajine de bœuf',
        excerpt: 'Un mijoté fondant aux épices douces, aux abricots secs et aux amandes torréfiées.',
        bodyMarkdown:
          "Un plat qui ne se presse pas. Plus il mijote longtemps, plus la viande se défait toute seule.",
      },
      en: {
        slug: 'beef-tagine',
        title: 'Beef tagine',
        excerpt: 'A meltingly tender stew with warm spices, dried apricots and toasted almonds.',
        bodyMarkdown:
          'A dish that refuses to be hurried. The longer it simmers, the more the meat falls apart on its own.',
      },
    },
  },

  {
    key: 'pomegranate-juice',
    /*
     * Seeded unpublished on purpose. A draft that never appears anywhere is a
     * status nobody can check: this one makes "drafts are invisible to the
     * public site but editable in the admin area" an observable behaviour
     * rather than a claim in a type.
     */
    status: 'DRAFT',
    tagKeys: [],
    publishedAt: daysAgo(20),
    prepMinutes: 10,
    cookMinutes: null,
    difficulty: 1,
    baseServings: 2,
    youtubeVideoId: null,
    ratingSum: 0,
    ratingCount: 0,
    reactionCount: 0,
    ingredients: [
      { baseQuantity: 2, unit: 'pc', t: { fr: { name: 'Grenades' }, en: { name: 'Pomegranates' } } },
      { baseQuantity: 4, unit: 'pc', t: { fr: { name: 'Oranges' }, en: { name: 'Oranges' } } },
      {
        baseQuantity: null,
        unit: '',
        scalable: false,
        t: {
          fr: { name: 'Glaçons', note: 'pour servir' },
          en: { name: 'Ice cubes', note: 'to serve' },
        },
      },
    ],
    steps: [
      {
        durationMinutes: 8,
        videoOffsetSeconds: null,
        t: {
          fr: { body: 'Égrener les grenades et presser les oranges.' },
          en: { body: 'Seed the pomegranates and juice the oranges.' },
        },
      },
      {
        durationMinutes: 2,
        videoOffsetSeconds: null,
        t: {
          fr: { body: 'Mixer brièvement, filtrer, puis servir immédiatement sur glace.' },
          en: { body: 'Blend briefly, strain, then serve straight away over ice.' },
        },
      },
    ],
    t: {
      fr: {
        slug: 'jus-grenade-orange',
        title: 'Jus grenade & orange',
        excerpt:
          'Un jus frais pressé minute, vibrant et acidulé, à servir bien frais au petit-déjeuner.',
        bodyMarkdown: 'À boire dans les dix minutes : passé ce délai, il perd tout son mordant.',
      },
      en: {
        slug: 'pomegranate-orange-juice',
        title: 'Pomegranate & orange juice',
        excerpt: 'Freshly pressed to order, bright and sharp, best served well chilled at breakfast.',
        bodyMarkdown: 'Drink it within ten minutes: after that it loses all its bite.',
      },
    },
  },
];

// --- Comments ----------------------------------------------------------------

/**
 * Deliberately NOT translated, unlike everything else in this file.
 *
 * A comment is written once, by a visitor, in whatever language they chose, and
 * it stays that way on both the French and the English page — nobody translates
 * a stranger's remark about a babka. So these are keyed to the recipe and carry
 * no locale, which is also how the `comments` table is shaped.
 *
 * One is left PENDING so the moderation state is visible in the UI rather than
 * only in the type.
 */
export interface SeedComment {
  readonly recipeKey: string;
  readonly displayName: string;
  readonly bodyMarkdown: string;
  readonly daysAgo: number;
  readonly status?: CommentStatus;
}

export const SEED_COMMENTS: readonly SeedComment[] = [
  {
    recipeKey: 'babka',
    displayName: 'Camille',
    bodyMarkdown:
      'Faite hier soir, elle a tenu jusqu’au petit-déjeuner — de justesse. Le **double tour** de tressage vaut vraiment le coup.',
    daysAgo: 2,
  },
  {
    recipeKey: 'babka',
    displayName: 'Tom',
    bodyMarkdown: 'Used 70% dark chocolate and cut the sugar to 30g. Still plenty sweet.',
    daysAgo: 1,
  },
  {
    recipeKey: 'shakshuka',
    displayName: 'Yasmine',
    bodyMarkdown: 'J’ajoute une pincée de cumin avec les poivrons, ça change tout.',
    daysAgo: 3,
  },
  {
    recipeKey: 'shakshuka',
    displayName: 'Anonyme',
    bodyMarkdown: 'premier !!!',
    daysAgo: 0,
    status: 'PENDING',
  },
];

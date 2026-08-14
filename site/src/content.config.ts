import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One entry per theorem. The body of each file is the main-page prose:
// what the problem says, and how the linking-number proof works.
const theorems = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/theorems' }),
  schema: z.object({
    title: z.string(),
    // Short name used on cards and in nav ("Brouwer", "Borsuk–Ulam", …).
    shortTitle: z.string(),
    // One-sentence statement shown on the homepage card, math allowed via KaTeX
    // only in the body — keep this plain text.
    blurb: z.string(),
    // Order of the cards on the homepage.
    order: z.number(),
    // Name of the demo entry point in the engine repo's dist/demos/<demo>/.
    demo: z.string(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { theorems };

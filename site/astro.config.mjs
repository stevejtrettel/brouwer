// @ts-check
import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * The companion site. Build it with `npm run build:site` from the repo root,
 * NOT by running astro here — the demos it embeds are built by the parent vite
 * project and copied into dist/d/ afterwards. See scripts/site.mjs.
 *
 * SITE_URL / BASE_PATH let CI point a build at wherever it is hosted. The
 * defaults are the subdomain deploy: this site at the root of its own host.
 */
const site = process.env.SITE_URL ?? "https://brouwer.stevejtrettel.site";
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
    site,
    base,
    output: "static",
    markdown: {
        // Astro 7's default Markdown processor takes no remark/rehype plugins,
        // so the KaTeX pipeline has to go through unified().
        processor: unified({
            remarkPlugins: [remarkMath],
            rehypePlugins: [rehypeKatex],
        }),
    },
});

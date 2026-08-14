/**
 * Where the site's two kinds of imported asset live.
 *
 * In a BUILD, demos are static bundles copied to dist/d/<name>/ by
 * scripts/site.mjs — /d/ because /demos is a page of the site. In DEV they are
 * not built at all: they are served by the parent repo's own dev hub (`npm run
 * dev` with no demo name, port 5173), which uses the same /d/<name>/ shape, so
 * a demo edit hot-reloads inside the page you are writing about. Run both:
 *
 *   npm run dev        # terminal 1 — the demo hub on :5173
 *   npm run dev:site   # terminal 2 — this site on :4321
 */

const DEMO_HUB = (import.meta.env.PUBLIC_DEMO_HUB as string | undefined) ?? "http://localhost:5173";

/** Join a site-root-relative path onto the configured base. */
export function withBase(p: string): string {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return `${base}/${p.replace(/^\//, "")}`;
}

/** The URL an <iframe> should point at for a demo folder under demos/. */
export function demoUrl(name: string): string {
    return import.meta.env.DEV ? `${DEMO_HUB}/d/${name}/` : withBase(`d/${name}/`);
}

/** Deep link into a demo, e.g. a render page at a pinned figure preset. */
export function demoPresetUrl(name: string, preset: string): string {
    return `${demoUrl(name)}?figpreset=${encodeURIComponent(preset)}`;
}

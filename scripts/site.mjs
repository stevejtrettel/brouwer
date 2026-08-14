/**
 * Builds the companion site — the Astro pages plus every demo — into one
 * directory ready for a static host.
 *
 *   node scripts/site.mjs dev       just astro dev (demos come from the dev hub)
 *   node scripts/site.mjs build     demos + astro → site/dist
 *   node scripts/site.mjs preview   serve site/dist
 *
 * Env:
 *   BASE_PATH   where the site is hosted, default '/' (its own subdomain)
 *   SITE_URL    absolute origin, for canonical links
 *
 * Layout of the output:
 *   site/dist/     the Astro pages
 *   site/dist/d/   every demo, plus build-all's own gallery at /d/
 *
 * Demos sit at /d/ rather than /demos/ so the site is free to have a page at
 * /demos — sharing the path would have this copy step overwrite it.
 *
 * The paper's figures are NOT copied in. Nothing on the site shows one, and
 * figures/ is ~66 MB of PNGs. If figure pages ever land here, copy figures/ to
 * site/dist/img/ and serve it in dev with a small vite middleware.
 *
 * The demos are built by the PARENT vite project (scripts/build-all.mjs), which
 * hoists three.js into one shared chunk across all of them — so a visitor
 * clicking between demos downloads it once. That is why this copies a finished
 * dist-pages/ in rather than letting Astro bundle the demo sources itself.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(root, "site");
const OUT = path.join(SITE, "dist");
const mode = process.argv[2] ?? "build";

const BASE_PATH = process.env.BASE_PATH ?? "/";
const base = BASE_PATH.endsWith("/") ? BASE_PATH : `${BASE_PATH}/`;

if (!existsSync(path.join(SITE, "node_modules"))) {
    console.error("site/node_modules is missing — run `npm install` inside site/ first.");
    process.exit(1);
}

/** Run a command, inheriting stdio, and abort the build if it fails. */
function run(cmd, args, opts = {}) {
    const res = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
    if (res.status !== 0) process.exit(res.status ?? 1);
}

if (mode === "dev") {
    run("npx", ["astro", "dev"], { cwd: SITE, env: { ...process.env } });
} else if (mode === "preview") {
    run("npx", ["astro", "preview"], { cwd: SITE });
} else if (mode === "build") {
    console.log(`\n▸ site build (base ${base})\n`);

    console.log("1/2  demos");
    run("node", [path.join(root, "scripts", "build-all.mjs")], {
        env: { ...process.env, BASE: `${base}d/` },
    });

    console.log("\n2/2  pages");
    rmSync(OUT, { recursive: true, force: true });
    run("npx", ["astro", "build"], {
        cwd: SITE,
        env: { ...process.env, BASE_PATH: base },
    });

    console.log("\nassembling");
    const demosOut = path.join(OUT, "d");
    rmSync(demosOut, { recursive: true, force: true });
    mkdirSync(demosOut, { recursive: true });
    cpSync(path.join(root, "dist-pages"), demosOut, { recursive: true });
    // Astro's asset directory is _astro/; GitHub Pages' Jekyll step would drop
    // anything starting with an underscore if it ever ran over this output.
    writeFileSync(path.join(OUT, ".nojekyll"), "");

    console.log(`\n✓ site → ${path.relative(root, OUT)}/`);
    console.log(`  pages:   ${base}`);
    console.log(`  demos:   ${base}d/`);
} else {
    console.error(`Usage: node scripts/site.mjs <dev|build|preview>`);
    process.exit(1);
}

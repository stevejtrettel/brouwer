/**
 * npm run figures — render the paper's figure set unattended.
 *
 *   npm run figures                     the paper set, final quality → figures/
 *   npm run figures -- --draft          fast pass (64 spp, 1×)      → figures/draft/
 *   npm run figures -- --all            the offcuts too (manifest EXTRAS)
 *   npm run figures -- brouwer-push     one panel (substring match)
 *   npm run figures -- --size 1600x1000 override every figure's aspect
 *
 * Each figure is just a deep link: /d/<page>/?figpreset=<id> applies the preset
 * and enters figure mode (RenderControls), &spp=/&fscale= seed the tracer. We
 * poll the figure bar's progress text until it reads "path traced", then read
 * the canvas back as a PNG.
 *
 * Headless, and ONE page reused for every figure — no window spam. Headless
 * Chrome still gets the real GPU here (ANGLE Metal on Apple silicon), so tracing
 * is full speed; `--headed` exists only for watching a figure come together.
 */

import { createServer } from "vite";
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_FIGURES, FIGURES } from "./figures.manifest.mjs";
import { writeContactSheet } from "./contact-sheet.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ------------------------------------------------------------------ arguments
const argv = process.argv.slice(2);
const draft = argv.includes("--draft");
const sizeIndex = argv.indexOf("--size");
const sizeArg = sizeIndex >= 0 ? argv[sizeIndex + 1] : undefined;
const filters = argv.filter((a, i) => !a.startsWith("--") && i !== sizeIndex + 1);

// Aspect is per figure (the manifest's `size`), because composition decides it:
// a row of three actors wants a wide frame, a single torus does not. --size
// overrides everything; DEFAULT_SIZE covers figures that don't state one.
const DEFAULT_SIZE = "1440x900";
function parseSize(spec, label) {
    const [w, h] = spec.split("x").map(Number);
    if (!Number.isInteger(w) || !Number.isInteger(h)) {
        console.error(`${label} wants WIDTHxHEIGHT, got "${spec}"`);
        process.exit(1);
    }
    return { width: w, height: h };
}
const override = sizeArg ? parseSize(sizeArg, "--size") : null;

/** Output size saved from the figure workbench, if that page has a record. The
 *  workbench also re-applies the pose and scene state itself, in the browser,
 *  when the page loads — this is only the part the RENDERER has to know before
 *  the page exists, because the viewport has to be sized before the scene builds. */
function savedSize(figure) {
    const file = path.join(root, "figure-settings", `${figure.page}.json`);
    if (!existsSync(file)) return null;
    try {
        const all = JSON.parse(readFileSync(file, "utf8"));
        return all[figure.preset]?.size ?? null;
    } catch {
        return null;
    }
}
// 16 spp is grainy but enough to judge composition, colour and translucency;
// tracing here runs ~1 sample/s at 1440x900, so 64 was slower than it was useful
const quality = draft ? { spp: 16, scale: 1 } : { spp: 768, scale: 2 };
const outDir = path.join(root, "figures", draft ? "draft" : "");

// the paper set by default; --all reaches the offcuts, and an explicit filter
// searches everything (asking for a cut figure by name should just work)
const pool = argv.includes("--all") || filters.length ? ALL_FIGURES : FIGURES;
const wanted = filters.length
    ? pool.filter((f) => filters.some((q) => f.file.includes(q) || f.preset.includes(q)))
    : pool;

if (wanted.length === 0) {
    console.error(
        `No figures match ${filters.join(", ")}. Known: ${ALL_FIGURES.map((f) => f.file).join(", ")}`,
    );
    process.exit(1);
}

// --------------------------------------------------------------------- render
mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { port: 0 }, logLevel: "warn" });
await server.listen();
const address = server.httpServer?.address();
const base = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;

const browser = await chromium.launch({ channel: "chrome", headless: !argv.includes("--headed") });
const context = await browser.newContext({ viewport: parseSize(DEFAULT_SIZE, "size"), deviceScaleFactor: 1 });
// one page for the whole run: each figure is a navigation, not a new window
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(String(e)));

console.log(
    `${wanted.length} figure(s) · ${draft ? "DRAFT" : "FINAL"} ${quality.spp} spp @ ${quality.scale}× ` +
        `→ ${path.relative(root, outDir)}/`,
);

const results = [];
for (const figure of wanted) {
    problems.length = 0;
    const started = Date.now();
    try {
        // resize BEFORE loading: the scene reads the viewport when it builds.
        // A size SAVED from the workbench wins over the manifest's: the
        // workbench is where the aspect actually gets decided, and the file it
        // writes is the record. (--size still overrides everything.)
        const size =
            override ?? parseSize(savedSize(figure) ?? figure.size ?? DEFAULT_SIZE, figure.file);
        await page.setViewportSize(size);
        // trace=1 tells the workbench to go straight into the path tracer instead
        // of opening on that tab for a human to fiddle with
        const url =
            `${base}/d/${figure.page}/?figpreset=${figure.preset}&trace=1` +
            `&spp=${quality.spp}&fscale=${quality.scale}`;
        await page.goto(url);

        // The tracer reports progress in the figure bar; "path traced" = done.
        // Match the ACTIVE bar: a page with both a torus and a sphere figure
        // builds one bar each, and only the entered figure's bar is shown.
        await page.waitForFunction(
            () =>
                document
                    .querySelector(".figure-bar.active .prog")
                    ?.textContent?.includes("path traced"),
            undefined,
            { timeout: draft ? 240_000 : 1_200_000, polling: 500 },
        );

        const dataUrl = await page.evaluate(() => {
            const canvas = document.querySelector("canvas");
            if (!canvas) throw new Error("no canvas");
            return canvas.toDataURL("image/png");
        });
        const file = path.join(outDir, `${figure.file}.png`);
        writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        const kb = (Buffer.from(dataUrl.split(",")[1], "base64").length / 1024).toFixed(0);
        console.log(
            `  ✓ ${figure.file.padEnd(26)} ${seconds}s  ${kb} KB  ` +
                `${size.width * quality.scale}×${size.height * quality.scale}` +
                `${problems.length ? `  ⚠ ${problems.length} page error(s)` : ""}`,
        );
        results.push({ ...figure, ok: true, problems: [...problems] });
    } catch (error) {
        console.log(`  ✗ ${figure.file.padEnd(26)} ${String(error).split("\n")[0]}`);
        results.push({ ...figure, ok: false, problems: [...problems, String(error)] });
    }
}

await browser.close();
await server.close();

// -------------------------------------------------------------- contact sheet
// one page for the whole set, written by scripts/contact-sheet.mjs so it can also
// be rebuilt without re-rendering (npm run figures:sheet)
const sheet = writeContactSheet({ outDir, draft, spp: quality.spp });

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} rendered · ${path.relative(root, sheet.file)}`);
process.exit(failed ? 1 : 0);

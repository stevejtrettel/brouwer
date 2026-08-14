/**
 * The figure set as one page.
 *
 *   npm run figures            renders, then writes the sheet automatically
 *   npm run figures:sheet      rewrite the sheet from figures already on disk
 *   npm run figures:sheet -- --draft --embed
 *
 * Two flavours, because they serve different jobs:
 *
 *   default   <img src="setup-graphing.png"> — links the full-size renders, so
 *             clicking through shows real pixels. Local review copy.
 *   --embed   thumbnails inlined as data URIs, so the file is self-contained and
 *             can be mailed or published for coauthors. Needs macOS `sips`.
 *
 * Design note: the palette is lifted from src/components/theme.ts so the page and
 * the renders read as one thing, and the figures sit on a light mat in both light
 * and dark mode — a contact sheet should look like prints on a table either way.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRAS, PAPER } from "./figures.manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SECTION_ORDER = ["§1 setup", "§2 Brouwer", "§3 Borsuk–Ulam", "§4 Poincaré"];

/**
 * Where `npm run dev` serves the demos. Each card links BOTH ways into the
 * scene behind it, because a still is the end of the argument and not much use
 * while the figure is still being argued about:
 *
 *   stage   the figure workbench, opened on that configuration's tab — the
 *           figure framed at its own aspect, every control in the drawer;
 *   trace   the same deep link the render script uses (&trace=1), which skips
 *           the workbench and starts path-tracing on load. The figure, live.
 *
 * Dead links unless a dev server is up; the page says so.
 */
const DEV = "http://localhost:5173";

/** The fixed colour roles — the convention the whole set depends on. */
const ROLES = [
    ["#e4572e", "identity i, γ, the slice"],
    ["#2f6de1", "the map f"],
    ["#8d4fd3", "the companion f̄"],
    ["#0f9b8e", "the vector field v"],
    ["#ffb703", "the forced event"],
    ["#33313b", "the core curve"],
];

/** Downscale to a data URI via sips; null if that isn't available. */
function thumbnail(file, scratch) {
    try {
        const out = path.join(scratch, `${path.basename(file, ".png")}.jpg`);
        execFileSync("sips", ["-Z", "1100", "-s", "format", "jpeg", "-s", "formatOptions", "72", file, "--out", out], {
            stdio: "ignore",
        });
        return `data:image/jpeg;base64,${readFileSync(out).toString("base64")}`;
    } catch {
        return null;
    }
}

/**
 * Write the sheet next to the renders.
 * @param options.outDir  directory holding <file>.png
 * @param options.draft   label the page (and the sample count) as draft
 * @param options.spp     samples the renders were traced at
 * @param options.embed   inline thumbnails instead of linking the PNGs
 */
const LETTERS = "abcdefgh";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export function writeContactSheet({ outDir, draft = false, spp, embed = false } = {}) {
    const dir = outDir ?? path.join(root, "figures", draft ? "draft" : "");
    const scratch = embed ? mkdtempSync(path.join(tmpdir(), "sheet-")) : null;

    /** resolve one panel against what is actually on disk */
    const resolve = (panel) => {
        const [w, h] = (panel.size ?? "1440x900").split("x").map(Number);
        const file = path.join(dir, `${panel.file}.png`);
        const rendered = !panel.planned && existsSync(file);
        const src = rendered && embed ? thumbnail(file, scratch) : `${panel.file}.png`;
        return { ...panel, w, h, rendered, src };
    };

    const figures = PAPER.map((figure) => ({ ...figure, panels: figure.panels.map(resolve) }));
    const extras = EXTRAS.map(resolve);
    const panels = figures.flatMap((f) => f.panels);
    const missing = panels.filter((p) => !p.rendered);

    const links = (p) =>
        p.page
            ? `<span class="src">
              <a href="${DEV}/d/${p.page}/" title="the scene with all its controls">${p.page}</a>
              ·
              <a href="${DEV}/d/${p.page}/?figpreset=${p.preset}&trace=1" title="apply the preset and path-trace it live">${p.preset} ▸</a>
            </span>`
            : "";

    /** one panel: the render, or the hole where it will go */
    const panelCard = (p, i, lettered) => {
        const label = lettered ? `<b class="tag">(${LETTERS[i]})</b> ` : "";
        const art = p.rendered
            ? `<div class="mat" style="aspect-ratio:${p.w}/${p.h}">
            <img src="${p.src}" alt="${esc(p.caption)}" loading="lazy">
          </div>`
            : `<div class="mat gap" style="aspect-ratio:${p.w}/${p.h}">
            <span>${p.planned ? "not built yet" : "not rendered yet"}</span>
          </div>`;
        return `        <figure${p.rendered ? "" : ' class="pending"'}>
          ${art}
          <figcaption>
            <div class="meta">
              <span class="stem">${label}${p.file}</span>
              ${p.rendered ? `<span class="chip">${p.w * 2}×${p.h * 2}</span>` : ""}
            </div>
            ${links(p)}
            <p>${p.caption}</p>
            ${p.note ? `<p class="note">${p.note}</p>` : ""}
          </figcaption>
        </figure>`;
    };

    const figureBlock = (f) => {
        const n = f.panels.length;
        const cols = n === 4 ? 2 : Math.min(n, 3);
        return `    <article class="fig">
      <h3><span class="num">Figure ${f.number}</span> ${f.title}
        <b>${n} panel${n === 1 ? "" : "s"}</b></h3>
      <div class="panels" style="--cols:${cols}">
${f.panels.map((p, i) => panelCard(p, i, n > 1)).join("\n")}
      </div>
      <p class="figcap"><b>Figure ${f.number}.</b> ${f.caption}</p>
    </article>`;
    };

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Linking Proofs Figure Set</title>
<style>
  :root {
    --paper: #f7f4ee; --raised: #efede6; --ink: #33313b; --muted: #6b7a99;
    --line: #ddd7cb; --accent: #e4572e; --mat: #f4f2ec; --mat-line: #d8d3c8;
    --shadow: 0 1px 2px rgba(51,49,59,.06), 0 8px 24px rgba(51,49,59,.07);
    --rounded: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
    --sans: system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #1b1a20; --raised: #232229; --ink: #ece8e0; --muted: #9aa6c0;
      --line: #34323c; --accent: #f26b3e; --mat: #f4f2ec; --mat-line: #4a4754;
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.34);
    }
  }
  :root[data-theme="dark"] {
    --paper: #1b1a20; --raised: #232229; --ink: #ece8e0; --muted: #9aa6c0;
    --line: #34323c; --accent: #f26b3e; --mat: #f4f2ec; --mat-line: #4a4754;
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.34);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink);
         font-family: var(--sans); line-height: 1.6; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 4rem 1.5rem 6rem; }
  h1 { font-family: var(--rounded); font-size: clamp(1.9rem, 4vw, 2.6rem); font-weight: 700;
       letter-spacing: -.02em; line-height: 1.1; text-wrap: balance; margin: 0 0 .6rem; }
  .lede { max-width: 62ch; color: var(--muted); margin: 0 0 2rem; font-size: 1.02rem; }
  .status, .roles { background: var(--raised); border: 1px solid var(--line);
       border-radius: 14px; padding: 1.1rem 1.35rem; display: flex; flex-wrap: wrap; }
  .status { gap: 1.75rem; margin-bottom: 1.25rem; }
  .status div { display: flex; flex-direction: column; }
  .status dt { font-family: var(--rounded); font-size: .68rem; font-weight: 700;
       text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
  .status dd { margin: 0; font-family: var(--rounded); font-size: 1.15rem; font-weight: 700;
       font-variant-numeric: tabular-nums; }
  .status dd small { font-weight: 500; font-size: .8rem; color: var(--muted); }
  .roles { gap: .4rem 1.4rem; margin-bottom: 3.5rem; font-size: .82rem; color: var(--muted); }
  .roles .head { flex: 0 0 100%; font-family: var(--rounded); font-size: .68rem; font-weight: 700;
       text-transform: uppercase; letter-spacing: .07em; }
  .roles span.role { display: inline-flex; align-items: center; gap: .45rem; }
  .roles i { width: .7rem; height: .7rem; border-radius: 50%; flex: none; }
  section { margin-bottom: 3.5rem; }
  section > h2 { display: flex; align-items: baseline; gap: .8rem; font-family: var(--rounded);
       font-size: .8rem; font-weight: 700; text-transform: uppercase; letter-spacing: .09em;
       color: var(--accent); margin: 0 0 1.5rem; padding-bottom: .6rem;
       border-bottom: 1px solid var(--line); }
  section > h2 b { margin-left: auto; color: var(--muted); font-weight: 500;
       letter-spacing: 0; text-transform: none; font-size: .82rem; }
  .fig { margin: 0 0 3.25rem; }
  .fig h3 { display: flex; align-items: baseline; gap: .7rem; font-family: var(--rounded);
       font-size: 1.12rem; font-weight: 700; letter-spacing: -.01em; margin: 0 0 1rem; }
  .fig h3 .num { color: var(--accent); }
  .fig h3 b { margin-left: auto; font-size: .72rem; font-weight: 500; color: var(--muted);
       font-family: var(--mono); }
  .panels { display: grid; gap: 1.5rem 1.25rem;
       grid-template-columns: repeat(var(--cols, 1), minmax(0, 1fr)); }
  @media (max-width: 720px) { .panels { grid-template-columns: minmax(0, 1fr); } }
  .figcap { margin: 1.1rem 0 0; max-width: 72ch; font-size: .94rem; color: var(--muted);
       border-left: 2px solid var(--line); padding-left: .9rem; }
  .figcap b { color: var(--ink); }
  figure { margin: 0; }
  figure.pending { opacity: .85; }
  .tag { font-family: var(--rounded); color: var(--accent); }
  .mat { background: var(--mat); border: 1px solid var(--mat-line); border-radius: 12px;
       overflow: hidden; box-shadow: var(--shadow); }
  .mat img { display: block; width: 100%; height: auto; }
  .mat.gap { display: flex; align-items: center; justify-content: center; background: none;
       border-style: dashed; border-color: var(--line); box-shadow: none; }
  .mat.gap span { font-family: var(--mono); font-size: .78rem; color: var(--muted); }
  .note { margin: .35rem 0 0 !important; font-size: .82rem !important; font-style: italic;
       color: var(--muted); }
  figcaption { padding-top: .85rem; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: .55rem; margin-bottom: .3rem; }
  .stem { font-family: var(--mono); font-size: .84rem; font-weight: 600; }
  .chip { font-family: var(--mono); font-size: .7rem; padding: .1rem .45rem; color: var(--muted);
       border: 1px solid var(--line); border-radius: 5px; font-variant-numeric: tabular-nums; }
  .src { display: block; font-family: var(--mono); font-size: .72rem; color: var(--muted);
       margin: 0 0 .35rem; }
  .src a { color: var(--muted); text-decoration: none; border-bottom: 1px solid var(--line); }
  .src a:hover { color: var(--accent); border-bottom-color: var(--accent); }
  figcaption p { margin: 0; max-width: 68ch; color: var(--muted); font-size: .92rem; }
  footer { padding-top: 1.75rem; border-top: 1px solid var(--line); color: var(--muted);
       font-size: .86rem; }
  footer code { font-family: var(--mono); font-size: .82rem; background: var(--raised);
       border: 1px solid var(--line); border-radius: 5px; padding: .08rem .35rem; }
  footer p { max-width: 68ch; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Linking Proofs Figure Set</h1>
  <p class="lede">
    Path-traced figures for the linking proofs of Brouwer, Borsuk–Ulam and Poincaré —
    one visual style across the set, replacing the paper's mix of wireframe line art,
    flat schematics and hand sketches. Numbered as the paper would number them; panels
    within a figure are composed in LaTeX. Every image is unlabelled by design: labels
    go on over the render, so the poses stay pinned and one render survives any
    relabelling.
  </p>

  <div class="status">
    <div><dt>Figures</dt><dd>${figures.length}</dd></div>
    <div><dt>Panels</dt><dd>${panels.length}${missing.length ? ` <small>${missing.length} still open</small>` : ""}</dd></div>
    <div><dt>Quality</dt><dd>${spp ?? "—"} spp <small>${draft ? "draft" : "final"}</small></dd></div>
    <div><dt>Rebuild</dt><dd><small>npm run figures${draft ? " -- --draft" : ""}</small></dd></div>
  </div>

  <div class="roles">
    <span class="head">Colour roles — fixed across all three proofs</span>
    ${ROLES.map(([hex, label]) => `<span class="role"><i style="background:${hex}"></i>${label}</span>`).join("\n    ")}
  </div>

${SECTION_ORDER.filter((s) => figures.some((f) => f.section === s))
    .map((section) => {
        const inSection = figures.filter((f) => f.section === section);
        const n = inSection.length;
        return `  <section>
    <h2>${section} <b>${n} figure${n === 1 ? "" : "s"}</b></h2>
${inSection.map(figureBlock).join("\n\n")}
  </section>`;
    })
    .join("\n\n")}

  <section>
    <h2>Not in the set <b>${extras.length} considered</b></h2>
    <div class="panels" style="--cols:2">
${extras.map((p) => panelCard(p, 0, false)).join("\n")}
    </div>
  </section>

  <footer>
    <p>
      The two links on each card open the scene behind it, live: the <b>demo name</b>
      goes to the staging page with every control, the <b>preset ▸</b> applies the
      preset and starts path-tracing it in the browser. Both need a dev server —
      <code>npm run dev</code>, serving ${DEV} — and are dead links without one.
    </p>
    <p>
      Each figure is a deep link into its render page — <code>?figpreset=&lt;id&gt;</code>,
      shown after the filename — traced headless and saved unattended by
      <code>npm run figures</code>. Draft renders are 16&nbsp;spp at 1×; the final pass is
      768&nbsp;spp at 2×, which is the pixel size on each card. Pass
      <code>--embed</code> to <code>npm run figures:sheet</code> for a self-contained copy
      to send on.
    </p>
  </footer>
</div>
</body>
</html>
`;

    // the standalone copy gets its own name: it is a snapshot to send on, and a
    // later render pass would otherwise clobber it with the linked version
    const file = path.join(dir, embed ? "contact-sheet-standalone.html" : "contact-sheet.html");
    writeFileSync(file, html);
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    return { file, count: figures.length, panels: panels.length, missing: missing.length };
}

// runnable on its own, so the sheet can be rebuilt without re-rendering
if (import.meta.url === `file://${process.argv[1]}`) {
    const draft = process.argv.includes("--draft");
    const { file, count, panels, missing } = writeContactSheet({
        draft,
        embed: process.argv.includes("--embed"),
        spp: draft ? 16 : 768,
    });
    console.log(
        `${count} figures · ${panels} panels${missing ? ` (${missing} still open)` : ""} · ` +
            path.relative(root, file),
    );
}

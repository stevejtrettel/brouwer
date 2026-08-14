import { defineConfig, type PluginOption } from "vite";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * TWO WORLDS, and the dev server serves one of them at a time.
 *
 *   npm run dev:demos     the interactive pages that go online
 *   npm run dev:figures   the pages where paper figures are set up and traced
 *   npm run dev <name>    one demo on its own (index.html, the build shell)
 *
 * They are different jobs with different pages, and mixing them into a single
 * index meant guessing which of nineteen folder names was which. SITE (set by
 * scripts/run-demo.mjs) picks the index served at "/"; everything else — the
 * /d/<name>/ shells, the figure-settings endpoints — is shared.
 *
 * Named dev (DEMO=<name>) and builds bypass all of it: index.html stays the
 * single rewritable shell, one build = one demo = dist/<name>.
 */

const PALETTE = `
  :root { --ink:#33313b; --mute:#6b7a99; --line:#ddd7cb; --accent:#e4572e; --paper:#f7f4ee; }
  * { box-sizing: border-box; }
  body { font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
         background: var(--paper); color: var(--ink); line-height: 1.55;
         max-width: 860px; margin: 0 auto; padding: 3.5rem 1.5rem 5rem; }
  h1 { font-size: 1.55rem; margin: 0 0 .35rem; }
  .lede { color: var(--mute); margin: 0 0 2.2rem; font-size: .95rem; max-width: 64ch; }
  .lede a { color: var(--accent); }
  h2 { font-size: .72rem; color: var(--mute); text-transform: uppercase;
       letter-spacing: .07em; margin: 2rem 0 .6rem; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
  @media (max-width: 680px) { .cards { grid-template-columns: 1fr; } }
  .card { display: flex; flex-direction: column; gap: .3rem; text-decoration: none;
          color: inherit; background: #fff; border: 1.5px solid var(--line);
          border-radius: 13px; padding: 1.05rem 1.2rem; }
  .card:hover { border-color: var(--accent); }
  .card b { font-size: 1rem; }
  .card span { font-size: .85rem; color: var(--mute); }
  .card i { font-style: normal; font-size: .74rem; color: #9a9484;
            font-family: ui-monospace, Menlo, monospace; }
  nav { display: flex; flex-wrap: wrap; gap: .45rem; }
  nav a { padding: .42rem .8rem; border: 1px solid var(--line); border-radius: 8px;
          background: #fff; color: inherit; text-decoration: none; font-weight: 600;
          font-size: .85rem; }
  nav a:hover { border-color: var(--accent); color: var(--accent); }
  footer { margin-top: 3rem; padding-top: 1.2rem; border-top: 1px solid var(--line);
           color: var(--mute); font-size: .85rem; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: .82em; }
`;

/** The three demos the project is for — one per theorem. */
const THEOREMS = [
    {
        demo: "brouwer",
        name: "Brouwer",
        statement: "Every continuous map of the disk to itself has a fixed point.",
        move: "sculpt the map",
    },
    {
        demo: "borsuk",
        name: "Borsuk–Ulam",
        statement: "Some pair of antipodal points on the sphere gets the same value.",
        move: "sculpt the map",
    },
    {
        demo: "poincare",
        name: "Poincaré",
        statement: "Every continuous tangent field on the sphere has a zero.",
        move: "comb the sphere",
    },
];
const MAIN = new Set(THEOREMS.map((t) => t.demo));

function page(title: string, body: string): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>${PALETTE}</style></head>
<body>${body}</body></html>`;
}

function shellPage(name: string): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <script type="module" src="/demos/${name}/main.ts"></script>
  </body>
</html>`;
}

// ----------------------------------------------------------------- the demos

function demoIndexPage(root: string): string {
    const names = readdirSync(path.join(root, "demos"), { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(path.join(root, "demos", e.name, "main.ts")))
        .map((e) => e.name)
        .sort();
    const list = (filter: (n: string) => boolean): string =>
        names
            .filter(filter)
            .map((n) => `<a href="/d/${n}/">${n}</a>`)
            .join("");

    return page(
        "Demos",
        `
  <h1>Demos</h1>
  <p class="lede">The interactive pages, as they go online — one per theorem. Each is
  built standalone with <code>npm run build &lt;name&gt;</code>.
  Making paper figures instead? <code>npm run dev:figures</code>.</p>

  <div class="cards">
${THEOREMS.map(
    (t) => `    <a class="card" href="/d/${t.demo}/">
      <b>${t.name} →</b><span>${t.statement}</span><i>${t.move}</i>
    </a>`,
).join("\n")}
  </div>

  <h2>supporting</h2>
  <nav>${list((n) => !n.endsWith("-lab") && !n.endsWith("-render") && !MAIN.has(n))}</nav>
  <h2>labs — every knob, for debugging</h2>
  <nav>${list((n) => n.endsWith("-lab"))}</nav>
`,
    );
}

// --------------------------------------------------------------- the figures

/**
 * ONE BUTTON PER FIGURE. Each goes to /f/<number>/, which is that figure and
 * only that figure: its panels are the tabs there, nothing else.
 *
 * The earlier version linked to /d/<page>/?figpreset=, i.e. to the SCENE that
 * happens to stage the figure — and a scene stages several, so Figure 1's page
 * offered tabs for Figure 2 and for two cuts. Wrong unit. See src/app/figureScope.ts.
 */
function figureIndexPage(root: string, paper: any[], extras: any[]): string {
    const sheet = path.join(root, "figures", "draft", "contact-sheet.html");

    const card = (fig: any): string => {
        const built = fig.panels.filter((p: any) => !p.planned);
        const gaps = fig.panels.length - built.length;
        const n = built.length;
        const shape =
            n === 1 ? "one image" : `${n} panels — ${"abcdefgh".slice(0, n).split("").join(" · ")}`;
        return `    <a class="card" href="/f/${fig.number}/">
      <b>Figure ${fig.number} — ${fig.title}</b>
      <span>${fig.section}</span>
      <i>${shape}${gaps ? ` · ${gaps} not built` : ""}</i>
    </a>`;
    };

    return page(
        "Figures",
        `
  <style>
    .cards { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .card b { line-height: 1.3; }
  </style>
  <h1>Figures</h1>
  <p class="lede">One button per figure in the paper set. Each opens the page that builds
  that figure — its panels as tabs, its controls, and a render button. Set up, save, trace.
  ${existsSync(sheet) ? `See the <a href="/figures/draft/contact-sheet.html">rendered set</a>.` : ""}
  Working on the online demos instead? <code>npm run dev:demos</code>.</p>

  <div class="cards">
${paper.map(card).join("\n")}
  </div>

  <article>
    <h3><i>Tools</i> authoring</h3>
    <p>The figures need particular maps, not whatever the scripted bake happens to produce.
    Fold one by hand, name it, and point a figure at the name.</p>
    <div class="cards">
      <a class="card" href="/d/crumple/"><b>Fold a map →</b>
        <span>Crease and pull a disk — Brouwer's f: D² → D².</span>
        <i>positions + fold layers</i></a>
      <a class="card" href="/d/sphere-map/"><b>Crush a sphere →</b>
        <span>Brush the sphere's image flat — Borsuk's f: S² → D².</span>
        <i>positions only, no creases</i></a>
    </div>
  </article>

  <article>
    <h3><i>Cut</i> considered, not in the set</h3>
    <p>Not figures, so they have no /f/ page of their own — these open the scene that
    stages them, where every one of its presets is a tab.</p>
    <div class="cards">
${extras
    .map(
        (x: any) => `      <a class="card" href="/d/${x.page}/?figpreset=${x.preset}">
        <b>${x.file}</b><span>${x.page}</span><i>${x.preset}</i></a>`,
    )
    .join("\n")}
    </div>
  </article>

  <footer>Saved settings live in <code>figure-settings/&lt;page&gt;.json</code> and are
  re-applied on load, including by <code>npm run figures</code>.</footer>
`,
    );
}

/** Bare `npm run dev`: the two worlds, and nothing else on the page. */
function chooserPage(): string {
    return page(
        "Linking proofs",
        `
  <h1>Linking proofs</h1>
  <p class="lede">Two jobs live in this repo. Skip this page with
  <code>npm run dev:demos</code> or <code>npm run dev:figures</code>.</p>
  <div class="cards" style="grid-template-columns:1fr 1fr">
    <a class="card" href="/demos"><b>Demos →</b>
      <span>The interactive pages that go online, one per theorem.</span>
      <i>npm run dev:demos</i></a>
    <a class="card" href="/figures"><b>Figures →</b>
      <span>Set up the paper's figures and run them through the path tracer.</span>
      <i>npm run dev:figures</i></a>
  </div>
`,
    );
}

// ------------------------------------------------------------------- plugin

function site(): PluginOption {
    return {
        name: "site",
        apply: "serve",
        configureServer(server) {
            if (process.env.DEMO) return; // a named single-demo run
            const root = server.config.root;
            const which = process.env.SITE ?? "";
            const settingsDir = path.join(root, "figure-settings");
            // Sculpted maps. Checked-in assets, like rendered figures: a map
            // you folded by hand is data, and the only copy of it.
            const crumpleDir = path.join(root, "crumples");

            server.middlewares.use((req, res, next) => {
                const url = (req.url ?? "/").split("?")[0]!;

                // --- figure settings: the workbench's "save settings" ---
                // Ordinary checked-in data, not a cache. A figure is reproducible
                // only if the pose and scene state that made it outlive the tab,
                // and the headless pass drives these same pages.
                const key = /^\/__figure-settings\/([\w-]+)$/.exec(url)?.[1];
                if (key) {
                    const file = path.join(settingsDir, `${path.basename(key)}.json`);
                    if (req.method === "GET") {
                        res.setHeader("content-type", "application/json");
                        res.end(existsSync(file) ? readFileSync(file, "utf8") : "{}");
                        return;
                    }
                    if (req.method === "POST") {
                        let body = "";
                        req.on("data", (chunk) => (body += chunk));
                        req.on("end", () => {
                            try {
                                const { id, entry } = JSON.parse(body) as {
                                    id: string;
                                    entry: unknown;
                                };
                                const all = existsSync(file)
                                    ? (JSON.parse(readFileSync(file, "utf8")) as Record<
                                          string,
                                          unknown
                                      >)
                                    : {};
                                all[id] = entry;
                                mkdirSync(settingsDir, { recursive: true });
                                writeFileSync(file, `${JSON.stringify(all, null, 4)}\n`);
                                res.end(`{"ok":true}`);
                            } catch (error) {
                                res.statusCode = 400;
                                res.end(JSON.stringify({ error: String(error) }));
                            }
                        });
                        return;
                    }
                }

                // --- saved crumples: a sculpted map plus its fold layers ---
                const crumple = /^\/__crumple\/([\w-]+)$/.exec(url)?.[1];
                if (crumple) {
                    const file = path.join(crumpleDir, `${path.basename(crumple)}.json`);
                    if (req.method === "GET") {
                        res.setHeader("content-type", "application/json");
                        // absent is not an error: every scene has a scripted
                        // fallback and should open on it
                        res.end(existsSync(file) ? readFileSync(file, "utf8") : `{"missing":true}`);
                        return;
                    }
                    if (req.method === "POST") {
                        let body = "";
                        req.on("data", (chunk) => (body += chunk));
                        req.on("end", () => {
                            try {
                                JSON.parse(body); // reject anything unreadable
                                mkdirSync(crumpleDir, { recursive: true });
                                writeFileSync(file, body.endsWith("\n") ? body : `${body}\n`);
                                res.end(`{"ok":true}`);
                            } catch (error) {
                                res.statusCode = 400;
                                res.end(JSON.stringify({ error: String(error) }));
                            }
                        });
                        return;
                    }
                }

                // --- the two indexes, and one shell per demo folder ---
                const wanted = /^\/d\/([\w-]+)\/?$/.exec(url)?.[1];
                const send = (html: string): void => {
                    void server.transformIndexHtml(url, html).then((out) => {
                        res.setHeader("content-type", "text/html");
                        res.end(out);
                    });
                };

                const figures = (): void => {
                    void import("./scripts/figures.manifest.mjs").then((m) =>
                        send(figureIndexPage(root, m.PAPER, m.EXTRAS)),
                    );
                };
                // both indexes always have a URL; SITE only decides what "/" is,
                // and bare `npm run dev` leaves "/" as a two-way chooser
                if (url === "/demos" || url === "/demos/") return send(demoIndexPage(root));
                if (url === "/figures" || url === "/figures/") return figures();

                // --- one page per figure ---
                // /f/<n>/ loads the render page that stages figure n. The page
                // itself reads the number back off this path and shows only
                // that figure's panels — src/app/figureScope.ts.
                const figNo = /^\/f\/(\d+)\/?$/.exec(url)?.[1];
                if (figNo) {
                    void import("./scripts/figures.manifest.mjs").then((m) => {
                        const fig = m.PAPER.find((f) => f.number === Number(figNo));
                        const demo = fig?.panels.find((p) => p.page)?.page;
                        if (!demo) {
                            res.statusCode = 404;
                            res.end(
                                fig
                                    ? `Figure ${figNo} has no panel with a render page yet.`
                                    : `No figure ${figNo} in scripts/figures.manifest.mjs.`,
                            );
                            return;
                        }
                        send(shellPage(demo));
                    });
                    return;
                }
                if (url === "/" || url === "/index.html") {
                    if (which === "demos") return send(demoIndexPage(root));
                    if (which === "figures") return figures();
                    return send(chooserPage());
                }
                if (wanted && existsSync(path.join(root, "demos", wanted, "main.ts"))) {
                    return send(shellPage(wanted));
                }
                next();
            });
        },
    };
}

export default defineConfig({
    // relative base so each built demo works at any subpath / in an iframe
    base: "./",
    assetsInclude: ["**/*.hdr", "**/*.exr"],
    plugins: [site()],
    build: {
        target: "esnext",
        outDir: "dist", // run-demo.mjs overrides with --outDir dist/<demo>
        emptyOutDir: true,
    },
    test: {
        // `npm test` is the FAST suite: math plus the node-level control tests.
        // The browser smoke specs (test/ui/*.spec.ts) boot vite and drive Chrome,
        // so they live behind `npm run test:ui` — see vitest.ui.config.ts.
        include: ["test/**/*.test.ts"],
    },
});

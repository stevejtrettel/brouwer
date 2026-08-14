// Same convention as threejs-demos: demo name = folder name under demos/.
//
//   npm run dev:demos        the interactive pages that go online
//   npm run dev:figures      the pages where paper figures are set up and traced
//   npm run dev              both, behind a chooser
//   npm run dev <demo>       one demo on its own
//   npm run build <demo>     build it → dist/<demo>
//
// SITE tells vite.config which index to serve at "/"; DEMO (set below for a
// named run) tells it to stand down entirely. A named run generates index.html
// from index.template.html, because vite needs a real entry file at the root —
// it is GENERATED and gitignored: which demo it points at is a property of the
// command you just ran, not of the repo.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const [, , mode, arg] = process.argv;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (mode === "site") {
    // `dev:demos` / `dev:figures` — no index.html rewrite, no DEMO
    const child = spawn("npx", ["vite"], {
        stdio: "inherit",
        cwd: root,
        env: { ...process.env, SITE: arg === "figures" ? "figures" : "demos" },
    });
    child.on("exit", (code) => process.exit(code ?? 0));
} else if (!arg) {
    if (mode === "dev") {
        const child = spawn("npx", ["vite"], { stdio: "inherit", cwd: root });
        child.on("exit", (code) => process.exit(code ?? 0));
    } else {
        console.error(`Usage: npm run ${mode ?? "<dev|build|preview>"} <demo-name>`);
        process.exit(1);
    }
} else {
    runDemo();
}

function runDemo() {

const demo = arg;
const demoEntry = path.join(root, "demos", demo, "main.ts");
if (!existsSync(demoEntry)) {
    console.error(`Demo not found: demos/${demo}/main.ts`);
    process.exit(1);
}

const templatePath = path.join(root, "index.template.html");
if (!existsSync(templatePath)) {
    console.error("Missing index.template.html — it is the source of the generated index.html");
    process.exit(1);
}
const template = readFileSync(templatePath, "utf8");
if (!template.includes("__DEMO__")) {
    console.error("index.template.html has no __DEMO__ placeholder to fill in");
    process.exit(1);
}
writeFileSync(path.join(root, "index.html"), template.replaceAll("__DEMO__", demo));

const viteArgs =
    mode === "build"
        ? ["build", "--outDir", `dist/${demo}`]
        : mode === "preview"
          ? ["preview", "--outDir", `dist/${demo}`]
          : [];
// DEMO tells the dev-hub plugin to stand down for named runs
const child = spawn("npx", ["vite", ...viteArgs], {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, DEMO: demo },
});
child.on("exit", (code) => process.exit(code ?? 0));
}

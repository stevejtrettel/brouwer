// Screenshot demos with deviceScaleFactor 2 (retina emulation) — regression
// check for the pixel-ratio viewport bug.
import { chromium } from "playwright-core";

const port = process.argv[3] ?? "5174";
const outDir = process.argv[2] ?? ".";
const browser = await chromium.launch({ channel: "chrome", headless: true });

for (const demo of ["disk", "brouwer", "borsuk", "poincare"]) {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/demos/${demo}/index.html`);
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${outDir}/retina-${demo}.png` });
    console.log(`${demo}: ${errors.length ? errors.join("; ") : "ok"}`);
    await page.close();
}
await browser.close();

// Drive the disk playground: screenshot at rest, drag a handle across the
// image panel, screenshot the crumple, and read the meters.
import { chromium } from "playwright-core";

const port = process.argv[3] ?? "5174";
const outDir = process.argv[2] ?? ".";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`http://localhost:${port}/demos/disk/index.html`);
await page.waitForTimeout(4000);
await page.screenshot({ path: `${outDir}/disk-rest.png` });

// image panel occupies the right half; its ortho view is contain-fit.
// Panel center (disk center) in CSS pixels:
const cx = 1440 * 0.75;
const cy = 450;
// contain-fit: panel aspect = 720/900 = 0.8 < 1, so the frustum is
// width-fit — halfWidth = 1.15 spans 360px
const scale = 360 / 1.15;
const world = (x, y) => [cx + x * scale, cy - y * scale];

// grab near the outer ring on the +x side and drag across the disk
await page.mouse.move(...world(0.7, 0.12));
await page.mouse.down();
for (let i = 0; i <= 12; i++) {
    await page.mouse.move(...world(0.62 - (1.1 * i) / 12, 0.25 * Math.sin((i / 12) * Math.PI)));
    await page.waitForTimeout(40);
}
await page.mouse.up();
await page.waitForTimeout(800);

for (const name of ["folds", "fixed points", "Σ index"]) {
    const value = await page
        .locator(".lil-controller", { hasText: name })
        .locator("input")
        .first()
        .inputValue();
    console.log(`${name}: ${value}`);
}
console.log("ERRORS:", errors.length ? errors : "none");
await page.screenshot({ path: `${outDir}/disk-dragged.png` });
await browser.close();

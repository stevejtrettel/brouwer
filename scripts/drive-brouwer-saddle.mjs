// Drive the Brouwer demo into a 3-fixed-point configuration (two nodes and
// a saddle) and capture the Lefschetz meters + landmark markers.
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5179/demos/brouwer/index.html?r=0.9");
await page.waitForTimeout(4000);

const setControl = async (label, value) => {
    const input = page
        .locator(".lil-controller", { hasText: label })
        .locator("input")
        .first();
    await input.fill(String(value));
    await input.press("Enter");
};
await setControl("contraction a", 0.85);
await setControl("twist τ", 4.5);
await setControl("shift x", 0.4);
await page.waitForTimeout(1500);

for (const name of ["fixed points", "Σ index", "Lk(Γf, Γi)"]) {
    const value = await page
        .locator(".lil-controller", { hasText: name })
        .locator("input")
        .first()
        .inputValue();
    console.log(`${name}: ${value}`);
}
console.log("ERRORS:", errors.length ? errors : "none");
await page.screenshot({ path: process.argv[2] ?? "saddle.png" });
await browser.close();

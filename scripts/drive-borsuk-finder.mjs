// Drive the Borsuk demo: check the unlinked near-pole state, then click
// "find antipodal pair" and capture the result.
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5179/demos/borsuk/index.html?s=0.1");
await page.waitForTimeout(4000);
console.log("STATUS near pole:", await page.textContent(".proof-overlay .status"));
await page.screenshot({ path: (process.argv[2] ?? ".") + "/borsuk-unlinked.png" });

await page.click("text=find antipodal pair");
await page.waitForTimeout(2500);
console.log("STATUS at pair:", await page.textContent(".proof-overlay .status"));
console.log("CAPTION:", await page.textContent(".proof-overlay .caption"));
console.log("ERRORS:", errors.length ? errors : "none");
await page.screenshot({ path: (process.argv[2] ?? ".") + "/borsuk-pair.png" });
await browser.close();

// Drive the Brouwer demo: start at r = 0.05 (unlinked), click
// "find fixed point", capture the announced result and a screenshot.
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto("http://localhost:5179/demos/brouwer/index.html?r=0.05");
await page.waitForTimeout(4000);

await page.click("text=find fixed point");
await page.waitForTimeout(2500);

const status = await page.textContent(".proof-overlay .status");
const caption = await page.textContent(".proof-overlay .caption");
console.log("STATUS:", status);
console.log("CAPTION:", caption);
console.log("ERRORS:", errors.length ? errors : "none");

await page.screenshot({ path: process.argv[2] ?? "finder-result.png" });
await browser.close();

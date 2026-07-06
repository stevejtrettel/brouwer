import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const t0 = Date.now();
await page.goto(`http://localhost:${process.argv[2] ?? "5174"}/demos/disk/index.html`);
console.log("load event:", Date.now() - t0, "ms");
await browser.close();

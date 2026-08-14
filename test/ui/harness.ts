/**
 * Browser-suite plumbing: one Chrome for the run, a page per demo, and the two
 * kinds of observation available without any test hook in the demos —
 *
 *   PANEL PIXELS  each demo lays its viewports out in known canvas fractions, so
 *                 the pixels of one panel are a fingerprint of that panel's
 *                 state. This is what separates a comb from an orbit: combing the
 *                 field re-fills the graph curve, so the TORUS panel changes;
 *                 orbiting the sphere leaves it untouched. Panels are stable
 *                 when idle (Marker.animate returns early while invisible, and
 *                 nothing else animates unless a sweep is playing), so
 *                 "unchanged" is a fair assertion.
 *
 *                 Read from the WEBGL CANVAS, not from a screenshot: a
 *                 screenshot also captures the kit's DOM chrome sitting over the
 *                 panel, so a control merely losing :hover between two shots
 *                 would read as the scene changing. Blocks are averaged 4× down,
 *                 which discards sub-pixel AA noise while keeping any real
 *                 motion.
 *
 *   KIT DOM       the labs render meters through ui/controls.ts: `.uk-readout`
 *                 holds "<label> <b>value</b>", and the title block writes
 *                 `.uk-status` / `.uk-caption`.
 */

import { chromium, type Browser, type Page } from "playwright-core";
import { inject } from "vitest";

export const VIEWPORT = { width: 1440, height: 900 };

/** The layouts the demos use, as CSS-pixel rectangles at VIEWPORT size. */
export const PANEL = {
    torusWide: { x: 480, y: 0, width: 960, height: 900 }, // rect x:1/3 w:2/3
    sphereTopLeft: { x: 0, y: 0, width: 480, height: 450 }, // rect y:0.5 h:0.5
    panelBottomLeft: { x: 0, y: 450, width: 480, height: 450 },
} as const;

/** Centre of a panel rect, for pointer gestures. */
export function centre(panel: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
} {
    return { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 };
}

let browser: Browser | undefined;

export async function getBrowser(): Promise<Browser> {
    browser ??= await chromium.launch({ channel: "chrome", headless: true });
    return browser;
}

export async function closeBrowser(): Promise<void> {
    await browser?.close();
    browser = undefined;
}

/** A downsampled RGB fingerprint of one panel's rendered pixels. */
export type PanelPixels = number[];

export interface Panel {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DemoPage {
    page: Page;
    /** anything the page logged as an error, or threw */
    errors: string[];
    /** rendered pixels of one panel, straight off the WebGL canvas */
    shot(panel: Panel): Promise<PanelPixels>;
    /** base64 PNG of one panel, chrome included — for "did anything render" */
    screenshot(panel: Panel): Promise<string>;
    /** value text of a `.uk-readout` whose label contains `label` */
    meter(label: string): Promise<string>;
    status(): Promise<string>;
    caption(): Promise<string>;
    drag(
        from: { x: number; y: number },
        to: { x: number; y: number },
        options?: { button?: "left" | "right"; steps?: number; press?: boolean },
    ): Promise<void>;
    close(): Promise<void>;
}

/**
 * Open a demo from the dev hub and wait for it to settle: the scene builds,
 * lights/environment compile, and any startup sweep finishes. Deliberately a
 * fixed wait — there is no readiness signal to poll without adding one to the
 * demos, which is precisely what we are not doing.
 */
export async function openDemo(name: string, options: { deviceScaleFactor?: number } = {}): Promise<DemoPage> {
    const base = inject("demoServer");
    if (!base) throw new Error("no dev server — is test/ui/server.ts registered as globalSetup?");

    const context = await (await getBrowser()).newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: options.deviceScaleFactor ?? 1,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    page.on("console", (m) => {
        // the generic "Failed to load resource" is logged with no URL; the
        // response listener below reports the same failure usefully
        if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
            errors.push(`console: ${m.text()}`);
        }
    });
    page.on("response", (r) => {
        // a favicon nobody asked for is the browser's business, not the demo's
        if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) {
            errors.push(`http ${r.status()}: ${r.url()}`);
        }
    });

    await page.goto(`${base}/d/${name}/`);
    await page.waitForTimeout(3500);

    return {
        page,
        errors,
        async shot(panel) {
            return page.evaluate(
                ({ x, y, width, height, block }) => {
                    const canvas = document.querySelector("canvas");
                    if (!canvas) throw new Error("no canvas");
                    // the backing store is devicePixelRatio-scaled; CSS layout
                    // is what the panel rects are expressed in
                    const sx = canvas.width / window.innerWidth;
                    const sy = canvas.height / window.innerHeight;
                    const w = Math.floor(width / block);
                    const h = Math.floor(height / block);
                    const off = document.createElement("canvas");
                    off.width = w;
                    off.height = h;
                    const g = off.getContext("2d");
                    if (!g) throw new Error("no 2d context");
                    // drawImage does the box filter for us
                    g.drawImage(canvas, x * sx, y * sy, width * sx, height * sy, 0, 0, w, h);
                    const data = g.getImageData(0, 0, w, h).data;
                    const out: number[] = [];
                    for (let i = 0; i < data.length; i += 4) {
                        out.push(data[i]!, data[i + 1]!, data[i + 2]!);
                    }
                    return out;
                },
                { ...panel, block: 4 },
            );
        },
        async screenshot(panel) {
            return (await page.screenshot({ clip: panel })).toString("base64");
        },
        async meter(label) {
            const row = page.locator(".uk-readout", { hasText: label }).first();
            return ((await row.locator("b").textContent()) ?? "").trim();
        },
        async status() {
            return ((await page.locator(".uk-status").first().textContent()) ?? "").trim();
        },
        async caption() {
            return ((await page.locator(".uk-caption").first().textContent()) ?? "").trim();
        },
        async drag(from, to, opts = {}) {
            const button = opts.button ?? "left";
            const steps = opts.steps ?? 16;
            // `press: true` skips the move-before-press, which is how a stale
            // orbit gate used to swallow the gesture
            if (!opts.press) await page.mouse.move(from.x, from.y);
            await page.mouse.down({ button });
            for (let i = 1; i <= steps; i++) {
                await page.mouse.move(
                    from.x + ((to.x - from.x) * i) / steps,
                    from.y + ((to.y - from.y) * i) / steps,
                );
                await page.waitForTimeout(16);
            }
            await page.mouse.up({ button });
            // the brush/sculptor settle loops run ~45 frames after release
            await page.waitForTimeout(1600);
        },
        async close() {
            await context.close();
        },
    };
}

/**
 * Is this panel actually showing something? A blank panel (failed WebGL, a scene
 * that never built) is one flat colour, so its blocks barely vary.
 */
export function looksRendered(pixels: PanelPixels): boolean {
    let min = 255;
    let max = 0;
    for (const v of pixels) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return max - min > 40;
}

/**
 * Fraction of blocks that differ between two panel fingerprints. `0` means the
 * scene is exactly where it was; a real gesture moves percent-scale fractions.
 * The per-block floor absorbs the last of the renderer's dithering noise.
 */
export function diffFraction(a: PanelPixels, b: PanelPixels): number {
    if (a.length !== b.length) throw new Error("panel fingerprints differ in size");
    let changed = 0;
    for (let i = 0; i < a.length; i += 3) {
        const d =
            Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
        if (d > 8) changed++;
    }
    return changed / (a.length / 3);
}

/** A gesture that reached the scene moves well over 1% of a panel's blocks. */
export const MOVED = 0.01;
/** Idle panels come back bit-identical; allow a hair for renderer noise. */
export const STILL = 0.001;

/**
 * Wait until a panel stops changing on its own, then return its pixels.
 *
 * Needed because OrbitControls damping keeps a camera creeping for a second or
 * more after the last input — and after the auto-rotate a demo may run at
 * startup. A fixed delay before a baseline shot is a race: the creep is far
 * below a real gesture but comfortably above STILL, so it reads as "the drag
 * changed something" long after the drag is over.
 */
export async function settled(
    demo: { shot(panel: Panel): Promise<PanelPixels>; page: Page },
    panel: Panel,
    tries = 12,
): Promise<PanelPixels> {
    let previous = await demo.shot(panel);
    for (let i = 0; i < tries; i++) {
        await demo.page.waitForTimeout(400);
        const next = await demo.shot(panel);
        if (diffFraction(previous, next) < 0.0004) return next;
        previous = next;
    }
    return previous;
}

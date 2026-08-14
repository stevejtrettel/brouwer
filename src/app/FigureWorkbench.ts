/**
 * FigureWorkbench — one page per figure, with its configurations as tabs.
 *
 * This replaces attachRenderControls on figure pages. The complaint it exists
 * to answer: on a render page you could not tell what was the FIGURE and what
 * was scaffolding for setting the figure up. Everything floated on one canvas
 * at once — sliders, status text, the scene, three viewports — and the shape
 * of the thing being made was nowhere on screen.
 *
 * So the layout is literal about it:
 *
 *   ┌─ tab bar ──────────────────────────────────┬──────────┐
 *   │                                            │          │
 *   │        ┌───────────────────────┐           │  SETUP   │
 *   │        │   THE FIGURE          │           │  drawer  │
 *   │        │   (true aspect, on a  │           │          │
 *   │        │    matte, framed)     │           │  every   │
 *   │        └───────────────────────┘           │  control │
 *   │        ┌────┐ ┌────┐   setup views         │          │
 *   │        └────┘ └────┘   (not in the figure) │  save ·  │
 *   │                                            │  render  │
 *   └────────────────────────────────────────────┴──────────┘
 *
 * The preview box is inset to the figure's OWN aspect (1440×900, 1900×620, …),
 * so what is inside the frame is what the render will contain — no more, no
 * less. Auxiliary viewports (a sculptable panel, a domain sphere) are pushed
 * into a labelled strip underneath, where they cannot be mistaken for part of
 * the output. Hitting render pins the canvas to that same aspect, so the traced
 * PNG matches the preview exactly.
 *
 * SETTINGS. A configuration is only reproducible if the pose and the scene
 * state that produced it survive the tab being left. "Save settings" POSTs the
 * camera, the config's own captured state, the output size and the render
 * quality to the dev server, which writes figure-settings/<page>.json; the page
 * reads it back on load and re-applies it over the preset's defaults. Since the
 * headless render pass drives these same pages, a saved setting is what gets
 * rendered — the preset in code is the starting point, the file is the record.
 */

import type { PerspectiveCamera } from "three";
import { Color } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { App } from "./App.ts";
import type { Viewport } from "./ViewManager.ts";
import type { FigureMode } from "./FigureRenderer.ts";
import { theme } from "../components/theme.ts";
import { resolveFigureScope } from "./figureScope.ts";

const TOP = 46; // tab bar
const SIDE = 312; // setup drawer
const PAD = 26; // breathing room around the preview box
const AUX = 118; // height of the setup-views strip

export interface WorkbenchView {
    camera: PerspectiveCamera;
    controls: OrbitControls;
    viewport: Viewport;
}

export interface FigureConfig {
    /** matches the manifest preset id, and the ?figpreset= deep link */
    id: string;
    /** tab text — short */
    label: string;
    /** what this configuration IS, e.g. "Figure 5(b) — near the pole" */
    title: string;
    figure: FigureMode;
    /** the view that becomes the preview window */
    view: WorkbenchView;
    /** output size "WxH"; the preview box takes this aspect */
    size?: string;
    apply(): void;
    /** scene state worth persisting (φ, r, toggles …) */
    capture?(): Record<string, unknown>;
    /** re-apply a saved capture() */
    restore?(state: Record<string, unknown>): void;
}

export interface WorkbenchOptions {
    app: App;
    /** demo folder name — the settings file is keyed by it */
    page: string;
    title: string;
    configs: FigureConfig[];
    /** viewports that are scaffolding, not output */
    aux?: { label: string; viewport: Viewport }[];
    /** the page's controls; they live in the drawer, never over the figure */
    controls?: { el: HTMLElement }[];
    /** which configuration is live. Pages need this because several configs
     *  usually share ONE FigureMode (the same view traces all of them), so a
     *  page cannot work it out by asking which figure is active. */
    onSelect?: (config: FigureConfig) => void;
    /** State the page's configurations SHARE — a radius, a latitude — as
     *  opposed to state that belongs to one of them (a pose, a toggle).
     *
     *  Shared state is saved once under a reserved key and applied before any
     *  configuration, so every panel of a figure is drawn at the same r. Left
     *  per-config it would both reset on every tab switch and drift between
     *  panels that the paper prints side by side, which is exactly what a
     *  reader would read as a change in the mathematics. */
    pageCapture?(): Record<string, unknown>;
    pageRestore?(state: Record<string, unknown>): void;
}

interface SavedConfig {
    cam?: number[];
    size?: string;
    state?: Record<string, unknown>;
    render?: { spp?: number; scale?: number; bounces?: number };
}

const parseSize = (size: string | undefined): { width: number; height: number } => {
    const [w, h] = (size ?? "1440x900").split("x").map(Number);
    return { width: w || 1440, height: h || 900 };
};

export function attachWorkbench(options: WorkbenchOptions): void {
    const { app } = options;

    // Under /f/<n>/ the page is ONE figure: its tabs are that figure's panels,
    // in paper order, and nothing else. Everywhere else every preset shows, as
    // before. See figureScope.ts for why the two modes exist.
    const scope = resolveFigureScope(options.page);
    const configs = scope
        ? (scope.panels
              .map((panel) => options.configs.find((c) => c.id === panel.preset))
              .filter(Boolean) as FigureConfig[])
        : options.configs;

    if (!configs.length) {
        document.body.textContent = scope
            ? `Figure ${scope.figure.number} has no built panels on ${options.page}.`
            : `${options.page} defines no figure configurations.`;
        return;
    }

    let current = configs[0]!;
    let saved: Record<string, SavedConfig> = {};

    injectStyles();
    app.views.matte = new Color(theme.paper.environmentBottom);

    // ------------------------------------------------------------ chrome
    const bar = el("div", "wb-bar");
    const brand = el("div", "wb-brand");
    brand.textContent = scope
        ? `Figure ${scope.figure.number} — ${scope.figure.title}`
        : options.title;
    const tabs = el("div", "wb-tabs");
    bar.append(brand, tabs);
    if (scope) {
        const back = el("a", "wb-back") as HTMLAnchorElement;
        back.href = "/";
        back.textContent = "← all figures";
        bar.prepend(back);
    }

    // A single-panel figure has nothing to switch between, so it gets no tabs
    // at all rather than one tab that does nothing.
    const showTabs = configs.length > 1;
    const tabButtons = configs.map((config, i) => {
        const b = el("button", "wb-tab");
        // In figure scope the tabs ARE the figure's panels, so letter them the
        // way the paper letters its subfigures — the tab and the LaTeX
        // subfigure then name the same thing. On a scene page the same configs
        // belong to different figures, where a letter would be a lie.
        b.textContent = scope ? `(${"abcdefgh"[i]}) ${config.label}` : config.label;
        b.addEventListener("click", () => select(config));
        if (showTabs) tabs.appendChild(b);
        return b;
    });

    // Panels the paper wants that have no preset yet: shown, disabled, so a
    // hole in the figure is visible here as well as on the contact sheet.
    if (scope) {
        for (const panel of scope.figure.panels.filter((p) => p.planned)) {
            const b = el("button", "wb-tab wb-pending");
            b.textContent = `${panel.file} — not built`;
            b.title = panel.note ?? "";
            (b as HTMLButtonElement).disabled = true;
            tabs.appendChild(b);
        }
    }

    const drawer = el("div", "wb-drawer");
    const heading = el("div", "wb-heading");
    heading.innerHTML = "<b>Setup</b><span>none of this is in the figure</span>";
    const controlBox = el("div", "wb-controls");
    for (const widget of options.controls ?? []) controlBox.appendChild(widget.el);

    const sizeBox = el("div", "wb-field");
    const sizeInput = document.createElement("input");
    sizeInput.className = "wb-input";
    sizeInput.spellcheck = false;
    sizeBox.append(label("output size"), sizeInput);
    sizeInput.addEventListener("change", () => {
        current.size = sizeInput.value.trim();
        layout();
    });

    const quality = el("div", "wb-field");
    const sppInput = numberInput(768);
    const scaleInput = numberInput(2);
    const bounceInput = numberInput(24);
    quality.append(
        label("samples · scale · bounces"),
        row(sppInput, scaleInput, bounceInput),
    );

    const actions = el("div", "wb-actions");
    const saveBtn = el("button", "wb-btn");
    saveBtn.textContent = "⤓ save settings";
    const renderBtn = el("button", "wb-btn wb-go");
    renderBtn.textContent = "◉ render";
    const note = el("div", "wb-note");
    actions.append(saveBtn, renderBtn, note);

    drawer.append(heading, controlBox, sizeBox, quality, actions);

    // the frame drawn around the preview box, and its caption
    const frame = el("div", "wb-frame");
    const stamp = el("div", "wb-stamp");
    const auxLabel = el("div", "wb-auxlabel");
    auxLabel.textContent = "setup views — not part of the figure";
    auxLabel.style.display = options.aux?.length ? "" : "none";

    document.body.append(bar, drawer, frame, stamp, auxLabel);
    document.body.classList.add("wb-body");

    // ------------------------------------------------------------ layout
    function layout(): void {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const hasAux = Boolean(options.aux?.length);
        const areaX = PAD;
        const areaY = TOP + PAD;
        const areaW = Math.max(80, W - SIDE - 2 * PAD);
        const areaH = Math.max(80, H - TOP - 2 * PAD - (hasAux ? AUX : 0));

        const { width, height } = parseSize(current.size);
        const aspect = width / height;
        let bw = Math.min(areaW, areaH * aspect);
        let bh = bw / aspect;
        if (bh > areaH) {
            bh = areaH;
            bw = bh * aspect;
        }
        const bx = areaX + (areaW - bw) / 2;
        const by = areaY + (areaH - bh) / 2;

        // canvas rects are fractions with a BOTTOM-left origin
        Object.assign(current.view.viewport.rect, {
            x: bx / W,
            y: (H - by - bh) / H,
            w: bw / W,
            h: bh / H,
        });

        // Every other figure view parks off-canvas: one preview at a time.
        //
        // This walks the PAGE's full config list, not the scoped one. Under
        // /f/<n>/ the scoped list holds only that figure's panels, so a view
        // belonging to some other figure on the same page — the domain sphere,
        // say — would never be parked and would sit on top of the preview.
        for (const config of options.configs) {
            if (config.view === current.view) continue;
            Object.assign(config.view.viewport.rect, { x: 2, y: 2, w: 0.001, h: 0.001 });
        }

        Object.assign(frame.style, {
            left: `${bx}px`,
            top: `${by}px`,
            width: `${bw}px`,
            height: `${bh}px`,
        });
        stamp.textContent = `${current.title}   ·   ${width}×${height}`;
        Object.assign(stamp.style, { left: `${bx}px`, top: `${by - 22}px` });

        if (hasAux) {
            const n = options.aux!.length;
            const gap = 14;
            const ah = AUX - 26;
            const aw = ah * 1.25;
            const totalW = n * aw + (n - 1) * gap;
            let ax = areaX + Math.max(0, (areaW - totalW) / 2);
            const ay = areaY + areaH + 22;
            for (const entry of options.aux!) {
                Object.assign(entry.viewport.rect, {
                    x: ax / W,
                    y: (H - ay - ah) / H,
                    w: aw / W,
                    h: ah / H,
                });
                ax += aw + gap;
            }
            Object.assign(auxLabel.style, { left: `${areaX}px`, top: `${ay - 18}px` });
        }

        app.views.resize(W, H);
    }

    // ------------------------------------------------------------ settings
    // Not a config id — the page's shared state lives under this key in the
    // same file, so one save writes both.
    const PAGE_KEY = "__page";

    async function loadSettings(): Promise<void> {
        try {
            const res = await fetch(`/__figure-settings/${options.page}`);
            if (res.ok) saved = (await res.json()) as Record<string, SavedConfig>;
        } catch {
            /* no dev server (a built page): presets stand on their own */
        }
        const shared = saved[PAGE_KEY]?.state;
        if (shared) options.pageRestore?.(shared);
    }

    function applySaved(config: FigureConfig): void {
        const entry = saved[config.id];
        if (!entry) return;
        if (entry.size) config.size = entry.size;
        if (entry.state) config.restore?.(entry.state);
        if (entry.cam?.length === 6) {
            const c = entry.cam;
            config.view.camera.position.set(c[0]!, c[1]!, c[2]!);
            config.view.controls.target.set(c[3]!, c[4]!, c[5]!);
            config.view.controls.update();
        }
        if (entry.render) {
            if (entry.render.spp) sppInput.value = String(entry.render.spp);
            if (entry.render.scale) scaleInput.value = String(entry.render.scale);
            if (entry.render.bounces) bounceInput.value = String(entry.render.bounces);
        }
    }

    async function save(): Promise<void> {
        const p = current.view.camera.position;
        const t = current.view.controls.target;
        const entry: SavedConfig = {
            cam: [p.x, p.y, p.z, t.x, t.y, t.z].map((v) => Number(v.toFixed(4))),
            size: current.size ?? "1440x900",
            state: current.capture?.() ?? {},
            render: {
                spp: Number(sppInput.value),
                scale: Number(scaleInput.value),
                bounces: Number(bounceInput.value),
            },
        };
        saved[current.id] = entry;
        const post = (id: string, body: unknown): Promise<Response> =>
            fetch(`/__figure-settings/${options.page}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id, entry: body }),
            });
        try {
            const res = await post(current.id, entry);
            const shared = options.pageCapture?.();
            if (shared) {
                saved[PAGE_KEY] = { state: shared };
                await post(PAGE_KEY, { state: shared });
            }
            flash(res.ok ? `saved → figure-settings/${options.page}.json` : "save failed");
        } catch {
            flash("save failed — no dev server");
        }
    }

    let flashTimer = 0;
    function flash(text: string): void {
        note.textContent = text;
        window.clearTimeout(flashTimer);
        flashTimer = window.setTimeout(() => {
            note.textContent = "";
        }, 2600);
    }

    // ------------------------------------------------------------ actions
    function select(config: FigureConfig): void {
        current = config;
        for (let i = 0; i < configs.length; i++) {
            tabButtons[i]!.classList.toggle("wb-on", configs[i] === config);
        }
        config.apply();
        applySaved(config);
        sizeInput.value = config.size ?? "1440x900";
        options.onSelect?.(config);
        layout();
    }

    saveBtn.addEventListener("click", () => void save());
    renderBtn.addEventListener("click", () => {
        current.figure.configure({
            spp: Number(sppInput.value),
            scale: Number(scaleInput.value),
            bounces: Number(bounceInput.value),
        });
        current.figure.enter();
    });

    // the figure's own bar owns the exit; chrome hides while it traces
    let wasActive = false;
    const tick = (): void => {
        const active = configs.some((c) => c.figure.active);
        if (active !== wasActive) {
            wasActive = active;
            document.body.classList.toggle("wb-tracing", active);
            if (!active) layout();
        }
        requestAnimationFrame(tick);
    };
    tick();

    window.addEventListener("resize", layout);

    // ------------------------------------------------------------- start
    void loadSettings().then(() => {
        const query = new URLSearchParams(window.location.search);
        const wanted = query.get("figpreset");
        select(configs.find((c) => c.id === wanted) ?? configs[0]!);
        // ?trace=1 goes straight into the path tracer — how the headless pass
        // drives these pages, and what "trace it live" links use. Without it a
        // ?figpreset= link opens the WORKBENCH on that tab, which is what you
        // want when the figure is still being argued about.
        if (query.get("trace") === "1") {
            const q = (name: string, fallback: number): number => {
                const value = Number(query.get(name));
                return Number.isFinite(value) && value > 0 ? value : fallback;
            };
            sppInput.value = String(q("spp", Number(sppInput.value)));
            scaleInput.value = String(q("fscale", Number(scaleInput.value)));
            requestAnimationFrame(() => renderBtn.click());
        }
    });
}

// ------------------------------------------------------------------ dom bits

function el(tag: string, className: string): HTMLElement {
    const node = document.createElement(tag);
    node.className = className;
    return node;
}

function label(text: string): HTMLElement {
    const node = el("span", "wb-fieldlabel");
    node.textContent = text;
    return node;
}

function row(...nodes: HTMLElement[]): HTMLElement {
    const node = el("div", "wb-row");
    node.append(...nodes);
    return node;
}

function numberInput(value: number): HTMLInputElement {
    const input = document.createElement("input");
    input.className = "wb-input wb-num";
    input.type = "number";
    input.value = String(value);
    return input;
}

function injectStyles(): void {
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    const style = document.createElement("style");
    style.textContent = `
        .wb-body { background: #e9e6df; }
        .wb-back {
            color: #6b7a99; text-decoration: none; font-size: 12px;
            font-weight: 600; margin-right: 14px; white-space: nowrap;
        }
        .wb-back:hover { color: #e4572e; }
        .wb-tab.wb-pending {
            opacity: 0.45; cursor: not-allowed; font-style: italic;
        }
        .wb-bar, .wb-drawer, .wb-frame, .wb-stamp, .wb-auxlabel {
            font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
            color: #33313b; user-select: none;
        }
        .wb-tracing .wb-bar, .wb-tracing .wb-drawer, .wb-tracing .wb-frame,
        .wb-tracing .wb-stamp, .wb-tracing .wb-auxlabel { display: none; }

        .wb-bar {
            position: fixed; inset: 0 0 auto 0; height: ${TOP}px; z-index: 30;
            display: flex; align-items: center; gap: 18px; padding: 0 16px;
            background: #fdfcf9; border-bottom: 1px solid #d8d3c8;
        }
        .wb-brand { font-size: 13px; font-weight: 700; white-space: nowrap; }
        .wb-tabs { display: flex; gap: 6px; overflow-x: auto; }
        .wb-tab {
            font: 600 12.5px inherit; color: #6b7a99; background: none;
            border: 1px solid transparent; border-radius: 999px;
            padding: 5px 12px; cursor: pointer; white-space: nowrap;
        }
        .wb-tab:hover { color: #33313b; border-color: #e4e0d6; }
        .wb-tab.wb-on { color: #fff; background: #e4572e; border-color: #e4572e; }

        .wb-drawer {
            position: fixed; top: ${TOP}px; right: 0; bottom: 0; width: ${SIDE}px;
            z-index: 30; display: flex; flex-direction: column; gap: 14px;
            padding: 16px 16px 18px; overflow-y: auto;
            background: #fdfcf9; border-left: 1px solid #d8d3c8;
        }
        .wb-heading { display: flex; flex-direction: column; }
        .wb-heading b { font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: .08em; color: #6b7a99; }
        .wb-heading span { font-size: 11.5px; color: #9a9484; font-style: italic; }
        .wb-controls { display: flex; flex-direction: column; gap: 10px; }
        .wb-controls > * { position: static !important; width: auto !important; }

        .wb-field { display: flex; flex-direction: column; gap: 5px;
            padding-top: 12px; border-top: 1px solid #ece8e0; }
        .wb-fieldlabel { font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: .06em; color: #6b7a99; }
        .wb-row { display: flex; gap: 6px; }
        .wb-input {
            font: 600 12px ui-monospace, Menlo, monospace; color: #33313b;
            background: #fff; border: 1px solid #d8d3c8; border-radius: 7px;
            padding: 5px 8px; outline: none; width: 100%; box-sizing: border-box;
        }
        .wb-input:focus { border-color: #e4572e; }
        .wb-num { text-align: right; }

        .wb-actions { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
        .wb-btn {
            font: 600 13px inherit; color: #33313b; background: #fff;
            border: 1px solid #d8d3c8; border-radius: 999px; padding: 9px 14px;
            cursor: pointer;
        }
        .wb-btn:hover { border-color: #b9b2a4; }
        .wb-go { background: #e4572e; border-color: #e4572e; color: #fff; }
        .wb-go:hover { background: #d24a24; border-color: #d24a24; }
        .wb-note { min-height: 14px; font-size: 11px; color: #6b7a99;
            font-family: ui-monospace, Menlo, monospace; }

        .wb-frame {
            position: fixed; z-index: 10; pointer-events: none;
            border: 1px solid #b9b2a4; border-radius: 3px;
            box-shadow: 0 10px 34px rgba(51,49,59,.16);
        }
        .wb-stamp {
            position: fixed; z-index: 10; pointer-events: none;
            font-size: 11.5px; font-weight: 700; color: #6b7a99;
        }
        .wb-auxlabel {
            position: fixed; z-index: 10; pointer-events: none;
            font-size: 11px; font-style: italic; color: #9a9484;
        }
    `;
    document.head.appendChild(style);
}

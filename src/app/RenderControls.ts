/**
 * RenderControls — the render entry's chrome (roadmap: paper figures).
 *
 * A render page shows the scene raster-previewed with a row of FIGURE
 * PRESETS (one pill per planned paper figure — each sets the scene state
 * and canonical camera in its apply()) and a "Render…" pill opening a small
 * modal: −/+ steppers for scale (with the resulting pixel dimensions),
 * bounces, and the sample target. Render hands off to the preset's figure
 * attachment (FigureRenderer); its bar handles save PNG / copy URL / exit,
 * and this module hides the preview chrome while tracing.
 *
 * Deep link: ?figpreset=<id> applies that preset and starts tracing on
 * load — every paper figure is a URL. (?fig=<name>&cam=… links from "copy
 * URL" restore pose + settings without the preset, via FigureRenderer.)
 */

import type { FigureMode } from "./FigureRenderer.ts";
import { button } from "../ui/controls.ts";

export interface RenderPreset {
    id: string;
    label: string;
    /** the figure attachment this preset renders (torus or sphere view) */
    figure: FigureMode;
    /** set the scene state AND camera pose for this figure */
    apply(): void;
}

export interface RenderControlsOptions {
    presets: RenderPreset[];
    /** preview-only chrome (param sliders etc.) hidden while tracing */
    previewEls?: { el: HTMLElement }[];
}

export function attachRenderControls(options: RenderControlsOptions): void {
    const { presets } = options;
    let current = presets[0]!;

    const style = document.createElement("style");
    style.textContent = `
        .render-presets {
            position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
            z-index: 30; display: flex; gap: 8px; align-items: center;
        }
        .render-presets .uk-button.uk-current { border-color: #e4572e; color: #e4572e; }
        .render-modal-overlay {
            position: fixed; inset: 0; z-index: 60; display: none;
            align-items: center; justify-content: center;
            background: rgba(51, 49, 59, 0.35);
        }
        .render-modal-overlay.open { display: flex; }
        .render-modal {
            font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
            color: #33313b; background: #fdfcf9; border: 1px solid #d8d3c8;
            border-radius: 14px; padding: 18px 24px; text-align: center;
            box-shadow: 0 6px 30px rgba(0, 0, 0, 0.18); user-select: none;
        }
        .render-modal h2 { font-size: 15px; margin: 0 0 12px 0; }
        .render-modal .row {
            display: flex; gap: 10px; align-items: center; justify-content: center;
            margin-bottom: 8px; font-size: 12px; font-weight: 600; color: #6b7a99;
        }
        .render-modal .row b { min-width: 44px; color: #33313b; font-size: 13px; }
        .render-modal .dims { font-size: 11px; color: #6b7a99; margin-bottom: 12px; }
        .render-modal .actions { display: flex; gap: 10px; justify-content: center; margin-top: 10px; }
        .render-modal .uk-button.go { background: #e4572e; border-color: #e4572e; color: #fff; }
        .render-modal .step {
            font: 700 14px ui-rounded, system-ui; color: #33313b; cursor: pointer;
            background: rgba(255,255,255,0.9); border: 1px solid #d8d3c8;
            border-radius: 999px; width: 26px; height: 26px; line-height: 1;
        }
        .render-modal .step:hover { background: #fff; }
    `;
    document.head.appendChild(style);

    // ---- preset row + Render… pill ----
    const row = document.createElement("div");
    row.className = "render-presets";
    const presetButtons = presets.map((preset) => {
        const b = button({
            label: preset.label,
            onClick: () => selectPreset(preset),
        });
        row.appendChild(b.el);
        return b;
    });
    const renderBtn = button({ label: "◉ render…", onClick: openModal });
    row.appendChild(renderBtn.el);
    document.body.appendChild(row);

    function paintCurrent(): void {
        presets.forEach((preset, i) => {
            presetButtons[i]!.el.classList.toggle("uk-current", preset === current);
        });
    }

    function selectPreset(preset: RenderPreset): void {
        current = preset;
        paintCurrent();
        preset.apply();
    }

    // ---- Render… modal ----
    const overlay = document.createElement("div");
    overlay.className = "render-modal-overlay";
    const modal = document.createElement("div");
    modal.className = "render-modal";
    modal.innerHTML = "<h2>Render figure</h2>";

    const dims = document.createElement("div");
    dims.className = "dims";

    let scale = 2;
    let bounces = 24;
    let spp = 768;

    const stepRow = (
        label: string,
        get: () => string,
        step: (d: number) => void,
    ): { row: HTMLDivElement; refresh(): void } => {
        const value = document.createElement("b");
        const dec = document.createElement("button");
        dec.className = "step";
        dec.textContent = "−";
        const inc = document.createElement("button");
        inc.className = "step";
        inc.textContent = "+";
        const rowEl = document.createElement("div");
        rowEl.className = "row";
        rowEl.append(label, dec, value, inc);
        const refresh = (): void => {
            value.textContent = get();
        };
        dec.addEventListener("click", () => {
            step(-1);
            refreshAll();
        });
        inc.addEventListener("click", () => {
            step(1);
            refreshAll();
        });
        refresh();
        return { row: rowEl, refresh };
    };

    const scaleRow = stepRow(
        "scale",
        () => `${scale}×`,
        (d) => {
            scale = Math.max(1, Math.min(8, scale + d));
        },
    );
    const bounceRow = stepRow(
        "bounces",
        () => String(bounces),
        (d) => {
            bounces = Math.max(2, Math.min(40, bounces + 2 * d));
        },
    );
    const sppRow = stepRow(
        "samples",
        () => String(spp),
        (d) => {
            spp = Math.max(128, Math.min(16384, spp * (d > 0 ? 2 : 0.5)));
        },
    );

    function refreshAll(): void {
        scaleRow.refresh();
        bounceRow.refresh();
        sppRow.refresh();
        const size = current.figure.predictSize(scale);
        dims.textContent = `${size.width} × ${size.height} px`;
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    const go = button({ label: "render", onClick: confirmRender });
    go.el.classList.add("go");
    const cancel = button({ label: "cancel", onClick: closeModal });
    actions.append(go.el, cancel.el);

    modal.append(scaleRow.row, dims, bounceRow.row, sppRow.row, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function openModal(): void {
        refreshAll();
        overlay.classList.add("open");
    }
    function closeModal(): void {
        overlay.classList.remove("open");
    }
    function confirmRender(): void {
        closeModal();
        current.figure.configure({ scale, bounces, spp });
        current.figure.enter();
    }
    window.addEventListener("keydown", (e) => {
        if (!overlay.classList.contains("open")) return;
        if (e.key === "Enter") confirmRender();
        else if (e.key === "Escape") closeModal();
    });

    // ---- hide preview chrome while any figure is tracing ----
    const previewEls = [row, ...(options.previewEls ?? []).map((w) => w.el)];
    let wasActive = false;
    const tick = (): void => {
        const active = presets.some((preset) => preset.figure.active);
        if (active !== wasActive) {
            wasActive = active;
            for (const el of previewEls) el.style.display = active ? "none" : "";
        }
        requestAnimationFrame(tick);
    };
    tick();

    // ---- deep links ----
    const query = new URLSearchParams(window.location.search);
    const wanted = query.get("figpreset");
    const preset = presets.find((p) => p.id === wanted);
    if (preset) {
        selectPreset(preset);
        requestAnimationFrame(() => preset.figure.enter());
    } else {
        paintCurrent();
        current.apply();
    }
}

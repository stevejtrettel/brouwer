/**
 * controls — the hand-rolled UI kit. One visual language for all three entry
 * kinds (website, lab, render): the thin-slider idiom — naked 5px pill
 * tracks, pill buttons, quiet text readouts floating DIRECTLY on the scene,
 * no panels or cards — in this repo's warm-paper palette (charcoal text,
 * muted blue-gray labels, coral accent, ui-rounded).
 *
 * Factories return `{ el }` unpositioned; place them with float() or drop
 * them into a stack() (the lab's flex column). Slider.set() and friends
 * NEVER fire their change callbacks — external sync (sweeps) can't loop.
 */

const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
const INK = "#33313b";
const MUTE = "#6b7a99";
const ACCENT = "#e4572e";
const HAIRLINE = "#d8d3c8";

let stylesInjected = false;
function ensureStyles(): void {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement("style");
    style.textContent = `
        .uk { font-family: ${FONT}; color: ${INK}; user-select: none; }

        .uk-slider { display: flex; align-items: center; gap: 8px; }
        .uk-slider .uk-label { font-size: 12px; font-weight: 600; color: ${MUTE}; white-space: nowrap; }
        .uk-slider .uk-value { font-size: 12px; font-weight: 700; color: ${INK}; min-width: 38px; text-align: right; }
        .uk-slider input[type="range"] {
            -webkit-appearance: none; appearance: none;
            flex: 1; min-width: 110px; height: 5px; margin: 0;
            background: transparent; outline: none; cursor: pointer;
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18));
        }
        .uk-slider input[type="range"]::-webkit-slider-runnable-track {
            height: 5px; border-radius: 999px; box-sizing: border-box;
            background: rgba(255, 255, 255, 0.95); border: 1px solid ${HAIRLINE};
        }
        .uk-slider input[type="range"]::-moz-range-track {
            height: 5px; border-radius: 999px; box-sizing: border-box;
            background: rgba(255, 255, 255, 0.95); border: 1px solid ${HAIRLINE};
        }
        .uk-slider input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 15px; height: 15px; margin-top: -6px; border-radius: 50%;
            background: ${ACCENT}; border: 2px solid #fff; box-sizing: content-box;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); cursor: pointer;
        }
        .uk-slider input[type="range"]::-moz-range-thumb {
            width: 15px; height: 15px; border-radius: 50%;
            background: ${ACCENT}; border: 2px solid #fff;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); cursor: pointer;
        }
        .uk-slider input[type="range"]:focus { outline: none; }
        .uk-slider.uk-vertical { flex-direction: column; gap: 10px; }
        .uk-slider.uk-vertical input[type="range"] {
            writing-mode: vertical-lr; direction: rtl;
            width: 5px; height: 240px; min-width: 0; flex: none;
        }
        .uk-slider.uk-vertical .uk-value { text-align: center; min-width: 0; }
        .uk-slider input.uk-typein {
            width: 52px; font: 700 12px ${FONT}; color: ${INK};
            border: 1px solid ${HAIRLINE}; border-radius: 6px; padding: 1px 4px;
            background: rgba(255, 255, 255, 0.95); text-align: right; outline: none;
        }

        .uk-button {
            font: 600 13px ${FONT}; color: ${INK};
            background: rgba(255, 255, 255, 0.85); border: 1px solid ${HAIRLINE};
            border-radius: 999px; padding: 7px 15px; cursor: pointer;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1); white-space: nowrap;
        }
        .uk-button:hover { background: #fff; }
        .uk-button.uk-on { background: ${ACCENT}; border-color: ${ACCENT}; color: #fff; }
        .uk-button.uk-on:hover { background: #d24a24; }

        .uk-readout { font-size: 12px; font-weight: 600; color: ${MUTE}; }
        .uk-readout b { font-weight: 700; color: ${INK}; }

        .uk-stack {
            position: fixed; z-index: 20; display: flex; flex-direction: column;
            gap: 9px; width: 240px; max-height: calc(100vh - 24px);
            overflow-y: auto; padding: 2px; scrollbar-width: thin;
        }
        .uk-stack details { display: flex; flex-direction: column; }
        .uk-stack summary {
            font-size: 11px; font-weight: 700; color: ${MUTE};
            text-transform: uppercase; letter-spacing: 0.06em;
            cursor: pointer; margin: 4px 0 2px 0; list-style-position: inside;
        }
        .uk-stack details > .uk-stack-body { display: flex; flex-direction: column; gap: 8px; margin: 3px 0 4px 0; }
        .uk-stack .uk-button { align-self: stretch; text-align: center; }

        .uk-title {
            position: fixed; z-index: 10; pointer-events: none;
        }
        .uk-title h1 { font: 700 18px ${FONT}; color: ${INK}; margin: 0 0 2px 0; }
        .uk-title .uk-status { font: 700 15px ${FONT}; color: ${MUTE}; min-height: 19px; }
        .uk-title .uk-status.uk-linked { color: #2f6de1; }
        .uk-title .uk-status.uk-touching { color: #b8860b; }
        .uk-title .uk-caption { font: 400 13px ${FONT}; color: #b8860b; min-height: 18px; max-width: 44vw; }

        .uk-panel-label {
            position: fixed; z-index: 5; font: 600 12px ${FONT}; color: ${MUTE};
            pointer-events: none; user-select: none;
        }
    `;
    document.head.appendChild(style);
}

/** Pin a widget to the viewport (position: fixed). Returns the widget. */
export function float<T extends { el: HTMLElement }>(
    widget: T,
    pos: Partial<Record<"top" | "right" | "bottom" | "left", string>> & { z?: number },
): T {
    widget.el.style.position = "fixed";
    widget.el.style.zIndex = String(pos.z ?? 20);
    for (const side of ["top", "right", "bottom", "left"] as const) {
        if (pos[side] !== undefined) widget.el.style[side] = pos[side]!;
    }
    document.body.appendChild(widget.el);
    return widget;
}

// ------------------------------------------------------------------ slider

export interface SliderOptions {
    label: string;
    min: number;
    max: number;
    step?: number;
    value: number;
    /** vertical pill (brouwer's r slider) — max at the top */
    vertical?: boolean;
    /** live value text (default v.toFixed(2)) */
    format?: (v: number) => string;
    /** click the value to type an exact number (lab niceness) */
    typein?: boolean;
    onInput: (v: number) => void;
}

export interface Slider {
    readonly el: HTMLElement;
    readonly value: number;
    /** external sync — updates thumb + text, never fires onInput */
    set(v: number): void;
}

export function slider(options: SliderOptions): Slider {
    ensureStyles();
    const format = options.format ?? ((v: number) => v.toFixed(2));

    const el = document.createElement("div");
    el.className = `uk uk-slider${options.vertical ? " uk-vertical" : ""}`;

    const label = document.createElement("span");
    label.className = "uk-label";
    label.textContent = options.label;

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step ?? (options.max - options.min) / 500);
    input.value = String(options.value);

    const value = document.createElement("span");
    value.className = "uk-value";
    value.textContent = format(options.value);

    // vertical reads top-to-bottom: value, track, label
    if (options.vertical) el.append(value, input, label);
    else el.append(label, input, value);

    input.addEventListener("input", () => {
        value.textContent = format(input.valueAsNumber);
        options.onInput(input.valueAsNumber);
    });

    if (options.typein) {
        value.style.pointerEvents = "auto";
        value.style.cursor = "text";
        value.addEventListener("click", () => {
            const box = document.createElement("input");
            box.type = "number";
            box.className = "uk-typein";
            box.step = input.step;
            box.value = input.valueAsNumber.toFixed(4);
            value.replaceWith(box);
            box.focus();
            box.select();
            const commit = (apply: boolean): void => {
                if (apply && Number.isFinite(box.valueAsNumber)) {
                    const v = Math.min(options.max, Math.max(options.min, box.valueAsNumber));
                    input.value = String(v);
                    value.textContent = format(v);
                    options.onInput(v);
                }
                box.replaceWith(value);
            };
            box.addEventListener("keydown", (e) => {
                if (e.key === "Enter") commit(true);
                else if (e.key === "Escape") commit(false);
            });
            box.addEventListener("blur", () => commit(true));
        });
    }

    return {
        el,
        get value() {
            return input.valueAsNumber;
        },
        set(v) {
            input.value = String(v);
            value.textContent = format(v);
        },
    };
}

// ------------------------------------------------------------------ buttons

export interface Button {
    readonly el: HTMLElement;
    setLabel(label: string): void;
}

export function button(options: { label: string; hint?: string; onClick: () => void }): Button {
    ensureStyles();
    const el = document.createElement("button");
    el.className = "uk uk-button";
    el.textContent = options.label;
    if (options.hint) el.title = options.hint;
    el.addEventListener("click", options.onClick);
    return {
        el,
        setLabel(label) {
            el.textContent = label;
        },
    };
}

export interface PlayButton {
    readonly el: HTMLElement;
    /** flip the visual state (e.g. from a sweep's onDone) — no callback fired */
    set(playing: boolean): void;
}

/** A ▶/⏸ pill: the caller drives the sweep in onToggle and confirms the
 *  state (including onDone flips) via set(). */
export function playButton(options: {
    label: string;
    pauseLabel?: string;
    hint?: string;
    onToggle: (wantPlay: boolean) => void;
}): PlayButton {
    ensureStyles();
    const pauseLabel = options.pauseLabel ?? "⏸ pause";
    let playing = false;
    const el = document.createElement("button");
    el.className = "uk uk-button";
    el.textContent = options.label;
    if (options.hint) el.title = options.hint;
    el.addEventListener("click", () => options.onToggle(!playing));
    return {
        el,
        set(on) {
            playing = on;
            el.textContent = on ? pauseLabel : options.label;
        },
    };
}

export interface Toggle {
    readonly el: HTMLElement;
    readonly value: boolean;
    set(on: boolean): void;
}

export function toggle(options: {
    label: string;
    value?: boolean;
    hint?: string;
    onChange: (on: boolean) => void;
}): Toggle {
    ensureStyles();
    let on = options.value ?? false;
    const el = document.createElement("button");
    el.className = "uk uk-button";
    el.textContent = options.label;
    if (options.hint) el.title = options.hint;
    const paint = (): void => {
        el.classList.toggle("uk-on", on);
    };
    paint();
    el.addEventListener("click", () => {
        on = !on;
        paint();
        options.onChange(on);
    });
    return {
        el,
        get value() {
            return on;
        },
        set(v) {
            on = v;
            paint();
        },
    };
}

// ------------------------------------------------------------------ readout

export interface Readout {
    readonly el: HTMLElement;
    /** push model: call from the demo's refresh — no polling anywhere */
    set(text: string, color?: string): void;
}

export function readout(options: { label: string }): Readout {
    ensureStyles();
    const el = document.createElement("div");
    el.className = "uk uk-readout";
    const value = document.createElement("b");
    el.append(`${options.label} `, value);
    return {
        el,
        set(text, color) {
            value.textContent = text;
            value.style.color = color ?? "";
        },
    };
}

// -------------------------------------------------------------- title block

export interface TitleBlock {
    readonly el: HTMLElement;
    status(text: string, tone?: "quiet" | "linked" | "touching"): void;
    caption(text: string): void;
}

/** The h1 + status + caption overlay every demo repeats, plus the body
 *  reset. Default position bottom-left of the torus column. */
export function titleBlock(options: { title: string; left?: string; bottom?: string }): TitleBlock {
    ensureStyles();
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    const el = document.createElement("div");
    el.className = "uk uk-title";
    el.style.left = options.left ?? "calc(33% + 16px)";
    el.style.bottom = options.bottom ?? "14px";
    const h1 = document.createElement("h1");
    h1.textContent = options.title;
    const statusEl = document.createElement("div");
    statusEl.className = "uk-status";
    const captionEl = document.createElement("div");
    captionEl.className = "uk-caption";
    el.append(h1, statusEl, captionEl);
    document.body.appendChild(el);

    return {
        el,
        status(text, tone = "quiet") {
            statusEl.textContent = text;
            statusEl.className =
                tone === "quiet" ? "uk-status" : `uk-status uk-${tone}`;
        },
        caption(text) {
            captionEl.textContent = text;
        },
    };
}

/** Small muted caption pinned over a panel ("domain D²", …). */
export function panelLabel(
    text: string,
    pos: Partial<Record<"top" | "right" | "bottom" | "left", string>>,
): HTMLElement {
    ensureStyles();
    const el = document.createElement("div");
    el.className = "uk uk-panel-label";
    for (const side of ["top", "right", "bottom", "left"] as const) {
        if (pos[side] !== undefined) el.style[side] = pos[side]!;
    }
    el.textContent = text;
    document.body.appendChild(el);
    return el;
}

// ------------------------------------------------------------------- stack

export interface Stack {
    readonly el: HTMLElement;
    add(...widgets: { el: HTMLElement }[]): Stack;
    /** a collapsible labeled section (native <details>) */
    group(label: string, open?: boolean): Stack;
}

/** The lab's control column: a quiet fixed flex stack, no panel chrome. */
export function stack(options: { anchor?: "top-right" | "bottom-left"; width?: number } = {}): Stack {
    ensureStyles();
    const el = document.createElement("div");
    el.className = "uk uk-stack";
    if (options.width) el.style.width = `${options.width}px`;
    if ((options.anchor ?? "top-right") === "top-right") {
        el.style.top = "12px";
        el.style.right = "12px";
    } else {
        el.style.bottom = "12px";
        el.style.left = "12px";
    }
    document.body.appendChild(el);
    return makeStack(el);
}

function makeStack(el: HTMLElement): Stack {
    return {
        el,
        add(...widgets) {
            for (const w of widgets) el.appendChild(w.el);
            return this;
        },
        group(label, open = true) {
            const details = document.createElement("details");
            if (open) details.open = true;
            const summary = document.createElement("summary");
            summary.textContent = label;
            const body = document.createElement("div");
            body.className = "uk-stack-body";
            details.append(summary, body);
            el.appendChild(details);
            return makeStack(body);
        },
    };
}

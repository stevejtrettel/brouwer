/**
 * attachOrbitGate — hand a viewport's OrbitControls the pointer only while the
 * pointer is over THAT viewport (and while the demo's own gate allows it).
 *
 * Both 3D views need this, because one canvas carries several viewports and
 * every OrbitControls instance listens to the whole canvas: without a gate,
 * dragging the sphere panel also spins the torus.
 *
 * The subtlety worth keeping in one place: `enabled` must be re-evaluated on
 * POINTERDOWN as well as pointermove. A gate can flip with no pointer motion in
 * between — a brush stroke ending re-opens orbit — and a stale `enabled` from
 * the last move would then swallow the next press. OrbitControls reads
 * `enabled` inside its own canvas pointerdown handler, and same-element
 * listeners fire in registration order (ours is added later, so it would lose),
 * hence the listener goes on the canvas's own window in the CAPTURE phase:
 * ancestor capture runs before the target's own listeners.
 */

import type { ViewManager } from "../app/ViewManager.ts";

/**
 * A global veto, ANDed into every gate. Figure mode holds it while the path
 * tracer is accumulating: a camera move throws the image away and starts over,
 * so a stray drag on a half-finished 768-sample render costs minutes.
 *
 * It has to live HERE rather than in FigureRenderer setting `controls.enabled`,
 * because the gate below rewrites `enabled` on every pointermove and
 * pointerdown — any value set from outside is gone by the next mouse twitch.
 * Global is honest: figure mode takes the whole canvas, so there is exactly one
 * figure that could be tracing.
 */
let locked = false;
export function setOrbitLock(on: boolean): void {
    locked = on;
}

/** Just the part of OrbitControls this needs — keeps the unit testable. */
export interface OrbitGateTarget {
    enabled: boolean;
}

export interface OrbitGateOptions {
    /** the shared canvas every viewport renders into */
    canvas: HTMLElement;
    views: ViewManager;
    /** name of the viewport these controls belong to */
    name: string;
    controls: OrbitGateTarget;
    /** extra condition ANDed with pointer-over-viewport (default: always on) */
    gate?: () => boolean;
}

export interface OrbitGate {
    /** replace the extra condition — e.g. () => !comb.active */
    setGate(gate: () => boolean): void;
    dispose(): void;
}

export function attachOrbitGate(options: OrbitGateOptions): OrbitGate {
    const { canvas, views, name, controls } = options;
    let gate: () => boolean = options.gate ?? (() => true);

    const apply = (e: PointerEvent): void => {
        const vp = views.viewportAt(e.clientX, e.clientY);
        controls.enabled = !locked && vp?.name === name && gate();
    };

    // the canvas's OWN window, not the ambient global: an element living in
    // another document (iframe, popped-out window) must be gated by the window
    // its events actually travel through
    const root = canvas.ownerDocument?.defaultView ?? null;
    canvas.addEventListener("pointermove", apply);
    root?.addEventListener("pointerdown", apply, true);

    return {
        setGate(next) {
            gate = next;
        },
        dispose() {
            canvas.removeEventListener("pointermove", apply);
            root?.removeEventListener("pointerdown", apply, true);
        },
    };
}

/**
 * ParameterSweep — a play/pause driver that animates the proof parameter
 * through its range (roadmap Phase 4), calling the demo's own refresh on
 * every frame and firing evenly spaced snapshot callbacks for ghost trails.
 * The per-frame path is the designed hot path (refillGraphCurve + refit);
 * this just supplies the clock.
 */

import type { App } from "./App.ts";

export interface SweepOptions {
    app: App;
    /** swept from range[0] to range[1] */
    range: [number, number];
    /** seconds for a full sweep (default 8) */
    duration?: number;
    /** ghost snapshots along the way (default 6; 0 disables) */
    snapshots?: number;
    /** apply the value: set state + refresh + sync widgets */
    onStep(value: number): void;
    onSnapshot?(value: number): void;
    onDone?(): void;
}

export interface ParameterSweep {
    /** start from the beginning (clears nothing — caller resets ghosts) */
    play(): void;
    pause(): void;
    /** play ⇄ pause */
    toggle(): void;
    readonly playing: boolean;
}

export function attachParameterSweep(options: SweepOptions): ParameterSweep {
    const duration = options.duration ?? 8;
    const snapshots = options.snapshots ?? 6;
    const [from, to] = options.range;

    let playing = false;
    let t = 1; // finished
    let nextSnapshot = 1;

    options.app.addAnimateCallback((_time, delta) => {
        if (!playing) return;
        t = Math.min(1, t + delta / duration);
        options.onStep(from + (to - from) * t);
        while (snapshots > 0 && t >= nextSnapshot / (snapshots + 1) && nextSnapshot <= snapshots) {
            nextSnapshot++;
            options.onSnapshot?.(from + (to - from) * t);
        }
        if (t >= 1) {
            playing = false;
            options.onDone?.();
        }
    });

    return {
        play() {
            t = 0;
            nextSnapshot = 1;
            playing = true;
            options.onStep(from);
        },
        pause() {
            playing = false;
        },
        toggle() {
            if (playing) playing = false;
            else if (t >= 1) this.play();
            else playing = true;
        },
        get playing() {
            return playing;
        },
    };
}

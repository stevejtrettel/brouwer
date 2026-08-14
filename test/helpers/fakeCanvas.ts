/**
 * A canvas-and-app stand-in for testing the pointer machinery (SphereBrush,
 * SheetSculptor, attachOrbitGate) in plain node — no WebGL, no jsdom.
 *
 * This works because those modules only ever ask the app for three things: the
 * canvas to listen on, `views` for the pointer→viewport mapping, and a place to
 * park an animate callback. `ViewManager` here is the REAL one, so the viewport
 * hit-testing and NDC arithmetic under test is the shipped arithmetic; only the
 * DOM and the renderer are faked.
 */

import { ViewManager } from "../../src/app/ViewManager.ts";
import type { App } from "../../src/app/App.ts";
import type { AnimateCallback } from "../../src/app/App.ts";

type Listener = (e: unknown) => void;

/** Minimal EventTarget with pointer capture and a dispatch helper. */
export class FakeCanvas {
    readonly listeners = new Map<string, Listener[]>();
    readonly captured: number[] = [];
    /** the window a real canvas would reach through ownerDocument */
    readonly fakeWindow = new FakeWindow();
    readonly ownerDocument = { defaultView: this.fakeWindow };

    addEventListener(type: string, fn: Listener, capture?: boolean): void {
        void capture;
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
    }

    removeEventListener(type: string, fn: Listener): void {
        const list = this.listeners.get(type);
        if (!list) return;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
    }

    setPointerCapture(id: number): void {
        this.captured.push(id);
    }

    releasePointerCapture(id: number): void {
        const i = this.captured.indexOf(id);
        if (i >= 0) this.captured.splice(i, 1);
    }

    /** Deliver an event to this canvas AND (capture phase first) to its window,
     *  the way a real pointer event reaches both. */
    dispatch(type: string, event: Partial<FakePointerEvent> = {}): void {
        const full = pointerEvent(type, event);
        for (const fn of [...(this.fakeWindow.listeners.get(type) ?? [])]) fn(full);
        for (const fn of [...(this.listeners.get(type) ?? [])]) fn(full);
    }
}

export class FakeWindow {
    readonly listeners = new Map<string, Listener[]>();

    addEventListener(type: string, fn: Listener, capture?: boolean): void {
        void capture;
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
    }

    removeEventListener(type: string, fn: Listener): void {
        const list = this.listeners.get(type);
        if (!list) return;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
    }
}

export interface FakePointerEvent {
    type: string;
    clientX: number;
    clientY: number;
    /** 0 = primary/left, 2 = secondary/right */
    button: number;
    pointerId: number;
    isPrimary: boolean;
    pointerType: string;
}

function pointerEvent(type: string, over: Partial<FakePointerEvent>): FakePointerEvent {
    return {
        type,
        clientX: 0,
        clientY: 0,
        button: 0,
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
        ...over,
    };
}

export interface FakeApp {
    app: App;
    canvas: FakeCanvas;
    views: ViewManager;
    /** run every registered animate callback once (one rendered frame) */
    frame(): void;
    /** run `n` frames */
    frames(n: number): void;
}

/** A stub App wired to a real ViewManager sized to `width × height` CSS px. */
export function fakeApp(width = 1440, height = 900): FakeApp {
    const canvas = new FakeCanvas();
    const views = new ViewManager();
    views.resize(width, height);
    const callbacks: AnimateCallback[] = [];
    let time = 0;

    const app = {
        renderer: { domElement: canvas },
        views,
        addAnimateCallback(fn: AnimateCallback) {
            callbacks.push(fn);
        },
    } as unknown as App;

    return {
        app,
        canvas,
        views,
        frame() {
            time += 1 / 60;
            for (const fn of callbacks) fn(time, 1 / 60);
        },
        frames(n) {
            for (let i = 0; i < n; i++) this.frame();
        },
    };
}

/** Sum of |components| — a cheap "did this buffer change at all" fingerprint. */
export function magnitude(a: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]!);
    return sum;
}

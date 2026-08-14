/**
 * The control layer — pointer arbitration and the orbit gate.
 *
 * These are the bugs that the math suite structurally cannot see, and that a
 * visitor hits first: a right-drag that both combs and orbits, a second finger
 * that smears a stroke, a cancelled pointer that leaves the brush stuck down, an
 * orbit gate that goes stale between a stroke ending and the next press.
 *
 * Everything runs in plain node against a fake canvas and a REAL ViewManager
 * (see helpers/fakeCanvas.ts) — no browser, no WebGL, no jsdom.
 */

import { describe, expect, it } from "vitest";
import { OrthographicCamera, PerspectiveCamera, Scene } from "three";

import { attachSphereBrush } from "../src/components/SphereBrush.ts";
import { attachSheetSculptor } from "../src/components/SheetSculptor.ts";
import { attachOrbitGate } from "../src/views/orbitGate.ts";
import { createSphereGrid, plTangentField } from "../src/math/sphereGrid.ts";
import { createDiskGrid, plDiskMap } from "../src/math/diskGrid.ts";
import { projectedConstantField } from "../src/math/maps/tangentFields.ts";
import { fakeApp, magnitude, FakeCanvas } from "./helpers/fakeCanvas.ts";

// The demos' layout, in canvas fractions: torus right, sphere top-left,
// panel bottom-left. Centres in CSS pixels on a 1440×900 canvas.
const SPHERE_RECT = { x: 0, y: 0.5, w: 1 / 3, h: 0.5 };
const PANEL_RECT = { x: 0, y: 0, w: 1 / 3, h: 0.5 };
const TORUS_RECT = { x: 1 / 3, y: 0, w: 2 / 3, h: 1 };
const SPHERE_CENTER = { x: 240, y: 225 };
const PANEL_CENTER = { x: 240, y: 675 };
const TORUS_CENTER = { x: 960, y: 450 };

/** A point, optionally offset, as pointer-event coordinates. Spelling the
 *  clientX/clientY out here (rather than spreading {x, y}) is what stops an
 *  event silently defaulting to (0, 0) — which lands inside the sphere rect and
 *  makes negative assertions pass for the wrong reason. */
function at(p: { x: number; y: number }, dx = 0, dy = 0): { clientX: number; clientY: number } {
    return { clientX: p.x + dx, clientY: p.y + dy };
}

function sphereSetup(options: { enabled?: () => boolean } = {}) {
    const harness = fakeApp();
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true); // the render loop would do this
    const viewport = harness.views.add({
        name: "sphere",
        scene: new Scene(),
        camera,
        rect: SPHERE_RECT,
    });
    harness.views.add({
        name: "torus",
        scene: new Scene(),
        camera: new PerspectiveCamera(),
        rect: TORUS_RECT,
    });

    const grid = createSphereGrid(24, 48);
    const field = plTangentField(grid, projectedConstantField(1, 0, 0));
    let edits = 0;
    let commits = 0;
    const brush = attachSphereBrush({
        app: harness.app,
        viewport,
        camera,
        grid,
        field,
        enabled: options.enabled ?? (() => true),
        onEdit: () => edits++,
        onCommit: () => commits++,
    });
    return {
        ...harness,
        brush,
        field,
        counts: () => ({ edits, commits }),
    };
}

function panelSetup() {
    const harness = fakeApp();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5;
    const viewport = harness.views.add({
        name: "panel",
        scene: new Scene(),
        camera,
        rect: PANEL_RECT,
    });

    const grid = createDiskGrid(16, 32);
    const sheet = plDiskMap(grid);
    let commits = 0;
    const sculptor = attachSheetSculptor({
        app: harness.app,
        viewport,
        scene: new Scene(),
        grid,
        sheet,
        onEdit: () => {},
        onCommit: () => commits++,
    });
    return { ...harness, sculptor, sheet, commits: () => commits };
}

/** press → drag → release, as a real pointer sequence */
function stroke(
    canvas: FakeCanvas,
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps = 6,
    event: { button?: number; pointerId?: number } = {},
): void {
    canvas.dispatch("pointerdown", { ...at(from), ...event });
    for (let i = 1; i <= steps; i++) {
        canvas.dispatch("pointermove", {
            clientX: from.x + ((to.x - from.x) * i) / steps,
            clientY: from.y + ((to.y - from.y) * i) / steps,
            ...event,
        });
    }
    canvas.dispatch("pointerup", { ...at(to), ...event });
}

describe("SphereBrush (combing the Poincaré field)", () => {
    it("combs on a primary-button drag over its own viewport", () => {
        const s = sphereSetup();
        const before = magnitude(s.field.vectors);
        stroke(s.canvas, SPHERE_CENTER, { x: SPHERE_CENTER.x + 60, y: SPHERE_CENTER.y + 30 });
        expect(magnitude(s.field.vectors)).not.toBeCloseTo(before, 4);
        expect(s.counts().edits).toBeGreaterThan(0);
        expect(s.counts().commits).toBeGreaterThan(0);
    });

    it("ignores the secondary button, so right-drag can orbit instead", () => {
        const s = sphereSetup();
        const before = magnitude(s.field.vectors);
        stroke(
            s.canvas,
            SPHERE_CENTER,
            { x: SPHERE_CENTER.x + 60, y: SPHERE_CENTER.y + 30 },
            6,
            { button: 2 },
        );
        expect(magnitude(s.field.vectors)).toBe(before);
    });

    it("ignores a non-primary pointer (the second finger of a pinch)", () => {
        const s = sphereSetup();
        const before = magnitude(s.field.vectors);
        s.canvas.dispatch("pointerdown", { ...at(SPHERE_CENTER), isPrimary: false, pointerId: 7 });
        s.canvas.dispatch("pointermove", { ...at(SPHERE_CENTER, 40), isPrimary: false, pointerId: 7 });
        expect(magnitude(s.field.vectors)).toBe(before);
    });

    it("does not comb from a press outside its viewport", () => {
        const s = sphereSetup();
        const before = magnitude(s.field.vectors);
        stroke(s.canvas, TORUS_CENTER, { x: TORUS_CENTER.x + 60, y: TORUS_CENTER.y });
        expect(magnitude(s.field.vectors)).toBe(before);
    });

    it("does not comb while the demo's gate is closed", () => {
        const s = sphereSetup({ enabled: () => false });
        const before = magnitude(s.field.vectors);
        stroke(s.canvas, SPHERE_CENTER, { x: SPHERE_CENTER.x + 60, y: SPHERE_CENTER.y });
        expect(magnitude(s.field.vectors)).toBe(before);
    });

    it("ends the stroke when a second pointer arrives, instead of smearing it", () => {
        const s = sphereSetup();
        s.canvas.dispatch("pointerdown", { ...at(SPHERE_CENTER) });
        s.canvas.dispatch("pointermove", at(SPHERE_CENTER, 20));
        const midStroke = magnitude(s.field.vectors);

        s.canvas.dispatch("pointerdown", { ...at(SPHERE_CENTER), pointerId: 2, isPrimary: false });
        // the first pointer keeps moving (a two-finger orbit in progress)
        s.canvas.dispatch("pointermove", at(SPHERE_CENTER, 80));
        s.canvas.dispatch("pointermove", at(SPHERE_CENTER, 120));
        expect(magnitude(s.field.vectors)).toBe(midStroke);
    });

    it("treats pointercancel as release, so the brush cannot get stuck down", () => {
        const s = sphereSetup();
        s.canvas.dispatch("pointerdown", { ...at(SPHERE_CENTER) });
        s.canvas.dispatch("pointermove", at(SPHERE_CENTER, 20));
        s.canvas.dispatch("pointercancel", at(SPHERE_CENTER, 20));
        const atCancel = magnitude(s.field.vectors);
        s.canvas.dispatch("pointermove", at(SPHERE_CENTER, 120));
        expect(magnitude(s.field.vectors)).toBe(atCancel);
    });

    it("undo restores the field, and a no-op click doesn't spend the undo slot", () => {
        const s = sphereSetup();
        const preset = magnitude(s.field.vectors);
        stroke(s.canvas, SPHERE_CENTER, { x: SPHERE_CENTER.x + 60, y: SPHERE_CENTER.y });
        expect(magnitude(s.field.vectors)).not.toBeCloseTo(preset, 4);

        // a click that moves nothing must not become an undo step, or one undo
        // would leave the stroke in place
        s.canvas.dispatch("pointerdown", { ...at(SPHERE_CENTER) });
        s.canvas.dispatch("pointerup", { ...at(SPHERE_CENTER) });

        s.brush.undo();
        expect(magnitude(s.field.vectors)).toBeCloseTo(preset, 4);
    });

    it("irons the stroke after release and commits exactly once", () => {
        const s = sphereSetup();
        stroke(s.canvas, SPHERE_CENTER, { x: SPHERE_CENTER.x + 60, y: SPHERE_CENTER.y });
        const afterRelease = s.counts().commits;
        s.frames(60); // settle window is 45 frames
        expect(s.counts().commits).toBe(afterRelease + 1);
        s.frames(60); // idle frames must not keep committing
        expect(s.counts().commits).toBe(afterRelease + 1);
    });
});

describe("SheetSculptor (sculpting the borsuk balloon / brouwer sheet)", () => {
    it("grabs and moves the sheet on a primary-button drag", () => {
        const p = panelSetup();
        const before = magnitude(p.sheet.positions);
        stroke(p.canvas, PANEL_CENTER, { x: PANEL_CENTER.x + 40, y: PANEL_CENTER.y - 30 });
        expect(magnitude(p.sheet.positions)).not.toBeCloseTo(before, 4);
    });

    it("ignores the secondary button", () => {
        const p = panelSetup();
        const before = magnitude(p.sheet.positions);
        stroke(p.canvas, PANEL_CENTER, { x: PANEL_CENTER.x + 40, y: PANEL_CENTER.y - 30 }, 6, {
            button: 2,
        });
        expect(magnitude(p.sheet.positions)).toBe(before);
    });

    it("ends the gesture when a second pointer arrives", () => {
        const p = panelSetup();
        p.canvas.dispatch("pointerdown", { ...at(PANEL_CENTER) });
        p.canvas.dispatch("pointermove", at(PANEL_CENTER, 15));
        const midStroke = magnitude(p.sheet.positions);
        p.canvas.dispatch("pointerdown", { ...at(PANEL_CENTER), pointerId: 2, isPrimary: false });
        p.canvas.dispatch("pointermove", at(PANEL_CENTER, 90));
        expect(magnitude(p.sheet.positions)).toBe(midStroke);
    });

    it("treats pointercancel as release", () => {
        const p = panelSetup();
        p.canvas.dispatch("pointerdown", { ...at(PANEL_CENTER) });
        p.canvas.dispatch("pointermove", at(PANEL_CENTER, 15));
        p.canvas.dispatch("pointercancel", at(PANEL_CENTER, 15));
        const atCancel = magnitude(p.sheet.positions);
        p.canvas.dispatch("pointermove", at(PANEL_CENTER, 90));
        expect(magnitude(p.sheet.positions)).toBe(atCancel);
    });

    it("undo restores the sheet", () => {
        const p = panelSetup();
        const rest = magnitude(p.sheet.positions);
        stroke(p.canvas, PANEL_CENTER, { x: PANEL_CENTER.x + 40, y: PANEL_CENTER.y - 30 });
        expect(magnitude(p.sheet.positions)).not.toBeCloseTo(rest, 4);
        p.sculptor.undo();
        expect(magnitude(p.sheet.positions)).toBeCloseTo(rest, 4);
    });
});

describe("attachOrbitGate", () => {
    function gateSetup(gate?: () => boolean) {
        const harness = fakeApp();
        harness.views.add({
            name: "torus",
            scene: new Scene(),
            camera: new PerspectiveCamera(),
            rect: TORUS_RECT,
        });
        harness.views.add({
            name: "sphere",
            scene: new Scene(),
            camera: new PerspectiveCamera(),
            rect: SPHERE_RECT,
        });
        const controls = { enabled: false };
        const handle = attachOrbitGate({
            canvas: harness.canvas as unknown as HTMLElement,
            views: harness.views,
            name: "sphere",
            controls,
            gate,
        });
        return { ...harness, controls, handle };
    }

    it("enables orbit only while the pointer is over its own viewport", () => {
        const g = gateSetup();
        g.canvas.dispatch("pointermove", { ...at(SPHERE_CENTER) });
        expect(g.controls.enabled).toBe(true);
        g.canvas.dispatch("pointermove", { ...at(TORUS_CENTER) });
        expect(g.controls.enabled).toBe(false);
    });

    it("respects the demo's gate", () => {
        let open = false;
        const g = gateSetup(() => open);
        g.canvas.dispatch("pointermove", { ...at(SPHERE_CENTER) });
        expect(g.controls.enabled).toBe(false);
        open = true;
        g.canvas.dispatch("pointermove", { ...at(SPHERE_CENTER) });
        expect(g.controls.enabled).toBe(true);
    });

    // THE regression: comb mode closes the gate, the stroke ends and re-opens
    // it with the pointer perfectly still. If `enabled` is only refreshed on
    // pointermove, the next press is swallowed and the sphere won't turn.
    it("re-evaluates on press, for a gate that flips with no pointer motion", () => {
        let open = false;
        const g = gateSetup(() => open);
        g.canvas.dispatch("pointermove", { ...at(SPHERE_CENTER) });
        expect(g.controls.enabled).toBe(false);

        open = true; // the stroke ended — no pointer movement at all
        g.canvas.dispatch("pointerdown", { ...at(SPHERE_CENTER) });
        expect(g.controls.enabled).toBe(true);
    });

    it("stops listening after dispose", () => {
        const g = gateSetup();
        g.handle.dispose();
        g.canvas.dispatch("pointermove", { ...at(SPHERE_CENTER) });
        expect(g.controls.enabled).toBe(false);
    });
});

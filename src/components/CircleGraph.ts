/**
 * CircleGraph — Borsuk–Ulam when n = 1, as a physical object.
 *
 * The statement is that any continuous h: S¹ → ℝ takes the same value at some
 * antipodal pair. Drawn the way you would actually draw it: the circle lying in
 * the plane, and the graph of h riding above it as a wiggly tube, with a thin
 * glass sheet hanging between the two so the curve is visibly a graph OVER the
 * circle rather than a knot floating in space. The sheet is the object that
 * makes the picture legible — without it the height at a given θ has nothing to
 * be a height above.
 *
 * Then the theorem, drawn once: the horizontal bar joining the antipodal pair
 * that shares a value. Its being level is the whole content, so it is the only
 * horizontal line in the picture and it is drawn in the event colour.
 *
 * Why a root always exists, which is also why this is the same argument as
 * every other figure in the set: g(θ) = h(θ) − h(θ + π) satisfies
 * g(θ + π) = −g(θ), so g is somewhere ≥ 0 and somewhere ≤ 0, and continuity
 * does the rest. Found here by bisection rather than asserted.
 *
 * Local frame: the circle in the xy-plane centred at the origin, heights along
 * +z. The parent group places and tilts it.
 */

import {
    BufferAttribute,
    BufferGeometry,
    CatmullRomCurve3,
    DoubleSide,
    Group,
    Mesh,
    MeshPhysicalMaterial,
    SphereGeometry,
    TubeGeometry,
    Vector3,
} from "three";
import { roleColor, theme } from "./theme.ts";

const SAMPLES = 320;
const CIRCLE_TUBE = 0.018;
const GRAPH_TUBE = 0.026;
const BAR_TUBE = 0.02;
const DOT = 0.05;

export interface CircleGraphOptions {
    /** the height function on S¹, in radians; need not be periodic-checked */
    h: (theta: number) => number;
    /** circle radius in the local frame */
    radius?: number;
    /** how high the graph floats above the plane of the circle */
    lift?: number;
    /** vertical scale applied to h */
    scale?: number;
}

function matte(color: number): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0 });
}

export class CircleGraph extends Group {
    /** the antipodal parameter the bar was drawn at */
    readonly antipode: number;

    constructor(options: CircleGraphOptions) {
        super();
        const R = options.radius ?? 1;
        const lift = options.lift ?? 0.55;
        const scale = options.scale ?? 1;
        const height = (t: number): number => lift + scale * options.h(t);
        const on = (t: number): Vector3 =>
            new Vector3(R * Math.cos(t), R * Math.sin(t), height(t));

        // --- the domain: the circle itself, lying flat -----------------------
        const circle: Vector3[] = [];
        for (let i = 0; i <= SAMPLES; i++) {
            const t = (2 * Math.PI * i) / SAMPLES;
            circle.push(new Vector3(R * Math.cos(t), R * Math.sin(t), 0));
        }
        this.add(
            new Mesh(
                new TubeGeometry(
                    new CatmullRomCurve3(circle, true),
                    SAMPLES,
                    CIRCLE_TUBE,
                    12,
                    true,
                ),
                // charcoal, like every other domain circle in the set — this IS
                // the domain, and the quiet slate used for scaffolding would
                // demote it to scenery
                matte(theme.roles.core),
            ),
        );

        // --- the graph -------------------------------------------------------
        const graph: Vector3[] = [];
        for (let i = 0; i <= SAMPLES; i++) graph.push(on((2 * Math.PI * i) / SAMPLES));
        this.add(
            new Mesh(
                new TubeGeometry(new CatmullRomCurve3(graph, true), SAMPLES, GRAPH_TUBE, 12, true),
                matte(roleColor("map")),
            ),
        );

        // --- the glass sheet between them ------------------------------------
        // A ruled surface, one quad per sample: the vertical segment at θ from
        // the circle up to the graph. Thin glass rather than a solid skirt so
        // the far side of the circle stays readable through it.
        this.add(this.skirt(R, height));

        // --- the theorem: one level bar --------------------------------------
        const t0 = antipodalRoot((t) => height(t) - height(t + Math.PI));
        this.antipode = t0;
        const a = on(t0);
        const b = on(t0 + Math.PI);
        this.add(
            new Mesh(
                new TubeGeometry(new CatmullRomCurve3([a, b]), 2, BAR_TUBE, 10, false),
                matte(theme.marker),
            ),
        );
        for (const p of [a, b]) {
            const dot = new Mesh(new SphereGeometry(DOT, 24, 16), matte(theme.marker));
            dot.position.copy(p);
            this.add(dot);
        }
        // the antipodal pair marked on the circle too, so the reader can see
        // that the two feet really are opposite ends of a diameter
        for (const t of [t0, t0 + Math.PI]) {
            const foot = new Mesh(new SphereGeometry(DOT * 0.6, 20, 12), matte(theme.marker));
            foot.position.set(R * Math.cos(t), R * Math.sin(t), 0);
            this.add(foot);
        }
    }

    private skirt(R: number, height: (t: number) => number): Mesh {
        const geometry = new BufferGeometry();
        const count = 2 * (SAMPLES + 1);
        const position = new Float32Array(3 * count);
        const normal = new Float32Array(3 * count);
        const uv = new Float32Array(2 * count);
        for (let i = 0; i <= SAMPLES; i++) {
            const t = (2 * Math.PI * i) / SAMPLES;
            const [cos, sin] = [Math.cos(t), Math.sin(t)];
            const base = 6 * i;
            position[base] = R * cos;
            position[base + 1] = R * sin;
            position[base + 2] = 0;
            position[base + 3] = R * cos;
            position[base + 4] = R * sin;
            position[base + 5] = height(t);
            // the surface is vertical, so its normal is the circle's radial
            // direction — no cross products needed, and exact
            for (const k of [0, 3]) {
                normal[base + k] = cos;
                normal[base + k + 1] = sin;
                normal[base + k + 2] = 0;
            }
            uv[4 * i] = i / SAMPLES;
            uv[4 * i + 1] = 0;
            uv[4 * i + 2] = i / SAMPLES;
            uv[4 * i + 3] = 1;
        }
        const indices = new Uint32Array(6 * SAMPLES);
        for (let i = 0; i < SAMPLES; i++) {
            const [a, b, c, d] = [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3];
            indices.set([a, c, b, b, c, d], 6 * i);
        }
        geometry.setAttribute("position", new BufferAttribute(position, 3));
        geometry.setAttribute("normal", new BufferAttribute(normal, 3));
        geometry.setAttribute("uv", new BufferAttribute(uv, 2));
        geometry.setIndex(new BufferAttribute(indices, 1));

        return new Mesh(
            geometry,
            new MeshPhysicalMaterial({
                color: theme.paper.glass.color,
                roughness: theme.paper.glass.roughness,
                metalness: 0,
                transmission: 0.92,
                thickness: 0.04,
                ior: theme.paper.glass.iorThin,
                side: DoubleSide,
            }),
        );
    }

    dispose(): void {
        this.traverse((node) => {
            if (!(node instanceof Mesh)) return;
            node.geometry.dispose();
            (node.material as MeshPhysicalMaterial).dispose();
        });
    }
}

/**
 * A θ with g(θ) = 0, for a g that is odd under θ ↦ θ + π.
 *
 * Such a g changes sign between 0 and π by construction, so plain bisection on
 * that interval always converges — no search, no failure case. This is the
 * n = 1 Borsuk–Ulam theorem, evaluated rather than assumed.
 */
function antipodalRoot(g: (t: number) => number): number {
    let lo = 0;
    let hi = Math.PI;
    if (g(lo) === 0) return lo;
    let sign = Math.sign(g(lo));
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const value = g(mid);
        if (value === 0) return mid;
        if (Math.sign(value) === sign) {
            lo = mid;
            sign = Math.sign(value);
        } else {
            hi = mid;
        }
    }
    return (lo + hi) / 2;
}

/**
 * RibbonStrip — the swept segment surface between two graph curves
 * (math spec: the Borsuk ribbon): at each θ the straight segment ℓ_θ from
 * Γ_a(θ) to Γ_b(θ), embedded in the solid torus. Near the pole it is a flat
 * annulus; at the equator the odd relative winding forces a Möbius-like
 * twist — the `relativeWinding` meter made visible.
 *
 * Same discipline as GraphTube: fixed N × W grid topology built once,
 * refit() rewrites positions/normals in place with zero allocation.
 * Cross-bands (alternating vertex-color tint along θ) act as ladder rungs so
 * the twisting reads under motion and in stills.
 */

import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshPhysicalMaterial } from "three";
import type { GraphCurve } from "../math/types.ts";
import type { SolidTorus } from "../math/torus.ts";
import { theme } from "./theme.ts";

const BANDS = 32; // alternating tint bands around the loop

export interface RibbonStripOptions {
    a: GraphCurve;
    b: GraphCurve;
    torus: SolidTorus;
    /** samples across the segment (default 8) */
    width?: number;
    color?: number;
    opacity?: number;
}

export class RibbonStrip extends Mesh {
    private readonly a: GraphCurve;
    private readonly b: GraphCurve;
    private readonly torus: SolidTorus;
    private readonly W: number;

    constructor(options: RibbonStripOptions) {
        const { a, b, torus } = options;
        const W = options.width ?? 8;
        const geometry = buildRibbonTopology(a.N, W);
        super(
            geometry,
            new MeshPhysicalMaterial({
                color: options.color ?? theme.ribbon.color,
                transparent: true,
                opacity: options.opacity ?? theme.ribbon.opacity,
                roughness: 0.4,
                metalness: 0,
                clearcoat: 0.5,
                clearcoatRoughness: 0.35,
                side: DoubleSide,
                vertexColors: true,
                depthWrite: false,
            }),
        );
        this.renderOrder = 4; // under the shell, over opaque tubes
        this.a = a;
        this.b = b;
        this.torus = torus;
        this.W = W;
        this.refit();
    }

    /** Rewrite positions/normals from the (refilled) boundary curves. */
    refit(): void {
        const { a, b, torus, W } = this;
        const N = a.N;
        const posAttr = this.geometry.getAttribute("position") as BufferAttribute;
        const nrmAttr = this.geometry.getAttribute("normal") as BufferAttribute;
        const pos = posAttr.array as Float32Array;
        const nrm = nrmAttr.array as Float32Array;

        // positions: lerp across the fiber-disk segment, then embed. The
        // segment lives in one meridian disk, so interpolation in (u, v) is
        // exactly the straight segment ℓ_θ of the proof.
        const p = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < N; i++) {
            const theta = a.theta[i]!;
            const ax = a.disk[2 * i]!;
            const ay = a.disk[2 * i + 1]!;
            const bx = b.disk[2 * i]!;
            const by = b.disk[2 * i + 1]!;
            for (let j = 0; j < W; j++) {
                const t = j / (W - 1);
                torus.embed(theta, ax + t * (bx - ax), ay + t * (by - ay), p);
                const k = 3 * (i * W + j);
                pos[k] = p.x;
                pos[k + 1] = p.y;
                pos[k + 2] = p.z;
            }
        }

        // normals: cross of the two grid tangents, central-difference in θ
        // (cyclic), forward/backward across the ruling
        for (let i = 0; i < N; i++) {
            const iPrev = ((i + N - 1) % N) * W;
            const iNext = ((i + 1) % N) * W;
            const iHere = i * W;
            for (let j = 0; j < W; j++) {
                const jPrev = Math.max(0, j - 1);
                const jNext = Math.min(W - 1, j + 1);
                const kThetaA = 3 * (iNext + j);
                const kThetaB = 3 * (iPrev + j);
                const kRulA = 3 * (iHere + jNext);
                const kRulB = 3 * (iHere + jPrev);
                const tx = pos[kThetaA]! - pos[kThetaB]!;
                const ty = pos[kThetaA + 1]! - pos[kThetaB + 1]!;
                const tz = pos[kThetaA + 2]! - pos[kThetaB + 2]!;
                const rx = pos[kRulA]! - pos[kRulB]!;
                const ry = pos[kRulA + 1]! - pos[kRulB + 1]!;
                const rz = pos[kRulA + 2]! - pos[kRulB + 2]!;
                let nx = ty * rz - tz * ry;
                let ny = tz * rx - tx * rz;
                let nz = tx * ry - ty * rx;
                const len = Math.hypot(nx, ny, nz) || 1;
                nx /= len;
                ny /= len;
                nz /= len;
                const k = 3 * (iHere + j);
                nrm[k] = nx;
                nrm[k + 1] = ny;
                nrm[k + 2] = nz;
            }
        }

        posAttr.needsUpdate = true;
        nrmAttr.needsUpdate = true;
        this.geometry.computeBoundingSphere();
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as MeshPhysicalMaterial).dispose();
    }
}

/** N × W grid, closed in θ, open across; banded vertex colors set once. */
function buildRibbonTopology(N: number, W: number): BufferGeometry {
    const geometry = new BufferGeometry();
    const count = N * W;
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(3 * count), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array(3 * count), 3));

    // real uv so the path tracer's tangent generation stays finite (see GraphTube)
    const uv = new Float32Array(2 * count);
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < W; j++) {
            const k = 2 * (i * W + j);
            uv[k] = i / N;
            uv[k + 1] = j / (W - 1);
        }
    }
    geometry.setAttribute("uv", new BufferAttribute(uv, 2));

    const colors = new Float32Array(3 * count);
    for (let i = 0; i < N; i++) {
        const band = Math.floor((i / N) * BANDS) % 2 === 0 ? 1 : theme.ribbon.bandTint;
        for (let j = 0; j < W; j++) {
            const k = 3 * (i * W + j);
            colors[k] = band;
            colors[k + 1] = band;
            colors[k + 2] = band;
        }
    }
    geometry.setAttribute("color", new BufferAttribute(colors, 3));

    const index = new Uint32Array(6 * N * (W - 1));
    let k = 0;
    for (let i = 0; i < N; i++) {
        const i1 = (i + 1) % N;
        for (let j = 0; j < W - 1; j++) {
            const a = i * W + j;
            const b = i1 * W + j;
            const c = i1 * W + j + 1;
            const d = i * W + j + 1;
            index[k++] = a;
            index[k++] = b;
            index[k++] = c;
            index[k++] = a;
            index[k++] = c;
            index[k++] = d;
        }
    }
    geometry.setIndex(new BufferAttribute(index, 1));
    return geometry;
}

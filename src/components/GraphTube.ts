/**
 * GraphTube — a graph curve rendered as a closed tube in the solid torus.
 *
 * The performance-critical component. Topology (N rings × M sides, index
 * buffer) is allocated ONCE; refit() re-embeds the curve and rewrites
 * positions/normals in place with zero allocation, so a proof parameter can
 * animate at 60fps without GC pressure.
 *
 * Frames along the centerline are rotation-minimizing (parallel transport
 * of an initial normal, with the closure mismatch distributed evenly around
 * the loop so the tube seams up smoothly — a closed RMF generally doesn't
 * close on its own).
 */

import { BufferAttribute, BufferGeometry, Mesh } from "three";
import type { GraphCurve } from "../math/types.ts";
import type { SolidTorus } from "../math/torus.ts";
import { vec3, set3, cross3, dot3, normalize3, addScaled3 } from "../math/types.ts";
import type { Vec3 } from "../math/types.ts";
import { Params } from "../core/Params.ts";
import { candyMaterial, roleColor } from "./theme.ts";

export interface GraphTubeOptions {
    curve: GraphCurve;
    torus: SolidTorus;
    /** tube radius in world units */
    radius?: number;
    /** cross-section segments */
    sides?: number;
    /** defaults to the role color from the theme */
    color?: number;
}

export class GraphTube extends Mesh {
    readonly params = new Params(this);
    declare radius: number;
    declare color: number;

    private curve: GraphCurve;
    private torus: SolidTorus;
    private readonly sides: number;

    // per-ring scratch, sized once for curve.N
    private centers: Float32Array;
    private tangents: Float32Array;
    private normals1: Float32Array; // transported normal n
    private normals2: Float32Array; // binormal b = T × n

    constructor(options: GraphTubeOptions) {
        const { curve, torus } = options;
        const sides = options.sides ?? 12;

        const geometry = buildTubeTopology(curve.N, sides);
        const color = options.color ?? roleColor(curve.role);
        super(geometry, candyMaterial(color));

        this.curve = curve;
        this.torus = torus;
        this.sides = sides;
        this.centers = new Float32Array(3 * curve.N);
        this.tangents = new Float32Array(3 * curve.N);
        this.normals1 = new Float32Array(3 * curve.N);
        this.normals2 = new Float32Array(3 * curve.N);

        this.params
            .define("radius", options.radius ?? 0.06, { triggers: "rebuild" })
            .define("color", color, { triggers: "update" })
            .dependOn(torus);

        this.refit();
    }

    /** Re-embed the (possibly refilled) curve into the tube mesh. Hot path. */
    refit(): void {
        const { curve, torus } = this;
        const N = curve.N;

        // 1) embedded centerline
        const p = scratchA;
        for (let i = 0; i < N; i++) {
            torus.embed(curve.theta[i]!, curve.disk[2 * i]!, curve.disk[2 * i + 1]!, p);
            this.centers[3 * i] = p.x;
            this.centers[3 * i + 1] = p.y;
            this.centers[3 * i + 2] = p.z;
        }

        // 2) cyclic central-difference tangents
        for (let i = 0; i < N; i++) {
            const prev = (i + N - 1) % N;
            const next = (i + 1) % N;
            set3(
                p,
                this.centers[3 * next]! - this.centers[3 * prev]!,
                this.centers[3 * next + 1]! - this.centers[3 * prev + 1]!,
                this.centers[3 * next + 2]! - this.centers[3 * prev + 2]!,
            );
            normalize3(p, p);
            this.tangents[3 * i] = p.x;
            this.tangents[3 * i + 1] = p.y;
            this.tangents[3 * i + 2] = p.z;
        }

        // 3) parallel-transport an initial normal along the loop
        const T = scratchA;
        const n = scratchB;
        readV(this.tangents, 0, T);
        // seed with whichever axis is least aligned with T
        set3(n, 0, 1, 0);
        if (Math.abs(T.y) > 0.9) set3(n, 1, 0, 0);
        addScaled3(n, n, T, -dot3(n, T));
        normalize3(n, n);
        for (let i = 0; i < N; i++) {
            readV(this.tangents, i, T);
            addScaled3(n, n, T, -dot3(n, T));
            normalize3(n, n);
            this.normals1[3 * i] = n.x;
            this.normals1[3 * i + 1] = n.y;
            this.normals1[3 * i + 2] = n.z;
        }

        // 4) measure the holonomy: transport once more around to ring 0 and
        //    compare with the seed, then unwind δ·i/N at each ring
        readV(this.tangents, 0, T);
        addScaled3(n, n, T, -dot3(n, T));
        normalize3(n, n);
        const n0 = scratchC;
        readV(this.normals1, 0, n0);
        const cr = scratchD;
        cross3(cr, n, n0);
        const delta = Math.atan2(dot3(cr, T), dot3(n, n0));

        const b = scratchD;
        for (let i = 0; i < N; i++) {
            readV(this.tangents, i, T);
            readV(this.normals1, i, n);
            const angle = (delta * i) / N;
            // rotate n by `angle` around T (Rodrigues, n ⊥ T so the
            // formula collapses to cos·n + sin·(T×n))
            cross3(b, T, n);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            set3(n, cos * n.x + sin * b.x, cos * n.y + sin * b.y, cos * n.z + sin * b.z);
            cross3(b, T, n);
            this.normals1[3 * i] = n.x;
            this.normals1[3 * i + 1] = n.y;
            this.normals1[3 * i + 2] = n.z;
            this.normals2[3 * i] = b.x;
            this.normals2[3 * i + 1] = b.y;
            this.normals2[3 * i + 2] = b.z;
        }

        // 5) write ring vertices
        const posAttr = this.geometry.getAttribute("position") as BufferAttribute;
        const nrmAttr = this.geometry.getAttribute("normal") as BufferAttribute;
        const pos = posAttr.array as Float32Array;
        const nrm = nrmAttr.array as Float32Array;
        const r = this.radius;
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < this.sides; j++) {
                const alpha = (2 * Math.PI * j) / this.sides;
                const ca = Math.cos(alpha);
                const sa = Math.sin(alpha);
                const k = 3 * (i * this.sides + j);
                const nx = ca * this.normals1[3 * i]! + sa * this.normals2[3 * i]!;
                const ny = ca * this.normals1[3 * i + 1]! + sa * this.normals2[3 * i + 1]!;
                const nz = ca * this.normals1[3 * i + 2]! + sa * this.normals2[3 * i + 2]!;
                pos[k] = this.centers[3 * i]! + r * nx;
                pos[k + 1] = this.centers[3 * i + 1]! + r * ny;
                pos[k + 2] = this.centers[3 * i + 2]! + r * nz;
                nrm[k] = nx;
                nrm[k + 1] = ny;
                nrm[k + 2] = nz;
            }
        }
        posAttr.needsUpdate = true;
        nrmAttr.needsUpdate = true;
        this.geometry.computeBoundingSphere();
    }

    rebuild(): void {
        this.refit();
    }

    update(): void {
        (this.material as ReturnType<typeof candyMaterial>).color.set(this.color);
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as ReturnType<typeof candyMaterial>).dispose();
    }
}

/** Index buffer for a closed N×M grid — built once per tube. */
function buildTubeTopology(N: number, sides: number): BufferGeometry {
    const geometry = new BufferGeometry();
    const vertexCount = N * sides;
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(3 * vertexCount), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array(3 * vertexCount), 3));

    // natural (θ, cross-section) uv — the path tracer's scene generator
    // computes tangents from uv, and a missing buffer degenerates to NaN
    // tangents that render the mesh black
    const uv = new Float32Array(2 * vertexCount);
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < sides; j++) {
            const k = 2 * (i * sides + j);
            uv[k] = i / N;
            uv[k + 1] = j / sides;
        }
    }
    geometry.setAttribute("uv", new BufferAttribute(uv, 2));

    // winding chosen so the geometric (face) normal agrees with the outward
    // vertex normals — the path tracer shades by face orientation, and a
    // mismatched winding renders as black backfaces
    const index = new Uint32Array(6 * N * sides);
    let k = 0;
    for (let i = 0; i < N; i++) {
        const i1 = (i + 1) % N;
        for (let j = 0; j < sides; j++) {
            const j1 = (j + 1) % sides;
            const a = i * sides + j;
            const b = i1 * sides + j;
            const c = i1 * sides + j1;
            const d = i * sides + j1;
            index[k++] = a;
            index[k++] = c;
            index[k++] = b;
            index[k++] = a;
            index[k++] = d;
            index[k++] = c;
        }
    }
    geometry.setIndex(new BufferAttribute(index, 1));
    return geometry;
}

function readV(arr: Float32Array, i: number, out: Vec3): Vec3 {
    return set3(out, arr[3 * i]!, arr[3 * i + 1]!, arr[3 * i + 2]!);
}

const scratchA = vec3();
const scratchB = vec3();
const scratchC = vec3();
const scratchD = vec3();

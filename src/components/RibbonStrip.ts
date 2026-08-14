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
 *
 * FIGURE STAGING (setTwoTone / setRungs). Under motion a single-colour band
 * reads fine — the eye integrates the turning. A STILL does not: the paper's
 * equator ribbon traced as one flat mass in which the odd half-twist, the
 * entire content of §3, was invisible. Two fixes, both opt-in so the demos
 * keep the translucent look:
 *
 *   two-tone   the band is given paper THICKNESS — this surface offset half a
 *              hair one way, an underside sheet offset the other with reversed
 *              winding — and the two are painted differently, so each half-twist
 *              FLIPS the colour and becomes countable rather than inferable.
 *              (A FrontSide/BackSide pair sharing one geometry is the obvious
 *              implementation and does not work: three-gpu-pathtracer traces
 *              every surface two-sided, so both meshes came out the same
 *              colour. Two sheets is also the more honest picture — the paper
 *              tells the reader to take an actual strip of paper.)
 *   rungs      a few dozen ℓ_θ drawn as tubes across the band — Figure 4's
 *              hatching, and the thing that ties the surface to the segments
 *              it is swept from.
 */

import {
    BufferAttribute,
    BufferGeometry,
    CylinderGeometry,
    DoubleSide,
    Matrix4,
    Mesh,
    MeshPhysicalMaterial,
    Quaternion,
    Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GraphCurve } from "../math/types.ts";
import type { SolidTorus } from "../math/torus.ts";
import { vec3 } from "../math/types.ts";
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
    /** the underside sheet; null until two-tone staging is turned on */
    private backMesh: Mesh | null = null;
    private rungMesh: Mesh | null = null;
    private rungCount = 0;
    private rungRadius = 0.015;
    /** paper thickness in world units; 0 while the band is a single sheet */
    private thickness = 0;

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
        // in a figure the band must read as a surface, not a haze — see the
        // figureSolid branch in FigureRenderer (and constraint 4 in the roadmap)
        this.userData.figureSolid = true;
        // the demo look, to restore when two-tone staging is turned back off
        this.userData.baseColor = options.color ?? theme.ribbon.color;
        this.userData.baseOpacity = options.opacity ?? theme.ribbon.opacity;
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
        const pos = posAttr.array as Float32Array;

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

        // normals FROM the winding (face-normal average): the path tracer
        // shades by face orientation and renders any winding/normal
        // mismatch black (roadmap constraint #2) — hand-rolled cross
        // products can't guarantee the sign, computeVertexNormals can
        posAttr.needsUpdate = true;
        this.geometry.computeVertexNormals();
        const nrmAttr = this.geometry.getAttribute("normal") as BufferAttribute;
        nrmAttr.needsUpdate = true;

        // give the sheet thickness: this surface lifts half a thickness along
        // its normal, the underside drops the other half and flips its normals
        if (this.thickness > 0 && this.backMesh) {
            const half = this.thickness / 2;
            const nrm = nrmAttr.array as Float32Array;
            const backGeom = this.backMesh.geometry;
            const backPos = (backGeom.getAttribute("position") as BufferAttribute)
                .array as Float32Array;
            const backNrm = (backGeom.getAttribute("normal") as BufferAttribute)
                .array as Float32Array;
            for (let k = 0; k < pos.length; k++) {
                backPos[k] = pos[k]! - half * nrm[k]!;
                backNrm[k] = -nrm[k]!;
                pos[k] = pos[k]! + half * nrm[k]!;
            }
            (backGeom.getAttribute("position") as BufferAttribute).needsUpdate = true;
            (backGeom.getAttribute("normal") as BufferAttribute).needsUpdate = true;
            backGeom.computeBoundingSphere();
        }

        this.geometry.computeBoundingSphere();
        if (this.rungMesh?.visible) this.buildRungs();
    }

    /**
     * Paint the two faces differently (figure staging). Also drops the
     * alternating band tint — with the faces carrying the reading, the bands
     * are noise — and goes opaque, since a see-through band has no near face
     * for a colour to belong to.
     */
    setTwoTone(on: boolean, thickness = 0.02): void {
        const front = this.material as MeshPhysicalMaterial;
        if (on && !this.backMesh) {
            const back = front.clone();
            back.color.setHex(theme.ribbon.faceBack);
            // the underside must be OPAQUE in its own right: cloned from the
            // demo's translucent band it washed out to the same white as the
            // top face, which is the failure two-tone exists to fix
            back.transparent = false;
            back.opacity = 1;
            back.depthWrite = true;
            back.vertexColors = false;
            const mesh = new Mesh(mirrorTopology(this.geometry), back);
            mesh.renderOrder = this.renderOrder;
            mesh.userData.figureSolid = true;
            mesh.userData.figureEmissive = 0.05;
            this.backMesh = mesh;
            this.add(mesh);
        }
        if (this.backMesh) this.backMesh.visible = on;
        this.thickness = on ? thickness : 0;
        this.userData.figureEmissive = on ? 0.05 : 0.18;

        front.color.setHex(on ? theme.ribbon.faceFront : (this.userData.baseColor as number));
        front.transparent = !on;
        front.opacity = on ? 1 : (this.userData.baseOpacity as number);
        front.depthWrite = on;
        front.vertexColors = !on;
        front.needsUpdate = true;
        this.refit();
    }

    /** Draw n of the ℓ_θ as tubes across the band (0 = none). */
    setRungs(n: number, radius = this.rungRadius): void {
        this.rungCount = n;
        this.rungRadius = radius;
        if (n === 0) {
            if (this.rungMesh) this.rungMesh.visible = false;
            return;
        }
        if (!this.rungMesh) {
            const material = new MeshPhysicalMaterial({
                color: theme.ribbon.rung,
                roughness: 0.4,
                metalness: 0,
            });
            this.rungMesh = new Mesh(new BufferGeometry(), material);
            this.rungMesh.renderOrder = this.renderOrder + 1;
            this.add(this.rungMesh);
        }
        this.rungMesh.visible = true;
        this.buildRungs();
    }

    /**
     * Merge one small cylinder per ℓ_θ. Rebuilt rather than refilled in place:
     * the rungs are figure furniture, not a hot path, and CylinderGeometry
     * brings correct normals, winding and uvs — all three of which the path
     * tracer checks (roadmap constraints 1 and 2).
     */
    private buildRungs(): void {
        const mesh = this.rungMesh;
        if (!mesh || this.rungCount === 0) return;
        const { a, b, torus, rungCount, rungRadius } = this;
        const p0 = vec3();
        const p1 = vec3();
        const dir = new Vector3();
        const mid = new Vector3();
        const up = new Vector3(0, 1, 0);
        const quaternion = new Quaternion();
        const one = new Vector3(1, 1, 1);
        const matrix = new Matrix4();
        const parts: BufferGeometry[] = [];

        for (let k = 0; k < rungCount; k++) {
            const i = Math.round((k / rungCount) * a.N) % a.N;
            const theta = a.theta[i]!;
            torus.embed(theta, a.disk[2 * i]!, a.disk[2 * i + 1]!, p0);
            torus.embed(theta, b.disk[2 * i]!, b.disk[2 * i + 1]!, p1);
            dir.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
            const length = dir.length();
            // at the antipodal pair the segment degenerates: no rung to draw,
            // and that absence is exactly what the pinch figure is about
            if (length < 4 * rungRadius) continue;
            dir.divideScalar(length);
            mid.set((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
            quaternion.setFromUnitVectors(up, dir);
            const part = new CylinderGeometry(rungRadius, rungRadius, length, 8, 1);
            part.applyMatrix4(matrix.compose(mid, quaternion, one));
            parts.push(part);
        }

        mesh.geometry.dispose();
        mesh.geometry = parts.length ? mergeGeometries(parts) : new BufferGeometry();
        for (const part of parts) part.dispose();
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as MeshPhysicalMaterial).dispose();
        if (this.backMesh) (this.backMesh.material as MeshPhysicalMaterial).dispose();
        if (this.rungMesh) {
            this.rungMesh.geometry.dispose();
            (this.rungMesh.material as MeshPhysicalMaterial).dispose();
        }
    }
}

/**
 * The same grid with its triangles wound the other way — the underside sheet.
 * Winding, not just normals, because the path tracer shades from face
 * orientation (roadmap constraint #2): reversed index = the downward face is
 * the front one, which is what makes the underside read as its own colour.
 */
function mirrorTopology(source: BufferGeometry): BufferGeometry {
    const geometry = new BufferGeometry();
    for (const name of ["position", "normal", "uv"] as const) {
        const attr = source.getAttribute(name) as BufferAttribute;
        geometry.setAttribute(
            name,
            new BufferAttribute(new Float32Array(attr.array.length), attr.itemSize),
        );
    }
    const index = source.getIndex() as BufferAttribute;
    const flipped = new Uint32Array(index.array.length);
    for (let i = 0; i < index.array.length; i += 3) {
        flipped[i] = index.array[i]!;
        flipped[i + 1] = index.array[i + 2]!;
        flipped[i + 2] = index.array[i + 1]!;
    }
    geometry.setIndex(new BufferAttribute(flipped, 1));
    return geometry;
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

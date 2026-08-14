/**
 * TwistedBand — a paper strip closed into a ring with n full twists, and its
 * two edge curves.
 *
 * This is the hands-on end of the Borsuk argument. §3 concludes that the strip
 * swept between Γ_f and Γ_f̄ closes up with a nonzero number of full twists,
 * and then asks the reader to believe that such a strip has linked edges. That
 * is a fact about paper, not about the map, and it deserves to be shown as
 * paper: take a strip, put in some twists, tape a string along each edge, and
 * try to pull the strings apart.
 *
 * So this object carries NO map, NO torus and NO sphere — it is deliberately
 * the one figure in the set with no mathematics in it beyond the twisting. Its
 * whole job is to make the twist count feel like a reason.
 *
 * The two faces are painted differently, as in RibbonStrip: a one-colour band
 * makes counting half-twists something to take on trust, when it is exactly
 * what the figure exists to show. The edges wear the role colours of the two
 * curves they stand for.
 *
 * Local frame: the ring in the xy-plane, centred at the origin.
 */

import {
    BackSide,
    BufferAttribute,
    BufferGeometry,
    CatmullRomCurve3,
    FrontSide,
    Group,
    Mesh,
    MeshPhysicalMaterial,
    TubeGeometry,
    Vector3,
} from "three";
import { roleColor, theme } from "./theme.ts";

const SEGMENTS = 512;
const EDGE_TUBE = 0.022;

export interface TwistedBandOptions {
    /** FULL twists — the parity is the whole content, so this is an integer */
    twists?: number;
    /** ring radius */
    radius?: number;
    /** half-width of the strip */
    halfWidth?: number;
}

export class TwistedBand extends Group {
    private front: Mesh;
    private back: Mesh;
    private edgeA: Mesh;
    private edgeB: Mesh;
    private readonly radius: number;
    private readonly halfWidth: number;

    constructor(options: TwistedBandOptions = {}) {
        super();
        this.radius = options.radius ?? 1;
        this.halfWidth = options.halfWidth ?? 0.26;

        const face = (color: number, side: typeof FrontSide | typeof BackSide): Mesh =>
            new Mesh(
                new BufferGeometry(),
                new MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0, side }),
            );
        // two single-sided meshes over the same surface rather than one
        // DoubleSide mesh: that is what lets each face take its own colour, and
        // the winding stays consistent for the path tracer
        this.front = face(theme.ribbon.faceFront, FrontSide);
        this.back = face(theme.ribbon.faceBack, BackSide);

        const edge = (color: number): Mesh =>
            new Mesh(
                new BufferGeometry(),
                new MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0 }),
            );
        this.edgeA = edge(roleColor("map"));
        this.edgeB = edge(roleColor("antipodal-map"));

        this.add(this.front, this.back, this.edgeA, this.edgeB);
        this.setTwists(options.twists ?? 1);
    }

    /** Rebuild with a different number of FULL twists. */
    setTwists(twists: number): void {
        const { radius: R, halfWidth: w } = this;
        const position = new Float32Array(3 * 2 * (SEGMENTS + 1));
        const normal = new Float32Array(3 * 2 * (SEGMENTS + 1));
        const uv = new Float32Array(2 * 2 * (SEGMENTS + 1));
        const edgeA: Vector3[] = [];
        const edgeB: Vector3[] = [];

        for (let i = 0; i <= SEGMENTS; i++) {
            const t = i / SEGMENTS;
            const theta = 2 * Math.PI * t;
            // n FULL twists over one trip round: the strip's own frame rotates
            // by 2πn, so the parity of n is the parity of the half-twists
            const roll = 2 * Math.PI * twists * t;
            const [c, s] = [Math.cos(theta), Math.sin(theta)];
            // radial and vertical directions at this θ; the strip's width runs
            // along their combination, turning as it goes
            const dx = c * Math.cos(roll);
            const dy = s * Math.cos(roll);
            const dz = Math.sin(roll);
            const cx = R * c;
            const cy = R * s;

            const a = new Vector3(cx + w * dx, cy + w * dy, w * dz);
            const b = new Vector3(cx - w * dx, cy - w * dy, -w * dz);
            edgeA.push(a);
            edgeB.push(b);

            const base = 6 * i;
            position.set([a.x, a.y, a.z, b.x, b.y, b.z], base);
            // the strip's normal is perpendicular to both its width direction
            // and the ring's tangent
            const tangent = new Vector3(-s, c, 0);
            const width = new Vector3(dx, dy, dz);
            const n = new Vector3().crossVectors(tangent, width).normalize();
            normal.set([n.x, n.y, n.z, n.x, n.y, n.z], base);
            uv.set([t, 0, t, 1], 4 * i);
        }

        const indices = new Uint32Array(6 * SEGMENTS);
        for (let i = 0; i < SEGMENTS; i++) {
            const [a, b, c, d] = [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3];
            indices.set([a, c, b, b, c, d], 6 * i);
        }

        for (const mesh of [this.front, this.back]) {
            mesh.geometry.dispose();
            const geometry = new BufferGeometry();
            geometry.setAttribute("position", new BufferAttribute(position.slice(), 3));
            geometry.setAttribute("normal", new BufferAttribute(normal.slice(), 3));
            geometry.setAttribute("uv", new BufferAttribute(uv.slice(), 2));
            geometry.setIndex(new BufferAttribute(indices.slice(), 1));
            mesh.geometry = geometry;
        }

        for (const [mesh, points] of [
            [this.edgeA, edgeA],
            [this.edgeB, edgeB],
        ] as [Mesh, Vector3[]][]) {
            mesh.geometry.dispose();
            mesh.geometry = new TubeGeometry(
                new CatmullRomCurve3(points, true),
                SEGMENTS,
                EDGE_TUBE,
                12,
                true,
            );
        }
    }

    dispose(): void {
        for (const mesh of [this.front, this.back, this.edgeA, this.edgeB]) {
            mesh.geometry.dispose();
            (mesh.material as MeshPhysicalMaterial).dispose();
        }
    }
}

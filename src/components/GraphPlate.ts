/**
 * GraphPlate — the n = 1 case as a physical object: a card carrying the graphs
 * of f and of the identity over [0, 1]², with their crossing marked.
 *
 * The paper opens Brouwer with this (p. 3): "since the graph of f must start
 * above the graph of the identity and must end below it, there must be a point
 * where the two graphs cross", and it is the intuition every later figure
 * reuses — a graph, a reference graph, a forced crossing. It has no figure.
 *
 * Built as a lit card rather than flat line art so it belongs to the same set
 * as the torus figures: same ground, same light, same plate stock as the fibre
 * disks. Local frame: the unit square in the xy-plane facing +z, origin at the
 * square's lower-left corner.
 */

import {
    BoxGeometry,
    CatmullRomCurve3,
    CylinderGeometry,
    Group,
    Mesh,
    MeshPhysicalMaterial,
    SphereGeometry,
    TubeGeometry,
    Vector3,
} from "three";
import { roleColor, theme } from "./theme.ts";

const SAMPLES = 160;
// generous, so both axes sit clearly INSIDE the card rather than merging
// with its edge
const CARD_MARGIN = 0.2;
const CARD_THICK = 0.03;
const FACE = CARD_THICK / 2;
const CURVE_RADIUS = 0.016;

function matte(color: number): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0 });
}

export class GraphPlate extends Group {
    private readonly crossing: Mesh;

    /** @param f a continuous map [0,1] → [0,1] to graph against the identity */
    constructor(f: (x: number) => number) {
        super();

        const card = new Mesh(
            new BoxGeometry(1 + 2 * CARD_MARGIN, 1 + 2 * CARD_MARGIN, CARD_THICK),
            matte(theme.paper.plate),
        );
        card.position.set(0.5, 0.5, -FACE);
        this.add(card);

        // All FOUR sides, not just the two axes. The point of the picture is
        // that the graph is trapped in D¹ × D¹ — the square IS the codomain
        // crossed with the domain, and a graph of [0,1] → [0,1] cannot leave
        // it. Drawn with only a bottom and a left edge the square reads as a
        // pair of axes with open space beyond, which is the one thing the
        // figure must not suggest: the whole argument is confinement.
        for (const [x, y, vertical] of [
            [0.5, 0, false],
            [0.5, 1, false],
            [0, 0.5, true],
            [1, 0.5, true],
        ] as [number, number, boolean][]) {
            const side = new Mesh(
                new CylinderGeometry(0.011, 0.011, 1, 10),
                matte(theme.paper.plateRim),
            );
            side.position.set(x, y, FACE + 0.006);
            if (!vertical) side.rotation.z = Math.PI / 2;
            this.add(side);
        }

        this.add(this.graphTube((x) => x, roleColor("identity")));
        this.add(this.graphTube(f, roleColor("map")));

        this.crossing = new Mesh(new SphereGeometry(0.036, 24, 16), matte(theme.marker));
        this.crossing.visible = false;
        this.add(this.crossing);

        const x = crossingOf(f);
        if (x !== null) {
            this.crossing.visible = true;
            this.crossing.position.set(x, f(x), FACE + 0.05);
        }
    }

    private graphTube(g: (x: number) => number, color: number): Mesh {
        const points: Vector3[] = [];
        for (let i = 0; i <= SAMPLES; i++) {
            const x = i / SAMPLES;
            points.push(new Vector3(x, g(x), FACE + 0.03));
        }
        return new Mesh(
            new TubeGeometry(new CatmullRomCurve3(points), SAMPLES, CURVE_RADIUS, 10, false),
            matte(color),
        );
    }

    dispose(): void {
        this.traverse((obj) => {
            const mesh = obj as Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry.dispose();
            (mesh.material as MeshPhysicalMaterial).dispose();
        });
    }
}

/**
 * The fixed point of f: [0,1] → [0,1], by bisection on g(x) = f(x) − x.
 *
 * This is the intermediate value theorem doing the work the paper describes —
 * g(0) ≥ 0 and g(1) ≤ 0, so a root exists. Returns null only if f leaves
 * [0, 1], where the hypothesis fails and there is nothing to mark.
 */
export function crossingOf(f: (x: number) => number, tolerance = 1e-6): number | null {
    const g = (x: number): number => f(x) - x;
    let lo = 0;
    let hi = 1;
    if (g(lo) < 0 || g(hi) > 0) return null;
    while (hi - lo > tolerance) {
        const mid = (lo + hi) / 2;
        if (g(mid) >= 0) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

/**
 * Graphs scene — thinking about maps D² → D² by graphing them in the solid
 * torus. The shared assembly behind the website, lab, and render entries;
 * this is the paper's establishing picture (p.4–5), three actors left to
 * right:
 *
 *   DOMAIN     a matte disk with the concentric circle S_r and sample dots
 *   CODOMAIN   the range disk with the crumpled image f(D²) resting on it
 *              as a physically folded sheet (CrumpledSheet z-lift), the
 *              image loop f(S_r) riding the flaps, the same dots at f(x)
 *   TORUS      the glass solid torus with the graph Γ_{f_r} threading
 *              figure-style meridian disks, a dot where each disk meets
 *              the curve
 *
 * The three sample dots are the glue: the same θ-samples appear in all
 * three panels. Everything is constant-hue physical material — no
 * textures, no culling tricks — so the whole scene path-traces as-is
 * (constraints in docs/roadmap.md). Chrome lives in the entries.
 */

import {
    CatmullRomCurve3,
    CylinderGeometry,
    Group,
    Mesh,
    MeshPhysicalMaterial,
    PerspectiveCamera,
    Scene,
    TorusGeometry,
    TubeGeometry,
    Vector3,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { App } from "../../src/app/App.ts";
import type { Viewport } from "../../src/app/ViewManager.ts";
import { SolidTorus } from "../../src/math/torus.ts";
import { createDiskGrid } from "../../src/math/diskGrid.ts";
import { bakeCrumple } from "../../src/math/maps/bakedCrumple.ts";
import { vec2, vec3 } from "../../src/math/types.ts";
import { createGraphCurve, refillGraphCurve } from "../../src/math/graphCurve.ts";
import { identityLoop, mapLoop } from "../../src/math/proofs/brouwer.ts";

import { addCartoonLights, roleColor, theme } from "../../src/components/theme.ts";
import { Marker } from "../../src/components/Marker.ts";
import { MeridianDisk } from "../../src/components/MeridianDisk.ts";
import { TorusShell } from "../../src/components/TorusShell.ts";
import { CoreCurve } from "../../src/components/CoreCurve.ts";
import { GraphTube } from "../../src/components/GraphTube.ts";
import { CrumpledSheet } from "../../src/components/CrumpledSheet.ts";
import { GraphPlate } from "../../src/components/GraphPlate.ts";
import { CircleGraph } from "../../src/components/CircleGraph.ts";

const N = 512; // graph-curve samples
const LOOP_SAMPLES = 256; // image-loop tube samples
const THETAS = [0.7, 2.8, 4.9]; // the three sample points
const ACCENTS = [theme.marker, 0x0f9b8e, 0xd6456c]; // gold, teal, magenta

// The disk sliced into circles — Flatland, one slice at a time — drawn on the
// domain AND carried through the map on the codomain, where the crumple bends
// them. They are the backdrop: quiet, thin, translucent.
const RING_RADII = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
const RING_TUBE = 0.008;
// ONE of them is the circle being graphed, and it keeps the SAME colour in all
// three panels — domain circle, its image, and the graph in the torus are one
// object seen three ways, and a colour change would say otherwise.
const HIGHLIGHT = roleColor("map");
const HIGHLIGHT_TUBE = 0.019;

const PLATE_RADIUS = 1.04;
const PLATE_THICK = 0.03;
const PLATE_TOP = PLATE_THICK / 2;
const PLATE_COLOR = theme.paper.plate; // shared with SlicePlate
// Pale slate: the sheet is a SURFACE the ring family is drawn on, so it has to
// sit further from the rings in value than it used to. At the old 0x9db4d8 the
// image rings disappeared into it.
const SHEET_COLOR = 0xb4c4dd;
const SHEET_LIFT = 0.035;
const DISK_SCALE = 1.5; // plates hold their own against the R=2 torus

export type GraphsLayout = "tabletop" | "standing";
export type GraphsActor = "domain" | "codomain" | "torus";
export type GraphsDotStyle = "accent" | "gold";

export interface GraphsScene {
    readonly app: App;
    readonly state: { r: number };
    /** the one 3D view — hand to attachFigureMode as-is */
    readonly view: {
        scene: Scene;
        viewport: Viewport;
        camera: PerspectiveCamera;
        controls: OrbitControls;
    };
    setR(r: number): void;
    setLayout(layout: GraphsLayout): void;
    setDotStyle(style: GraphsDotStyle): void;
    /** the anatomy figure: the glass torus with the core, ONE fibre disk and the
     *  (1,1)-curve, with both plates and the graph of f out of the way */
    setAnatomy(on: boolean): void;
    /** the n = 1 figure: the graphs of f and the identity on a card, alone */
    setIVT(on: boolean): void;
    /** the n = 1 Borsuk–Ulam figure: a height function on the circle, its graph
     *  hanging over it on a glass sheet, and the one level antipodal bar */
    setCircleGraph(on: boolean): void;
    /** the θ the level bar was drawn at — a figure pose needs it, because the
     *  bar only LOOKS horizontal when the camera sees it broadside */
    readonly circleGraphAntipode: number;
    /** Show ONE actor, alone, standing at the origin.
     *
     *  The tabletop layout is a group portrait: three actors side by side, seen
     *  obliquely from one camera that has to hold all of them. That is the right
     *  picture for a talk and the wrong one for Figure 1's panels, which are
     *  composed separately in LaTeX — there each actor wants the whole frame,
     *  face on, with no neighbour creeping into the edge. Soloing moves the
     *  chosen actor to the origin and squares the plates up to the camera, so a
     *  panel's pose is just a distance. Pass null to go back to the group. */
    setSolo(actor: GraphsActor | null): void;
    refresh(): void;
}

function matte(color: number): MeshPhysicalMaterial {
    // candyMaterial minus clearcoat: figure scenes must trace as-is
    return new MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0 });
}

/** The ring family's material — translucent, so the rings sit ON the plate
 *  rather than on top of it. Plain alpha traces correctly (roadmap note 5). */
function ringMaterial(): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({
        color: theme.paper.rings.color,
        transparent: true,
        opacity: theme.paper.rings.opacity,
        roughness: 0.4,
        metalness: 0,
    });
}

/** ∂D² as a thin dark tube: it is part of the mathematics, and it is what
 *  makes a pale plate read as an object instead of a smudge on the ground. */
function plateRim(): Mesh {
    const rim = new Mesh(new TorusGeometry(1, 0.014, 10, 96), matte(theme.paper.plateRim));
    rim.position.z = PLATE_TOP + 0.008;
    return rim;
}

export function buildGraphsScene(): GraphsScene {
    const grid = createDiskGrid(64, 128);
    // `wild` expands the image back out toward ∂D² after the folds: three
    // creases fold the disk onto a SUBSET of itself, so without it the image
    // is a small blob in the middle of an empty plate
    const { map, layers } = bakeCrumple(grid, { wild: true });

    const app = new App();
    const torus = new SolidTorus();

    const query = new URLSearchParams(window.location.search);
    const rParam = query.get("r") ?? query.get("s");
    const state = {
        r:
            rParam !== null && Number.isFinite(Number(rParam))
                ? Math.min(1, Math.max(0.05, Number(rParam)))
                : 0.6,
    };

    const scene = new Scene();
    addCartoonLights(scene);
    app.applyEnvironment(scene);

    // ------------------------------------------------------- torus (right)
    const torusGroup = new Group();
    const fCurve = createGraphCurve(N, "map", "f_r");
    const tube = new GraphTube({ curve: fCurve, torus });
    const fiberDisks = THETAS.map(
        (theta) => new MeridianDisk(torus, { theta, style: "figure" }),
    );
    const torusDots = THETAS.map(() => new Marker(0.09));
    // the (1,1)-curve — i₁, the graph of the identity at r = 1. The anatomy
    // figure needs it: it is the reference curve every proof in the paper
    // compares against, and nothing draws it on its own.
    const iCurve = createGraphCurve(N, "identity", "i₁");
    refillGraphCurve(iCurve, identityLoop(1).loop);
    const iTube = new GraphTube({ curve: iCurve, torus });
    iTube.visible = false;
    torusGroup.add(
        new TorusShell(torus),
        new CoreCurve(torus),
        tube,
        iTube,
        ...fiberDisks,
        ...torusDots,
    );
    scene.add(torusGroup);

    // ------------------------------------------------------ domain (left)
    // local frame for both plates: disk in the xy-plane facing +z; the
    // layout toggle orients the whole group
    const domainGroup = new Group();
    const domainPlate = new Mesh(
        new CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS, PLATE_THICK, 96),
        matte(PLATE_COLOR),
    );
    domainPlate.rotation.x = Math.PI / 2;
    const domainRim = plateRim();
    // the slicing itself: concentric circles, one of which is the one we graph
    const ringMat = ringMaterial();
    const domainRings = RING_RADII.map((rho) => {
        const mesh = new Mesh(new TorusGeometry(rho, RING_TUBE, 8, 128), ringMat);
        mesh.position.z = PLATE_TOP + 0.008;
        return mesh;
    });
    const ring = new Mesh(
        new TorusGeometry(state.r, HIGHLIGHT_TUBE, 10, 128),
        matte(HIGHLIGHT),
    );
    ring.position.z = PLATE_TOP + 0.02; // clears the family where they coincide
    const domainDots = THETAS.map(() => new Marker(0.055));
    domainGroup.add(domainPlate, domainRim, ...domainRings, ring, ...domainDots);
    domainGroup.scale.setScalar(DISK_SCALE);
    scene.add(domainGroup);

    // -------------------------------------------------- codomain (middle)
    const codomainGroup = new Group();
    const codomainPlate = new Mesh(
        new CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS, PLATE_THICK, 96),
        matte(PLATE_COLOR),
    );
    codomainPlate.rotation.x = Math.PI / 2;
    const codomainRim = plateRim();
    const sheet = new CrumpledSheet({
        grid,
        positions: map.positions,
        layers,
        lift: SHEET_LIFT,
        color: SHEET_COLOR,
    });
    sheet.position.z = PLATE_TOP + 0.006;
    let loopTube: Mesh | null = null;
    const loopMaterial = matte(HIGHLIGHT);
    const codomainDots = THETAS.map(() => new Marker(0.055));
    codomainGroup.add(codomainPlate, codomainRim, sheet, ...codomainDots);
    codomainGroup.scale.setScalar(DISK_SCALE);
    scene.add(codomainGroup);

    // ------------------------------------------------------------ n = 1 card
    // f(0) = 0.93, f(1) = 0.10 — high above the diagonal at one end, well below
    // it at the other, and three wiggles in between. The previous map happened
    // to start and end at nearly the same height, which read as a coincidence
    // of THIS f rather than as the only two facts the argument uses.
    const ivtPlate = new GraphPlate(
        (x) => 0.8 + 0.14 * Math.sin(8 * x + 1.1) - 0.7 * x ** 3 - 0.05 * x,
    );
    ivtPlate.scale.setScalar(2.6);
    // lifted so the card's bottom edge clears the figure-mode ground at −0.75
    ivtPlate.position.set(-1.35, -0.3, 0);
    ivtPlate.visible = false;
    scene.add(ivtPlate);

    // Borsuk–Ulam when n = 1: a height function on the circle, and the one
    // antipodal pair that shares a value. Three humps of different heights and
    // an off-centre lobe, so no symmetry of the picture could be doing the work
    // — the level bar has to come from the theorem, not from the drawing.
    const circleGraph = new CircleGraph({
        h: (t) =>
            0.42 * Math.sin(t + 0.7) + 0.3 * Math.sin(2 * t - 0.4) + 0.16 * Math.sin(3 * t + 1.9),
        radius: 1.35,
        lift: 1.15,
        scale: 0.62,
    });
    // CircleGraph is built with the circle in its local xy-plane and heights
    // along local +z; this scene's world up is +y (the plates lie flat by
    // rotating −90° about x, same as here). Without this the graph would rise
    // toward the camera instead of upward, and "the bar is horizontal" would be
    // a statement about the wrong axis.
    circleGraph.rotation.x = -Math.PI / 2;
    circleGraph.visible = false;
    scene.add(circleGraph);

    // ---------------------------------------------------------- sampling
    /** bilinear fold-layer lookup at domain polar (r, θ) */
    function layerAt(rr: number, th: number): number {
        const { rings, sectors } = grid;
        const rf = Math.min(rings, Math.max(0, rr * rings));
        const k0 = Math.floor(rf);
        const k1 = Math.min(rings, k0 + 1);
        const fk = rf - k0;
        const tau = (((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
        const tf = tau * sectors;
        const j0 = Math.floor(tf) % sectors;
        const j1 = (j0 + 1) % sectors;
        const fj = tf - Math.floor(tf);
        const at = (k: number, j: number): number =>
            k === 0 ? layers[0]! : layers[1 + (k - 1) * sectors + j]!;
        const lo = (1 - fj) * at(k0, j0) + fj * at(k0, j1);
        const hi = (1 - fj) * at(k1, j0) + fj * at(k1, j1);
        return (1 - fk) * lo + fk * hi;
    }

    /** z (in the codomain group's local frame) of the sheet surface at the
     *  image of domain point (rr, θ), plus a clearance */
    function sheetZAt(rr: number, th: number, clearance: number): number {
        return PLATE_TOP + 0.006 + layerAt(rr, th) * SHEET_LIFT + clearance;
    }
    const sheetZ = (th: number, clearance: number): number =>
        sheetZAt(state.r, th, clearance);

    /** the image of the circle of radius rr, riding the folds of the sheet */
    function imageRing(rr: number, tube: number, clearance: number): TubeGeometry {
        const loop = mapLoop(map, rr).loop;
        const points: Vector3[] = [];
        for (let i = 0; i < LOOP_SAMPLES; i++) {
            const th = (2 * Math.PI * i) / LOOP_SAMPLES;
            loop(th, out);
            points.push(new Vector3(out.x, out.y, sheetZAt(rr, th, clearance)));
        }
        return new TubeGeometry(
            new CatmullRomCurve3(points, true),
            LOOP_SAMPLES,
            tube,
            8,
            true,
        );
    }

    const out = vec2();
    const embedded = vec3();

    function rebuildLoopTube(): void {
        const geometry = imageRing(state.r, HIGHLIGHT_TUBE, 0.024);
        if (loopTube) {
            loopTube.geometry.dispose();
            loopTube.geometry = geometry;
        } else {
            loopTube = new Mesh(geometry, loopMaterial);
            codomainGroup.add(loopTube);
        }
    }

    // the same ring family, carried through f. These do not move with r, so
    // they are built once — only the highlighted one is rebuilt per frame.
    for (const rho of RING_RADII) {
        codomainGroup.add(new Mesh(imageRing(rho, RING_TUBE, 0.012), ringMat));
    }

    function placeDots(): void {
        const loop = mapLoop(map, state.r).loop;
        for (let i = 0; i < THETAS.length; i++) {
            const th = THETAS[i]!;
            // domain: the sample point x(θ) on the circle S_r
            domainDots[i]!.visible = true;
            domainDots[i]!.position.set(
                state.r * Math.cos(th),
                state.r * Math.sin(th),
                PLATE_TOP + 0.045,
            );
            // codomain: its image f(x(θ)) riding the fold flap
            loop(th, out);
            codomainDots[i]!.visible = true;
            codomainDots[i]!.position.set(out.x, out.y, sheetZ(th, 0.05));
            // torus: the graph point (θ, f_r(θ)) on its fiber disk
            torus.embed(th, out.x, out.y, embedded);
            torusDots[i]!.visible = true;
            torusDots[i]!.position.set(embedded.x, embedded.y, embedded.z);
        }
    }

    function refresh(): void {
        refillGraphCurve(fCurve, mapLoop(map, state.r).loop);
        tube.refit();
        ring.geometry.dispose();
        ring.geometry = new TorusGeometry(state.r, HIGHLIGHT_TUBE, 10, 128);
        rebuildLoopTube();
        placeDots();
    }

    // ------------------------------------------------- camera + viewport
    const camera = new PerspectiveCamera(42, 1, 0.1, 100);
    const viewport = app.views.add({ name: "graphs", scene, camera, rect: { x: 0, y: 0, w: 1, h: 1 } });
    const controls = new OrbitControls(camera, app.renderer.domElement);
    controls.enableDamping = true;
    app.addAnimateCallback(() => controls.update());

    // ----------------------------------------------------------- layout
    const LAYOUTS: Record<
        GraphsLayout,
        {
            tilt: number;
            domain: [number, number, number];
            codomain: [number, number, number];
            torusPos: [number, number, number];
            camera: [number, number, number];
            target: [number, number, number];
        }
    > = {
        // plates lying on the (figure-mode) ground like Flatland drawings.
        // The pose has to hold all three actors: the plates reach x ≈ −8.6 (at
        // DISK_SCALE) and the torus x ≈ +4.5, so ~13 world units of width, with
        // very little height. That is a WIDE picture — the figure renders at
        // 1680×760 (manifest `size`), where fov 42 gives 1.7 units of width per
        // unit of camera distance, so ~8.6 out fills the frame.
        tabletop: {
            tilt: -Math.PI / 2,
            domain: [-7.0, -0.67, 0.95],
            codomain: [-3.4, -0.67, 0.35],
            torusPos: [1.9, 0, 0],
            camera: [-2.0, 4.45, 7.95],
            target: [-2.0, -0.25, 0],
        },
        // plates standing like framed pictures, face-on
        standing: {
            tilt: 0,
            domain: [-6.7, 0.55, 0],
            codomain: [-3.3, 0.55, 0],
            torusPos: [1.9, 0, 0],
            camera: [-1.4, 2.4, 10.9],
            target: [-1.6, 0.2, 0],
        },
    };

    function setLayout(layout: GraphsLayout): void {
        const l = LAYOUTS[layout];
        domainGroup.rotation.x = l.tilt;
        codomainGroup.rotation.x = l.tilt;
        domainGroup.position.set(...l.domain);
        codomainGroup.position.set(...l.codomain);
        torusGroup.position.set(...l.torusPos);
        camera.position.set(...l.camera);
        controls.target.set(...l.target);
        controls.update();
    }

    function setDotStyle(style: GraphsDotStyle): void {
        for (let i = 0; i < THETAS.length; i++) {
            const color = style === "accent" ? ACCENTS[i]! : theme.marker;
            domainDots[i]!.setColor(color);
            codomainDots[i]!.setColor(color);
            torusDots[i]!.setColor(color);
        }
    }

    setLayout("tabletop");
    setDotStyle("accent");

    const built: GraphsScene = {
        app,
        state,
        view: { scene, viewport, camera, controls },
        setR(next) {
            state.r = Math.min(1, Math.max(0.05, next));
            refresh();
        },
        setLayout,
        setDotStyle,
        setAnatomy(on) {
            circleGraph.visible = false;
            iTube.visible = on;
            tube.visible = !on;
            domainGroup.visible = !on;
            codomainGroup.visible = !on;
            for (const dot of torusDots) dot.visible = !on;
            // one fibre disk, not three: the figure is naming {θ} × D², not
            // showing that the graph meets every one of them (that is P2's job)
            fiberDisks.forEach((disk, i) => (disk.visible = !on || i === 0));
            torusGroup.visible = true;
        },
        setIVT(on) {
            circleGraph.visible = false;
            ivtPlate.visible = on;
            torusGroup.visible = !on;
            domainGroup.visible = !on;
            codomainGroup.visible = !on;
        },
        circleGraphAntipode: circleGraph.antipode,
        setCircleGraph(on) {
            circleGraph.visible = on;
            if (!on) return;
            ivtPlate.visible = false;
            torusGroup.visible = false;
            domainGroup.visible = false;
            codomainGroup.visible = false;
        },
        setSolo(actor) {
            ivtPlate.visible = false;
            iTube.visible = false;
            tube.visible = true;
            for (const dot of torusDots) dot.visible = true;
            for (const disk of fiberDisks) disk.visible = true;
            if (!actor) {
                domainGroup.visible = true;
                codomainGroup.visible = true;
                torusGroup.visible = true;
                setLayout("tabletop");
                return;
            }
            domainGroup.visible = actor === "domain";
            codomainGroup.visible = actor === "codomain";
            torusGroup.visible = actor === "torus";
            // face-on, and at the origin: the panel's camera is then a plain
            // straight-on shot down −z with nothing else in the world
            domainGroup.rotation.x = 0;
            codomainGroup.rotation.x = 0;
            domainGroup.position.set(0, 0, 0);
            codomainGroup.position.set(0, 0, 0);
            torusGroup.position.set(0, 0, 0);
            circleGraph.visible = false;
        },
        refresh,
    };

    app.views.resize(window.innerWidth, window.innerHeight);
    refresh();
    app.start();
    return built;
}

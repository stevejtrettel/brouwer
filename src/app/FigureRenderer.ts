/**
 * Figure mode — the path-traced paper pipeline (roadmap Phase 2).
 *
 * attachFigureMode() layers a "◉ figure" capability onto one 3D viewport:
 * entering stops the raster loop, promotes that viewport to the full canvas,
 * restyles the scene for print (glass shells, staging ground, soft area
 * light, gradient environment), and hands it to three-gpu-pathtracer.
 * Orbiting still works — the tracer restarts on camera moves. Exiting
 * restores every material, light, and viewport rect and resumes the app.
 *
 * A page may attach SEVERAL figures (torus view + sphere view): each is
 * addressed by its `name`. Reproducibility: "copy URL" captures the camera
 * pose, render settings, and the demo's own state (via the urlState hook)
 * into a shareable link; ?fig=<name> re-enters that figure on load, ?cam=
 * restores its pose, ?fscale=/?spp=/?bounces= seed the render settings. A
 * paper figure is a URL. configure()/predictSize() let render-entry chrome
 * (RenderControls) drive quality settings at runtime.
 */

import {
    BoxGeometry,
    Color,
    DoubleSide,
    InstancedMesh,
    Line,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshPhysicalMaterial,
    Group,
    type BufferGeometry,
    type Material,
    type Object3D,
    type PerspectiveCamera,
    type Scene,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GradientEquirectTexture, ShapedAreaLight, WebGLPathTracer } from "three-gpu-pathtracer";

import type { App } from "./App.ts";
import type { Viewport } from "./ViewManager.ts";
import { theme } from "../components/theme.ts";
import { setOrbitLock } from "../views/orbitGate.ts";

export interface FigureSettings {
    /** sample target (accumulation stops there) */
    spp?: number;
    /** hi-res pixel ratio while tracing */
    scale?: number;
    /** path-trace bounce depth */
    bounces?: number;
}

export interface FigureModeOptions {
    app: App;
    /** the 3D view to trace — takes over the whole canvas while active */
    view: {
        scene: Scene;
        camera: PerspectiveCamera;
        controls: OrbitControls;
        viewport: Viewport;
    };
    /** figure name: download stem AND the ?fig= key (default "figure") */
    name?: string;
    /** staging ground height (default −0.75 for the torus; sphere views,
     *  whose bottom is at −1, pass ≈ −1.05) */
    groundY?: number;
    /** diagram furniture to hide in figures (meridian disk, gizmos, …) */
    hide?: (Object3D | null)[];
    /** demo state to embed in copied figure URLs, e.g. () => ({ r: "0.6" }) */
    urlState?: () => Record<string, string>;
    /** the figure's own output aspect in CSS pixels. When given, entering
     *  figure mode pins the canvas to that shape (App.setFrame) so the traced
     *  image is framed exactly as the paper will crop it — not as the browser
     *  window happens to be shaped. */
    frameSize?: () => { width: number; height: number } | null;
}

export interface FigureMode {
    enter(): void;
    exit(): void;
    readonly active: boolean;
    readonly name: string;
    readonly settings: Required<FigureSettings>;
    /** adjust render settings; applies live (with a reset) when tracing */
    configure(settings: FigureSettings): void;
    /** the traced canvas size a given scale would produce */
    predictSize(scale?: number): { width: number; height: number };
}

function readNumber(raw: string | null, fallback: number): number {
    const value = Number(raw);
    return raw !== null && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function attachFigureMode(options: FigureModeOptions): FigureMode {
    const { app, view } = options;
    const name = options.name ?? "figure";
    const query = new URLSearchParams(window.location.search);
    const addressed = query.get("fig") === name; // this figure is the URL's target

    const settings: Required<FigureSettings> = {
        spp: readNumber(query.get("spp"), 768),
        scale: readNumber(query.get("fscale"), Math.min(window.devicePixelRatio || 1, 2)),
        bounces: readNumber(query.get("bounces"), 24),
    };

    // ?cam=px,py,pz,tx,ty,tz — restore a shared camera pose (only for the
    // figure the URL addresses: several figures may share the page)
    const cam = query.get("cam")?.split(",").map(Number);
    if (addressed && cam?.length === 6 && cam.every(Number.isFinite)) {
        view.camera.position.set(cam[0]!, cam[1]!, cam[2]!);
        view.controls.target.set(cam[3]!, cam[4]!, cam[5]!);
        view.controls.update();
    }

    const ui = buildFigureUI();
    let active = false;
    let pathTracer: WebGLPathTracer | null = null;

    // stashes for exit()
    const materialStash = new Map<Mesh, Material | Material[]>();
    const visibilityStash = new Map<Object3D, boolean>();
    const savedRect = { x: 0, y: 0, w: 1, h: 1 };
    let savedBackground: Scene["background"] = null;
    let savedEnvironment: Scene["environment"] = null;
    let savedPixelRatio = 1;
    let savedDamping = true;
    let savedEnabled = true;
    let savedMatte: typeof app.views.matte = null;
    let framed: { width: number; height: number } | null = null;

    // print staging: ground plane + soft overhead area light. No clearcoat
    // anywhere in figure scenes: clearcoat > 0 currently renders black under
    // three-gpu-pathtracer with this three.js version.
    const staging = new Group();
    const ground = new Mesh(
        new BoxGeometry(120, 0.1, 120), // big enough that its edge never frames
        new MeshPhysicalMaterial({ color: theme.paper.ground, roughness: 0.45 }),
    );
    ground.position.y = options.groundY ?? -0.75;
    const areaLight = new ShapedAreaLight(new Color(0xffffff), 4.0, 5.0, 5.0);
    areaLight.position.set(2.5, 7.5, 4);
    areaLight.lookAt(0, 0, 0);
    staging.add(ground, areaLight);

    const environment = new GradientEquirectTexture();
    environment.topColor.set(theme.paper.environmentTop);
    environment.bottomColor.set(theme.paper.environmentBottom);
    environment.update();

    const lastCamera = new Matrix4();

    // instanced meshes (TangentArrows) trace wrong — the tracer ignores
    // instance matrices, collapsing the field to one arrow. On entry each
    // is baked into a single merged static mesh; removed again on exit.
    const bakedInstances: Mesh[] = [];

    function bakeInstancedMesh(inst: InstancedMesh): void {
        const matrix = new Matrix4();
        const parts: BufferGeometry[] = [];
        for (let i = 0; i < inst.count; i++) {
            inst.getMatrixAt(i, matrix);
            if (matrix.getMaxScaleOnAxis() < 1e-4) continue; // hidden/zero arrow
            parts.push(inst.geometry.clone().applyMatrix4(matrix));
        }
        if (parts.length === 0) return;
        const merged = mergeGeometries(parts);
        for (const g of parts) g.dispose();
        merged.applyMatrix4(inst.matrix); // keep the instanced mesh's own transform
        const material = (inst.material as MeshPhysicalMaterial).clone();
        if (material.isMeshPhysicalMaterial) material.clearcoat = 0;
        const mesh = new Mesh(merged, material);
        bakedInstances.push(mesh);
        inst.parent?.add(mesh);
    }

    function restyleForPrint(): void {
        const instanced: InstancedMesh[] = [];
        view.scene.traverse((obj) => {
            if ((obj as InstancedMesh).isInstancedMesh) {
                instanced.push(obj as InstancedMesh);
                return;
            }
            if ((obj as { isLight?: boolean }).isLight) {
                // the raster rig is replaced by the area light + environment
                visibilityStash.set(obj, obj.visible);
                obj.visible = false;
                return;
            }
            if ((obj as Line).isLine) {
                // hairlines (graticule) don't path-trace meaningfully
                visibilityStash.set(obj, obj.visible);
                obj.visible = false;
                return;
            }
            const mesh = obj as Mesh;
            if (!mesh.isMesh) return;
            const material = mesh.material as Material;
            if ((material as MeshBasicMaterial).isMeshBasicMaterial && material.transparent) {
                // translucent diagram plates (meridian fiber) — hide unless kept
                visibilityStash.set(mesh, mesh.visible);
                mesh.visible = false;
                return;
            }
            if (mesh.userData.figureGlass === true) {
                // translucent shells (TorusShell, SphereSurface) become real
                // glass under the tracer; everything else keeps its material
                materialStash.set(mesh, mesh.material);
                mesh.material = new MeshPhysicalMaterial({
                    // per-mesh tint: the shell is near-clear, the core curve is
                    // smoked glass, and they have to sit inside one another
                    color: (mesh.userData.figureGlassColor as number) ?? theme.paper.glass.color,
                    roughness:
                        (mesh.userData.figureGlassRoughness as number) ??
                        theme.paper.glass.roughness,
                    metalness: 0,
                    transmission: 1,
                    // A figure whose subject FILLS the torus is seen through the
                    // shell at grazing angles everywhere, and at ior 1.48 Fresnel
                    // lays a white sheen over the whole thing — which is what
                    // drowned the Borsuk band. Such figures ask for a lower ior:
                    // still glass, still reads as a solid, but a film rather than
                    // a lens. See theme.paper.glass.iorThin.
                    ior: (mesh.userData.figureGlassIor as number) ?? theme.paper.glass.ior,
                    side: DoubleSide, // glass needs interior faces too
                });
                return;
            }
            const physical = material as MeshPhysicalMaterial;
            if (physical.isMeshPhysicalMaterial && mesh.userData.figureSolid === true) {
                // Swept surfaces (RibbonStrip: the Borsuk band, the Brouwer push
                // surface) need two things a figure won't give them otherwise.
                //
                // FLAT SHADING is the important one, and it is roadmap
                // constraint #2 in disguise. A strip that twists has adjacent
                // quads facing opposite ways, so `computeVertexNormals` averages
                // to normals that disagree with face orientation over most of the
                // band — and the tracer renders that disagreement BLACK. Shading
                // from geometric normals forces agreement; the facets it leaves
                // read as the paper's cross-hatching, which is a bonus.
                //
                // OPAQUE is the aesthetic one: alpha inside the glass shell and
                // against a bright environment washes the band out to nothing,
                // and the figure wants it to read as a surface anyway.
                //
                // The EMISSIVE FLOOR earns its keep on the Brouwer push surface,
                // which is radial — near-vertical inside the torus — so the
                // overhead area light only grazes it and it crushes to black on
                // its own merits, no bug involved. A diagram surface has to stay
                // legible whichever way it happens to face.
                materialStash.set(mesh, mesh.material);
                const clone = physical.clone();
                clone.clearcoat = 0;
                clone.flatShading = true;
                clone.transparent = false;
                clone.opacity = 1;
                clone.depthWrite = true;
                clone.roughness = 0.5;
                // An open sheet must shade both faces — UNLESS it is painting
                // its two faces separately (RibbonStrip's two-tone staging, a
                // FrontSide mesh plus a BackSide twin). Forcing DoubleSide
                // there would have each mesh cover both faces and the colour
                // flip at every half-twist, the whole point, would vanish.
                clone.side = mesh.userData.figureKeepSide === true ? physical.side : DoubleSide;
                clone.emissive.copy(clone.color);
                // 0.18 is tuned for a surface starved of light (the Brouwer
                // push curtain, near-vertical inside the glass). A surface that
                // IS well lit — the Borsuk band, once the shell is out of its
                // way — only loses colour to it, and a two-tone band loses the
                // contrast between its faces, so those opt down.
                clone.emissiveIntensity = (mesh.userData.figureEmissive as number) ?? 0.18;
                mesh.material = clone;
                return;
            }
            if (physical.isMeshPhysicalMaterial && physical.clearcoat > 0) {
                // clearcoat path-traces to black (lib/three version mismatch);
                // swap in a clearcoat-free clone, restored on exit. ALPHA IS
                // LEFT ALONE: the tracer resolves `opacity` stochastically and
                // translucent tubes/plates/ribbons come out right. (An earlier
                // version converted flagged surfaces to transmissive frosted
                // glass instead, on the theory that alpha was ignored; a thin
                // double-sided sheet with transmission and no thickness traced
                // near-BLACK, which swallowed the Borsuk ribbon and the Brouwer
                // push surface — the two figures that treatment existed for.)
                materialStash.set(mesh, mesh.material);
                const clone = physical.clone();
                clone.clearcoat = 0;
                mesh.material = clone;
            }
        });
        for (const inst of instanced) {
            visibilityStash.set(inst, inst.visible);
            if (inst.visible) bakeInstancedMesh(inst);
            inst.visible = false;
        }
        for (const obj of options.hide ?? []) {
            if (!obj) continue;
            visibilityStash.set(obj, obj.visible);
            obj.visible = false;
        }
    }

    function restoreScene(): void {
        for (const [mesh, material] of materialStash) {
            ((mesh.material as Material).dispose as () => void)();
            mesh.material = material;
        }
        materialStash.clear();
        for (const mesh of bakedInstances) {
            mesh.parent?.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as Material).dispose();
        }
        bakedInstances.length = 0;
        for (const [obj, visible] of visibilityStash) obj.visible = visible;
        visibilityStash.clear();
    }

    function enter(): void {
        if (active) return;
        active = true;
        app.stop();

        // promote this viewport to the full canvas (also keeps orbit gating
        // correct, since viewportAt now maps everywhere to this view)
        Object.assign(savedRect, view.viewport.rect);
        Object.assign(view.viewport.rect, { x: 0, y: 0, w: 1, h: 1 });
        savedMatte = app.views.matte;
        app.views.matte = null; // the figure owns every pixel now
        // shape the canvas to the figure BEFORE the pixel ratio: setFrame
        // resizes, and resizing resets the ratio to the device default
        framed = options.frameSize?.() ?? null;
        if (framed) app.setFrame(framed);
        savedPixelRatio = app.renderer.getPixelRatio();
        app.renderer.setPixelRatio(settings.scale);
        app.views.resize(framed?.width ?? window.innerWidth, framed?.height ?? window.innerHeight);

        savedDamping = view.controls.enableDamping;
        view.controls.enableDamping = false;
        // CAMERA LOCKED while tracing. Every camera move throws away the
        // accumulated samples and starts the image over, so a stray drag on a
        // half-finished 768-sample render costs minutes. The pose is chosen in
        // the workbench BEFORE rendering; the bar's ⊙ button unlocks it for the
        // times you do want to look around.
        //
        // BOTH of these are needed: the flag stops the gated views (whose gate
        // rewrites `enabled` on every pointer event, so assigning it here alone
        // does nothing), and the assignment covers views with no gate at all.
        savedEnabled = view.controls.enabled;
        setOrbitLock(true);
        view.controls.enabled = false;
        ui.setOrbit(false);

        restyleForPrint();
        savedBackground = view.scene.background;
        savedEnvironment = view.scene.environment;
        view.scene.background = environment;
        view.scene.environment = environment;
        view.scene.add(staging);

        pathTracer = new WebGLPathTracer(app.renderer);
        pathTracer.bounces = settings.bounces;
        pathTracer.tiles.set(3, 3);
        pathTracer.setScene(view.scene, view.camera);
        lastCamera.copy(view.camera.matrixWorld);
        // debug handle for tuning figure renders from the console
        (window as unknown as Record<string, unknown>).__pathTracer = pathTracer;

        ui.show();
        app.renderer.setAnimationLoop(() => {
            if (!pathTracer) return;
            if (!lastCamera.equals(view.camera.matrixWorld)) {
                lastCamera.copy(view.camera.matrixWorld);
                pathTracer.updateCamera();
            }
            if (pathTracer.samples < settings.spp) pathTracer.renderSample();
            ui.setProgress(Math.min(pathTracer.samples, settings.spp), settings.spp);
        });
    }

    function exit(): void {
        if (!active) return;
        active = false;
        app.stop();
        pathTracer?.dispose();
        pathTracer = null;

        view.scene.remove(staging);
        view.scene.background = savedBackground;
        view.scene.environment = savedEnvironment;
        restoreScene();

        Object.assign(view.viewport.rect, savedRect);
        app.views.matte = savedMatte;
        app.renderer.setPixelRatio(savedPixelRatio);
        if (framed) {
            app.setFrame(null); // resizes and restores the device pixel ratio
            framed = null;
            app.renderer.setPixelRatio(savedPixelRatio);
        }
        app.views.resize(window.innerWidth, window.innerHeight);
        view.controls.enableDamping = savedDamping;
        setOrbitLock(false);
        view.controls.enabled = savedEnabled;

        ui.hide();
        app.start();
    }

    function savePNG(): void {
        const link = document.createElement("a");
        link.download = `${name}-figure.png`;
        link.href = app.renderer.domElement.toDataURL("image/png");
        link.click();
    }

    function copyURL(): void {
        const params = new URLSearchParams(options.urlState?.() ?? {});
        const p = view.camera.position;
        const t = view.controls.target;
        const fmt = (v: number): string => v.toFixed(3);
        params.set("cam", [p.x, p.y, p.z, t.x, t.y, t.z].map(fmt).join(","));
        params.set("fig", name);
        params.set("spp", String(settings.spp));
        params.set("fscale", String(settings.scale));
        params.set("bounces", String(settings.bounces));
        const url = `${window.location.origin}${window.location.pathname}?${params}`;
        window.history.replaceState(null, "", url);
        void navigator.clipboard?.writeText(url);
        ui.flash("URL copied");
    }

    ui.onOrbit((on) => {
        setOrbitLock(!on);
        view.controls.enabled = on;
    });
    ui.onSave(savePNG);
    ui.onCopy(copyURL);
    ui.onExit(exit);

    // shared figure links re-enter automatically once the demo has built
    if (addressed) requestAnimationFrame(() => enter());

    return {
        enter,
        exit,
        name,
        settings,
        get active() {
            return active;
        },
        configure(next) {
            if (next.spp !== undefined) settings.spp = next.spp;
            if (next.bounces !== undefined) settings.bounces = next.bounces;
            if (next.scale !== undefined) settings.scale = next.scale;
            if (active && pathTracer) {
                pathTracer.bounces = settings.bounces;
                if (next.scale !== undefined) {
                    app.renderer.setPixelRatio(settings.scale);
                    app.views.resize(window.innerWidth, window.innerHeight);
                    pathTracer.setScene(view.scene, view.camera);
                }
                pathTracer.reset();
            }
        },
        predictSize(scale = settings.scale) {
            return {
                width: Math.round(window.innerWidth * scale),
                height: Math.round(window.innerHeight * scale),
            };
        },
    };
}

// ---------------------------------------------------------------- overlay dom

interface FigureUI {
    show(): void;
    hide(): void;
    setProgress(samples: number, target: number): void;
    flash(text: string): void;
    setOrbit(on: boolean): void;
    onOrbit(fn: (on: boolean) => void): void;
    onSave(fn: () => void): void;
    onCopy(fn: () => void): void;
    onExit(fn: () => void): void;
}

function buildFigureUI(): FigureUI {
    const style = document.createElement("style");
    style.textContent = `
        .figure-bar {
            position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
            z-index: 40; display: none; align-items: center; gap: 14px;
            font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
            font-size: 13px; font-weight: 600; color: #33313b;
            background: rgba(255, 255, 255, 0.92); border: 1px solid #d8d3c8;
            border-radius: 999px; padding: 9px 18px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12); user-select: none;
        }
        .figure-bar.active { display: flex; }
        .figure-bar .prog { color: #6b7a99; min-width: 150px; }
        .figure-bar button {
            font: inherit; color: #33313b; background: none; border: none;
            cursor: pointer; padding: 0;
        }
        .figure-bar button:hover { color: #2f6de1; }
        .figure-bar button.on { color: #e4572e; }
    `;
    document.head.appendChild(style);

    const bar = document.createElement("div");
    bar.className = "figure-bar";
    const prog = document.createElement("span");
    prog.className = "prog";
    const orbit = document.createElement("button");
    const save = document.createElement("button");
    save.textContent = "⤓ save PNG";
    const copy = document.createElement("button");
    copy.textContent = "⧉ copy URL";
    const exit = document.createElement("button");
    exit.textContent = "✕ exit";
    bar.append(prog, orbit, save, copy, exit);
    document.body.appendChild(bar);

    let orbiting = false;
    const paintOrbit = (): void => {
        orbit.textContent = orbiting ? "⊙ orbit on" : "⊙ locked";
        orbit.title = orbiting
            ? "the camera moves — every move restarts the render"
            : "camera locked so a stray drag cannot restart the render";
        orbit.classList.toggle("on", orbiting);
    };
    paintOrbit();

    let flashTimer = 0;
    let progressText = "";

    return {
        show: () => bar.classList.add("active"),
        hide: () => bar.classList.remove("active"),
        setProgress(samples, target) {
            progressText =
                samples >= target
                    ? `path traced · ${target} samples ✓`
                    : `path tracing… ${Math.floor(samples)} / ${target}`;
            if (!flashTimer) prog.textContent = progressText;
        },
        flash(text) {
            prog.textContent = text;
            window.clearTimeout(flashTimer);
            flashTimer = window.setTimeout(() => {
                flashTimer = 0;
                prog.textContent = progressText;
            }, 1200);
        },
        setOrbit(on) {
            orbiting = on;
            paintOrbit();
        },
        onOrbit(fn) {
            orbit.addEventListener("click", () => {
                orbiting = !orbiting;
                paintOrbit();
                fn(orbiting);
            });
        },
        onSave: (fn) => save.addEventListener("click", fn),
        onCopy: (fn) => copy.addEventListener("click", fn),
        onExit: (fn) => exit.addEventListener("click", fn),
    };
}

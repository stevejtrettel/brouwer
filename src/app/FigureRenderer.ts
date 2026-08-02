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
    Line,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshPhysicalMaterial,
    Group,
    type Material,
    type Object3D,
    type PerspectiveCamera,
    type Scene,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GradientEquirectTexture, ShapedAreaLight, WebGLPathTracer } from "three-gpu-pathtracer";

import type { App } from "./App.ts";
import type { Viewport } from "./ViewManager.ts";
import { theme } from "../components/theme.ts";

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

    // print staging: ground plane + soft overhead area light. No clearcoat
    // anywhere in figure scenes: clearcoat > 0 currently renders black under
    // three-gpu-pathtracer with this three.js version.
    const staging = new Group();
    const ground = new Mesh(
        new BoxGeometry(30, 0.1, 30),
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

    function restyleForPrint(): void {
        view.scene.traverse((obj) => {
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
                    color: theme.paper.glass.color,
                    roughness: theme.paper.glass.roughness,
                    metalness: 0,
                    transmission: 1,
                    ior: theme.paper.glass.ior,
                });
                return;
            }
            const physical = material as MeshPhysicalMaterial;
            if (physical.isMeshPhysicalMaterial && physical.clearcoat > 0) {
                // clearcoat path-traces to black (lib/three version mismatch);
                // swap in a clearcoat-free clone, restored on exit
                materialStash.set(mesh, mesh.material);
                const clone = physical.clone();
                clone.clearcoat = 0;
                mesh.material = clone;
            }
        });
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
        savedPixelRatio = app.renderer.getPixelRatio();
        app.renderer.setPixelRatio(settings.scale);
        app.views.resize(window.innerWidth, window.innerHeight);

        savedDamping = view.controls.enableDamping;
        view.controls.enableDamping = false;
        view.controls.enabled = true;

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
        app.renderer.setPixelRatio(savedPixelRatio);
        app.views.resize(window.innerWidth, window.innerHeight);
        view.controls.enableDamping = savedDamping;

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
    `;
    document.head.appendChild(style);

    const bar = document.createElement("div");
    bar.className = "figure-bar";
    const prog = document.createElement("span");
    prog.className = "prog";
    const save = document.createElement("button");
    save.textContent = "⤓ save PNG";
    const copy = document.createElement("button");
    copy.textContent = "⧉ copy URL";
    const exit = document.createElement("button");
    exit.textContent = "✕ exit";
    bar.append(prog, save, copy, exit);
    document.body.appendChild(bar);

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
        onSave: (fn) => save.addEventListener("click", fn),
        onCopy: (fn) => copy.addEventListener("click", fn),
        onExit: (fn) => exit.addEventListener("click", fn),
    };
}

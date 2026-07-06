/**
 * ProofDemo — the shared scaffold each demo instantiates around a
 * ProofModel. It assembles:
 *
 *   - a torus viewport (shell, core, one GraphTube per loop, meridian disk,
 *     event markers) with orbit controls,
 *   - a slice-inspector viewport (SliceDisk, orthographic),
 *   - lil-gui controls: the proof parameter, the slice angle θ, live
 *     meters, PNG export, plus a hook for map-specific parameters,
 *
 * and owns the refresh cycle: refill curves → refit tubes → detect events →
 * update meters, markers, and the slice. All hot-path work is
 * allocation-free (refillGraphCurve + GraphTube.refit).
 */

import { Color, OrthographicCamera, PerspectiveCamera, Scene, Vector2 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";

import { App } from "./App.ts";
import { SolidTorus } from "../math/torus.ts";
import type { GraphCurve } from "../math/types.ts";
import { vec3 } from "../math/types.ts";
import { createGraphCurve, refillGraphCurve } from "../math/graphCurve.ts";
import type { ProofModel, ProofEvent } from "../math/proofs/types.ts";

import { theme, addCartoonLights } from "../components/theme.ts";
import { TorusShell } from "../components/TorusShell.ts";
import { CoreCurve } from "../components/CoreCurve.ts";
import { GraphTube } from "../components/GraphTube.ts";
import { MeridianDisk } from "../components/MeridianDisk.ts";
import { SliceDisk } from "../components/SliceDisk.ts";
import { Marker } from "../components/Marker.ts";

const MAX_MARKERS = 8;

export interface ProofDemoOptions {
    model: ProofModel;
    /** samples per graph curve */
    N?: number;
    /** detector threshold ε */
    epsilon?: number;
    /** add map/field-specific GUI controls; call demo.refresh() on change */
    controls?: (gui: GUI, demo: ProofDemo) => void;
}

export class ProofDemo {
    readonly app: App;
    readonly model: ProofModel;
    readonly torus: SolidTorus;
    readonly gui: GUI;

    readonly curves: GraphCurve[] = [];
    readonly tubes: GraphTube[] = [];
    readonly meridian: MeridianDisk;
    private slice: SliceDisk;
    private markers: Marker[] = [];
    private caption: HTMLElement;
    private statusLine: HTMLElement;

    readonly state: { s: number; theta: number };
    private readonly N: number;
    private readonly epsilon: number;
    private meterReadout: Record<string, string> = {};
    private paramCtrl!: ReturnType<GUI["add"]>;
    private thetaCtrl!: ReturnType<GUI["add"]>;

    constructor(options: ProofDemoOptions) {
        this.model = options.model;
        this.N = options.N ?? 512;
        this.epsilon = options.epsilon ?? 0.03;

        // shareable presets: ?s=0.95 (or the param's own name, ?r= / ?φ=)
        // and ?theta=1.2 override the defaults
        const query = new URLSearchParams(window.location.search);
        const sRaw = query.get(this.model.paramName) ?? query.get("s");
        const thetaRaw = query.get("theta");
        const [lo0, hi0] = this.model.paramRange;
        const s0 = sRaw !== null ? Number(sRaw) : NaN;
        this.state = {
            s: Number.isFinite(s0) ? Math.min(hi0, Math.max(lo0, s0)) : this.model.paramDefault,
            theta: Number.isFinite(Number(thetaRaw)) && thetaRaw !== null ? Number(thetaRaw) : 0,
        };

        this.app = new App();
        this.torus = new SolidTorus();

        // ---- torus viewport ----
        const torusScene = new Scene();
        addCartoonLights(torusScene);
        this.app.applyEnvironment(torusScene);

        torusScene.add(new TorusShell(this.torus));
        torusScene.add(new CoreCurve(this.torus));
        this.meridian = new MeridianDisk(this.torus);
        torusScene.add(this.meridian);

        for (const labeled of this.model.loopsAt(this.state.s)) {
            const curve = createGraphCurve(this.N, labeled.role, labeled.label);
            const tube = new GraphTube({ curve, torus: this.torus });
            this.curves.push(curve);
            this.tubes.push(tube);
            torusScene.add(tube);
        }

        for (let i = 0; i < MAX_MARKERS; i++) {
            const marker = new Marker();
            this.markers.push(marker);
            torusScene.add(marker);
        }
        this.app.addAnimateCallback((time) => {
            for (const m of this.markers) m.animate(time);
        });

        const torusCamera = new PerspectiveCamera(45, 1, 0.1, 100);
        torusCamera.position.set(0, 4.6, 7.4);
        torusCamera.lookAt(0, 0, 0);
        this.app.views.add({
            name: "torus",
            scene: torusScene,
            camera: torusCamera,
            rect: { x: 0, y: 0, w: 0.72, h: 1 },
        });

        const controls = new OrbitControls(torusCamera, this.app.renderer.domElement);
        controls.enableDamping = true;
        this.app.addAnimateCallback(() => controls.update());
        // orbit only when the pointer is over the torus viewport
        this.app.renderer.domElement.addEventListener("pointermove", (e) => {
            const vp = this.app.views.viewportAt(
                e.clientX,
                e.clientY,
                window.innerWidth,
                window.innerHeight,
            );
            controls.enabled = vp?.name === "torus";
        });

        // ---- slice-inspector viewport ----
        const sliceScene = new Scene();
        sliceScene.background = new Color(theme.sliceBackground);
        this.slice = new SliceDisk();
        sliceScene.add(this.slice);
        const sliceCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        sliceCamera.position.z = 5;
        this.app.views.add({
            name: "slice",
            scene: sliceScene,
            camera: sliceCamera,
            rect: { x: 0.72, y: 0, w: 0.28, h: 1 },
            orthoHalfHeight: 1.2,
        });
        this.app.views.resize(
            this.app.renderer.getDrawingBufferSize(sizeScratch).x,
            this.app.renderer.getDrawingBufferSize(sizeScratch).y,
        );

        // ---- overlay & controls ----
        const overlay = buildOverlay(this.model.title);
        this.statusLine = overlay.status;
        this.caption = overlay.caption;

        this.gui = new GUI({ title: "controls" });
        const [lo, hi] = this.model.paramRange;
        this.paramCtrl = this.gui
            .add(this.state, "s", lo, hi, (hi - lo) / 500)
            .name(this.model.paramName)
            .onChange(() => this.refresh());
        this.thetaCtrl = this.gui
            .add(this.state, "theta", 0, 2 * Math.PI, 0.01)
            .name("slice θ")
            .onChange(() => this.updateSliceView());

        options.controls?.(this.gui, this);

        // meters appear once we know their names
        this.refresh();
        const meterFolder = this.gui.addFolder("meters");
        for (const key of Object.keys(this.meterReadout)) {
            meterFolder.add(this.meterReadout, key).listen().disable();
        }

        this.gui.add({ png: () => this.app.exportPNG(this.model.id) }, "png").name("save PNG");

        this.app.start();
    }

    /** Jump the demo to a specific state (e.g. a finder result), keeping the
     *  GUI sliders in sync. Values are clamped to their ranges. */
    setState(next: { s?: number; theta?: number }): void {
        const [lo, hi] = this.model.paramRange;
        if (next.s !== undefined) this.state.s = Math.min(hi, Math.max(lo, next.s));
        if (next.theta !== undefined) {
            this.state.theta = ((next.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        }
        this.paramCtrl.updateDisplay();
        this.thetaCtrl.updateDisplay();
        this.refresh();
    }

    /** Write a line into the overlay caption (overrides the event text
     *  until the next refresh). */
    announce(text: string): void {
        this.caption.textContent = text;
    }

    /** Recompute everything downstream of the proof parameter or the map. */
    refresh(): void {
        const loops = this.model.loopsAt(this.state.s);
        for (let k = 0; k < this.curves.length; k++) {
            const curve = this.curves[k]!;
            const labeled = loops[k]!;
            curve.label = labeled.label;
            refillGraphCurve(curve, labeled.loop);
            this.tubes[k]!.refit();
        }

        const events = this.model.detect(this.state.s, this.curves, this.epsilon);
        this.placeMarkers(events);
        this.caption.textContent = describeEvents(events);

        const status = this.model.status?.(this.curves) ?? "";
        this.statusLine.textContent = status;
        this.statusLine.classList.toggle("linked", /linked · Lk = -?[1-9]/.test(status));
        this.statusLine.classList.toggle("touching", status.includes("touch"));

        for (const meter of this.model.meters(this.curves)) {
            this.meterReadout[meter.name] = meter.display ?? meter.value.toFixed(3);
        }

        this.updateSliceView();
    }

    /** Slice-only update (θ slider) — no curve recomputation. */
    private updateSliceView(): void {
        const index = Math.round((this.state.theta / (2 * Math.PI)) * this.N) % this.N;
        this.meridian.theta = this.state.theta;
        this.slice.updateSlice(this.curves, index);

        // surface an event dot if one lives near this θ
        const events = this.model.detect(this.state.s, this.curves, this.epsilon);
        const near = events.find(
            (e) => angularIndexDistance(e.index, index, this.N) < this.N / 64,
        );
        this.slice.showEvent(near ? near.disk : null);
    }

    private placeMarkers(events: ProofEvent[]): void {
        for (let i = 0; i < MAX_MARKERS; i++) {
            const marker = this.markers[i]!;
            const event = events[i];
            if (!event) {
                marker.visible = false;
                continue;
            }
            marker.visible = true;
            this.torus.embed(event.theta, event.disk.x, event.disk.y, markerPos);
            marker.position.set(markerPos.x, markerPos.y, markerPos.z);
        }
    }
}

function angularIndexDistance(a: number, b: number, N: number): number {
    const d = Math.abs(a - b) % N;
    return Math.min(d, N - d);
}

function describeEvents(events: ProofEvent[]): string {
    if (events.length === 0) return "";
    const names: Record<ProofEvent["kind"], string> = {
        "fixed-point": "fixed point",
        "antipodal-pair": "antipodal pair",
        "core-crossing": "zero of the field",
    };
    return events
        .map((e) => `${names[e.kind]} @ θ ≈ ${e.theta.toFixed(2)}`)
        .join("   ·   ");
}

function buildOverlay(title: string): { status: HTMLElement; caption: HTMLElement } {
    const style = document.createElement("style");
    style.textContent = `
        html, body { margin: 0; padding: 0; overflow: hidden; }
        .proof-overlay {
            position: fixed; left: 16px; bottom: 14px; z-index: 10;
            font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
            color: #33313b; pointer-events: none; user-select: none;
        }
        .proof-overlay h1 { font-size: 18px; margin: 0 0 2px 0; font-weight: 700; }
        .proof-overlay .status { font-size: 15px; font-weight: 700; color: #6b7a99; min-height: 19px; }
        .proof-overlay .status.linked { color: #2f6de1; }
        .proof-overlay .status.touching { color: #b8860b; }
        .proof-overlay .caption { font-size: 14px; color: #b8860b; min-height: 18px; }
        .lil-gui.autoPlace { right: auto; left: 8px; top: 8px; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.className = "proof-overlay";
    const h1 = document.createElement("h1");
    h1.textContent = title;
    const status = document.createElement("div");
    status.className = "status";
    const caption = document.createElement("div");
    caption.className = "caption";
    overlay.append(h1, status, caption);
    document.body.appendChild(overlay);
    return { status, caption };
}

const markerPos = vec3();
const sizeScratch = new Vector2();

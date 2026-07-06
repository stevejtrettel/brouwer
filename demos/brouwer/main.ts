/**
 * Brouwer fixed point theorem — Phase 1 demo, three representations of one
 * map:
 *
 *   - domain panel (top right): the textured disk D², the circle S_r, and
 *     every fixed point of f marked (gold nodes, violet saddles);
 *   - image panel (middle right): the CRUMPLED DOMAIN — the same textured
 *     disk pushed forward through f, with self-overlap compositing darker
 *     and folded-over (orientation-reversed) regions tinted; the blue curve
 *     is f(S_r), the very curve whose graph is the blue tube;
 *   - torus view + fiber slice: the graph curves, linking status, and the
 *     forced collision.
 */

import { OrthographicCamera, Scene, Color } from "three";
import { ProofDemo } from "../../src/app/ProofDemo.ts";
import { brouwerModel, findBrouwerFixedPoint } from "../../src/math/proofs/brouwer.ts";
import { swirlMap, creaseFold, composeDiskMaps, identityMap } from "../../src/math/maps/diskMaps.ts";
import { theme, roleColor } from "../../src/components/theme.ts";
import { makeDiskTexture } from "../../src/components/diskTexture.ts";
import { PushforwardDisk } from "../../src/components/PushforwardDisk.ts";
import { makeDiskBackdrop, RadiusRing, DiskCurve2D, DiskDot } from "../../src/components/panel2d.ts";

// f = fold ∘ swirl: the swirl distorts, the crease genuinely crumples —
// the folded flap self-overlaps in the image (tinted + darker there).
// Set the crease position t to 1 to switch the fold off.
const swirl = swirlMap(0.75, 2.5, 0.25, 0.0);
const fold = creaseFold(0.25, 1.9);
const f = composeDiskMaps(fold, swirl);

const demo = new ProofDemo({
    model: brouwerModel(f),
    layout: {
        torus: { x: 0, y: 0, w: 0.74, h: 1 },
        slice: { x: 0.74, y: 0, w: 0.26, h: 1 / 3 },
    },
    controls: (gui, d) => {
        const folder = gui.addFolder("map f = fold ∘ swirl");
        folder.add(swirl.params, "a", 0, 1, 0.01).name("contraction a").onChange(() => d.refresh());
        folder.add(swirl.params, "tau", -6, 6, 0.05).name("twist τ").onChange(() => d.refresh());
        folder.add(swirl.params, "cx", -0.9, 0.9, 0.01).name("shift x").onChange(() => d.refresh());
        folder.add(swirl.params, "cy", -0.9, 0.9, 0.01).name("shift y").onChange(() => d.refresh());
        folder.add(fold.params, "t", -0.2, 1, 0.01).name("crease position t").onChange(() => d.refresh());
        folder.add(fold.params, "angle", 0, 2 * Math.PI, 0.01).name("crease angle").onChange(() => d.refresh());

        gui.add(
            {
                find: () => {
                    const fp = findBrouwerFixedPoint(f);
                    if (!fp.found) {
                        d.announce("finder did not converge — degenerate map?");
                        return;
                    }
                    d.setState({ s: fp.r, theta: fp.theta });
                    d.announce(
                        `fixed point x* = (${fp.x.x.toFixed(4)}, ${fp.x.y.toFixed(4)})` +
                            `  ·  |f(x*) − x*| = ${fp.residual.toExponential(1)}`,
                    );
                },
            },
            "find",
        ).name("⊚ find fixed point");
    },
});

// ---- domain + image panels (right column, above the slice) ----

const texture = makeDiskTexture();
const MAX_DOTS = 12;

function makePanel(name: string, y: number): Scene {
    const scene = new Scene();
    scene.background = new Color(theme.sliceBackground);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5;
    demo.app.views.add({
        name,
        scene,
        camera,
        rect: { x: 0.74, y, w: 0.26, h: 1 / 3 },
        orthoHalfHeight: 1.15,
    });
    return scene;
}

// domain: the flat textured disk (pushforward through the identity)
const domainScene = makePanel("domain", 2 / 3);
const domainDisk = new PushforwardDisk({ texture });
domainDisk.refit(identityMap());
domainScene.add(domainDisk);
const ring = new RadiusRing(roleColor("identity"));
ring.position.z = 0.01;
domainScene.add(ring);
const domainDots: DiskDot[] = [];
for (let i = 0; i < MAX_DOTS; i++) {
    const dot = new DiskDot();
    dot.position.z = 0.02;
    domainDots.push(dot);
    domainScene.add(dot);
}

// image: the crumpled domain f(D²) inside the range disk
const imageScene = makePanel("image", 1 / 3);
imageScene.add(makeDiskBackdrop());
const crumple = new PushforwardDisk({ texture, opacity: 0.85 });
crumple.position.z = 0.01;
imageScene.add(crumple);
const imageCurve = new DiskCurve2D(demo.curves[1]!, roleColor("map"));
imageCurve.position.z = 0.03;
imageScene.add(imageCurve);

demo.addRefreshHook(() => {
    crumple.refit(f);
    ring.setRadius(demo.state.s);
    imageCurve.refit(demo.curves[1]!);
    const landmarks = demo.model.landmarks?.() ?? [];
    for (let i = 0; i < MAX_DOTS; i++) {
        const dot = domainDots[i]!;
        const landmark = landmarks[i];
        dot.visible = Boolean(landmark);
        if (landmark) {
            dot.setColor(landmark.index === -1 ? 0x8d4fd3 : theme.marker);
            dot.position.x = landmark.disk.x;
            dot.position.y = landmark.disk.y;
        }
    }
});

// panel labels
const labelStyle = document.createElement("style");
labelStyle.textContent = `
    .panel-label {
        position: fixed; left: calc(74% + 10px); z-index: 5;
        font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
        font-size: 12px; font-weight: 600; color: #6b7a99;
        pointer-events: none; user-select: none;
    }
`;
document.head.appendChild(labelStyle);
for (const [text, top] of [
    ["domain D²", "6px"],
    ["image f(D²) — the crumpled domain", "calc(33.33% + 6px)"],
    ["fiber slice {θ} × D²", "calc(66.66% + 6px)"],
] as const) {
    const label = document.createElement("div");
    label.className = "panel-label";
    label.style.top = top;
    label.textContent = text;
    document.body.appendChild(label);
}

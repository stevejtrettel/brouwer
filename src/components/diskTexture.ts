/**
 * diskTexture — a canvas-drawn texture for reading disk maps.
 *
 * Design goal: every point of the domain should be identifiable in the
 * crumpled image. Hue varies with angle (a pastel color wheel), lightness
 * rises toward the center, and a polar grid (spokes + rings) is drawn on
 * top so distortion is legible even within one hue. No image assets.
 *
 * The texture is sampled with uv = (p + 1)/2, so the disk inscribes the
 * canvas square; the corners are never sampled.
 */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

export interface DiskTextureOptions {
    size?: number;
    spokes?: number;
    rings?: number;
}

export function makeDiskTexture(options: DiskTextureOptions = {}): CanvasTexture {
    const size = options.size ?? 1024;
    const spokes = options.spokes ?? 24;
    const rings = options.rings ?? 5;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const cx = size / 2;
    const R = size / 2;

    // pastel hue wheel: thin wedges around the disk
    const WEDGES = 240;
    for (let i = 0; i < WEDGES; i++) {
        const a0 = (2 * Math.PI * i) / WEDGES;
        const a1 = (2 * Math.PI * (i + 1.5)) / WEDGES; // slight overlap kills seams
        ctx.beginPath();
        ctx.moveTo(cx, cx);
        ctx.arc(cx, cx, R, a0, a1);
        ctx.closePath();
        ctx.fillStyle = `hsl(${(360 * i) / WEDGES}, 62%, 72%)`;
        ctx.fill();
    }
    // lighten toward the center so radius is readable too
    const radial = ctx.createRadialGradient(cx, cx, 0, cx, cx, R);
    radial.addColorStop(0, "rgba(255,255,255,0.75)");
    radial.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, size, size);

    // polar grid
    ctx.strokeStyle = "rgba(51,49,59,0.4)";
    ctx.lineWidth = size / 400;
    for (let j = 0; j < spokes; j++) {
        const angle = (2 * Math.PI * j) / spokes;
        ctx.beginPath();
        ctx.moveTo(cx, cx);
        ctx.lineTo(cx + R * Math.cos(angle), cx + R * Math.sin(angle));
        ctx.stroke();
    }
    for (let k = 1; k <= rings; k++) {
        ctx.beginPath();
        ctx.arc(cx, cx, (R * k) / rings, 0, 2 * Math.PI);
        ctx.stroke();
    }
    // boundary
    ctx.strokeStyle = "rgba(51,49,59,0.9)";
    ctx.lineWidth = size / 160;
    ctx.beginPath();
    ctx.arc(cx, cx, R - ctx.lineWidth / 2, 0, 2 * Math.PI);
    ctx.stroke();

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

/**
 * Equirect texture for reading sphere maps (u = θ/2π, v = 1 − φ/π): the
 * same pastel hue wheel in θ, a lat-long graticule, and a hemisphere
 * lightness split (north bright, south dusk) so the two layers of a
 * flattened sphere stay tellable apart even before the fold tint.
 * wrapS repeats: seam-corrected triangle UVs may run past u = 1.
 */
export function makeSphereTexture(options: { size?: number } = {}): CanvasTexture {
    const height = options.size ?? 1024;
    const width = 2 * height;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // hue wheel in θ: vertical pastel strips
    const STRIPS = 240;
    for (let i = 0; i < STRIPS; i++) {
        const x0 = (width * i) / STRIPS;
        const x1 = (width * (i + 1.5)) / STRIPS; // slight overlap kills seams
        ctx.fillStyle = `hsl(${(360 * i) / STRIPS}, 62%, 72%)`;
        ctx.fillRect(x0, 0, x1 - x0, height);
    }
    // hemisphere split: bright north (top), dusk south (bottom)
    const split = ctx.createLinearGradient(0, 0, 0, height);
    split.addColorStop(0, "rgba(255,255,255,0.65)");
    split.addColorStop(0.5, "rgba(255,255,255,0)");
    split.addColorStop(0.5, "rgba(51,49,59,0)");
    split.addColorStop(1, "rgba(51,49,59,0.45)");
    ctx.fillStyle = split;
    ctx.fillRect(0, 0, width, height);

    // lat-long graticule
    ctx.strokeStyle = "rgba(51,49,59,0.4)";
    ctx.lineWidth = height / 400;
    for (let m = 0; m < 12; m++) {
        const x = (width * m) / 12;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let l = 1; l < 6; l++) {
        const y = (height * l) / 6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    // the equator, emphasized
    ctx.strokeStyle = "rgba(51,49,59,0.85)";
    ctx.lineWidth = height / 200;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
}

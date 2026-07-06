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

import { CanvasTexture, SRGBColorSpace } from "three";

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

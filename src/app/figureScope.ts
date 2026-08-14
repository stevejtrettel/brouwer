/**
 * Which figure a render page is currently being used to build.
 *
 * A render page owns a SCENE, and one scene usually stages several of the
 * paper's figures — the graphs scene carries Figure 1 and Figure 2(a) and two
 * cuts. Left to itself the workbench therefore shows every preset in the scene
 * as a tab, so opening Figure 1 offers you links to Figure 2 and to material
 * that is not in the paper at all. That is the wrong unit: the thing being
 * worked on is a FIGURE, and its tabs should be its own panels and nothing else.
 *
 * So the figures dev server (`npm run dev:figures`) serves each figure at its
 * own URL, /f/<number>/, and this module reads that number back off the path
 * and looks the figure up in the manifest — the same manifest `npm run figures`
 * renders from, so the panel list here and the panel list in the paper are one
 * list.
 *
 * Outside that server there is no scope: /d/graphs-render/ and a built demo
 * page behave exactly as before, every preset visible. That is deliberate —
 * the scene page is still the right place to compare presets across figures.
 */

import { PAPER } from "../../scripts/figures.manifest.mjs";
import type { Panel, PaperFigure } from "../../scripts/figures.manifest.mjs";

export interface FigureScope {
    figure: PaperFigure;
    /** the figure's panels, in paper order, restricted to this render page */
    panels: Panel[];
}

/** The figure number in a /f/<n>/ URL, or null anywhere else. */
export function scopedFigureNumber(pathname = window.location.pathname): number | null {
    const match = /^\/f\/(\d+)\/?$/.exec(pathname);
    return match ? Number(match[1]) : null;
}

/**
 * Resolve the scope for a render page, or null when the page is not being
 * viewed as one figure.
 *
 * @param page  the demo folder name, e.g. "brouwer-render"
 */
export function resolveFigureScope(page: string, pathname?: string): FigureScope | null {
    const number = scopedFigureNumber(pathname ?? window.location.pathname);
    if (number === null) return null;
    const figure = PAPER.find((f) => f.number === number);
    if (!figure) return null;
    // A figure's panels all live on one render page today. Filtering by page
    // rather than assuming it keeps this honest if that ever stops being true:
    // the other page's panels simply do not appear here.
    return { figure, panels: figure.panels.filter((p) => !p.page || p.page === page) };
}

/** The render page a figure is built on, for the index to link to. */
export function pageForFigure(figure: PaperFigure): string | null {
    return figure.panels.find((p) => p.page)?.page ?? null;
}

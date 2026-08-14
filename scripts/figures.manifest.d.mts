/**
 * Types for figures.manifest.mjs, which is plain JS with JSDoc so the render
 * scripts can import it from node without a build step. This declaration is
 * what lets the browser side (src/app/figureScope.ts) import it type-safely.
 *
 * Keep it in step with the @typedef block at the top of the manifest.
 */

export interface Panel {
    /** output stem: figures/<file>.png */
    file: string;
    /** demo folder under demos/ */
    page?: string;
    /** RenderPreset id on that page */
    preset?: string;
    caption: string;
    /** render aspect "WIDTHxHEIGHT"; default 1440x900 */
    size?: string;
    /** no preset yet; `note` says what it needs */
    planned?: boolean;
    /** why it isn't built, or what it would take */
    note?: string;
}

export interface PaperFigure {
    number: number;
    section: string;
    title: string;
    caption: string;
    panels: Panel[];
}

export const PAPER: PaperFigure[];
export const EXTRAS: (Panel & { note: string })[];
export const FIGURES: (Panel & { section: string; figure: number })[];
export const ALL_FIGURES: (Panel & { section: string; figure?: number })[];

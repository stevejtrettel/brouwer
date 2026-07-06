/**
 * Lifecycle interfaces shared by math objects and render components.
 *
 * The split follows the rebuild/update distinction:
 *   - rebuild(): EXPENSIVE — reallocate or refill geometry-scale data.
 *   - update():  CHEAP — mutate visual properties (colors, opacity, uniforms).
 *
 * Objects implement whichever apply; Params cascades call them duck-typed.
 */

export interface Rebuildable {
    rebuild(): void;
}

export interface Updatable {
    update(): void;
}

export interface Disposable {
    dispose(): void;
}

export interface Animatable {
    /** time and delta in seconds */
    animate(time: number, delta: number): void;
}

export function isRebuildable(obj: unknown): obj is Rebuildable {
    return typeof (obj as Rebuildable)?.rebuild === "function";
}

export function isUpdatable(obj: unknown): obj is Updatable {
    return typeof (obj as Updatable)?.update === "function";
}

export function isDisposable(obj: unknown): obj is Disposable {
    return typeof (obj as Disposable)?.dispose === "function";
}

export function isAnimatable(obj: unknown): obj is Animatable {
    return typeof (obj as Animatable)?.animate === "function";
}

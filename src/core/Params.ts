/**
 * Params — a minimal reactive parameter system.
 *
 * Each object that wants reactive configuration holds
 *
 *     readonly params = new Params(this);
 *
 * and declares properties with a trigger policy:
 *
 *     this.params
 *         .define('R', 2.0,       { triggers: 'rebuild' })  // structural
 *         .define('color', 0xfff, { triggers: 'update' })   // visual
 *         .dependOn(torus);                                 // join the DAG
 *
 * define() installs a getter/setter on the owner. Setting a value runs the
 * optional onChange, then cascades the trigger through the dependency DAG in
 * topological order (sources before dependents), so diamond dependencies
 * rebuild each object exactly once.
 *
 * Deliberately small: no serialization, no UI binding, no signals. The
 * per-frame animation path (driving the proof parameter at 60fps) should
 * bypass Params and call refill/refit methods directly.
 */

import { isRebuildable, isUpdatable } from "./lifecycle.ts";

export type Trigger = "rebuild" | "update" | "none";

export interface DefineOptions {
    triggers?: Trigger;
    onChange?: (value: unknown) => void;
}

interface Entry {
    value: unknown;
    triggers: Trigger;
    onChange?: (value: unknown) => void;
}

export interface Parametric {
    readonly params: Params;
}

export function isParametric(obj: unknown): obj is Parametric {
    return (obj as Parametric)?.params instanceof Params;
}

export class Params {
    /** Params of objects that depend on this one (edges point downstream). */
    private dependents = new Set<Params>();
    private entries = new Map<string, Entry>();

    constructor(readonly owner: object) {}

    define(name: string, value: unknown, options: DefineOptions = {}): this {
        const entry: Entry = {
            value,
            triggers: options.triggers ?? "none",
        };
        if (options.onChange) entry.onChange = options.onChange;
        this.entries.set(name, entry);

        Object.defineProperty(this.owner, name, {
            configurable: true,
            enumerable: true,
            get: () => entry.value,
            set: (v: unknown) => {
                if (v === entry.value) return;
                entry.value = v;
                entry.onChange?.(v);
                this.cascade(entry.triggers);
            },
        });
        return this;
    }

    /** Declare that this.owner is derived from `source`: when a structural
     *  parameter of `source` changes, this owner rebuilds too. */
    dependOn(source: Parametric): this {
        source.params.dependents.add(this);
        return this;
    }

    /** Propagate a trigger to this owner and all transitive dependents,
     *  in topological order (Kahn), so each owner fires once. */
    cascade(trigger: Trigger): void {
        if (trigger === "none") return;

        // collect the reachable subgraph
        const nodes = new Set<Params>();
        const stack: Params[] = [this];
        while (stack.length > 0) {
            const node = stack.pop()!;
            if (nodes.has(node)) continue;
            nodes.add(node);
            for (const dep of node.dependents) stack.push(dep);
        }

        // in-degrees restricted to the subgraph
        const inDegree = new Map<Params, number>();
        for (const node of nodes) inDegree.set(node, 0);
        for (const node of nodes) {
            for (const dep of node.dependents) {
                if (nodes.has(dep)) inDegree.set(dep, inDegree.get(dep)! + 1);
            }
        }

        // Kahn's algorithm: fire sources before the things built from them
        const queue = [...nodes].filter((n) => inDegree.get(n) === 0);
        const ordered: Params[] = [];
        while (queue.length > 0) {
            const node = queue.shift()!;
            ordered.push(node);
            for (const dep of node.dependents) {
                if (!nodes.has(dep)) continue;
                const d = inDegree.get(dep)! - 1;
                inDegree.set(dep, d);
                if (d === 0) queue.push(dep);
            }
        }
        // cycle guard: anything left un-ordered still gets fired once
        for (const node of nodes) {
            if (!ordered.includes(node)) ordered.push(node);
        }

        for (const node of ordered) {
            const owner = node.owner;
            if (trigger === "rebuild" && isRebuildable(owner)) owner.rebuild();
            else if (isUpdatable(owner)) owner.update();
        }
    }
}

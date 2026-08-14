/**
 * The paper's figure set — the single source of truth for `npm run figures`.
 *
 * Structured as the PAPER sees it: a numbered figure, which may carry several
 * panels. Panels are composed in LaTeX (subfigure/overpic), not baked into one
 * render, because the poses are pinned (src/app/figurePose.ts) so panels of the
 * same object register exactly, and each stays independently re-renderable.
 *
 * A panel names an existing `?figpreset=` on a render page — the deep link
 * /d/<page>/?figpreset=<preset> — so preset ids stay untouched and figure
 * FILENAMES live here. Renders carry no labels; those go on in LaTeX over the
 * image, which is also why a panel's `caption` is a stub for the LaTeX side.
 *
 * Three kinds of entry:
 *   PAPER    the set, grouped and numbered. What `npm run figures` renders.
 *   planned  a panel with no preset yet: the scene work isn't done. It renders
 *            nothing and shows as a gap on the contact sheet, which is the
 *            point — a hole in the argument should be visible.
 *   EXTRAS   candidates NOT in the set. Kept alive (talks, alternates, the
 *            record of what was considered) rather than deleted; rendered only
 *            by `npm run figures -- --all`.
 *
 * @typedef {object} Panel
 * @property {string}  file       output stem: figures/<file>.png
 * @property {string}  [page]     demo folder under demos/
 * @property {string}  [preset]   RenderPreset id on that page
 * @property {string}  caption    what this panel is for
 * @property {string}  [size]     render aspect WIDTHxHEIGHT (default 1440x900);
 *                                composition decides it — a row of actors wants
 *                                a wide frame, a single torus a squarer one
 * @property {boolean} [planned]  no preset yet; `note` says what it needs
 * @property {string}  [note]     why it isn't built, or what it would take
 *
 * @typedef {object} PaperFigure
 * @property {number} number
 * @property {string} section
 * @property {string} title
 * @property {string} caption     the figure-level caption
 * @property {Panel[]} panels
 */

/**
 * §4 (Poincaré) is PARKED, not deleted: the scenes and presets are all still
 * there, but the figures have not been worked yet and shipping them unexamined
 * would put three unreviewed pictures in the paper. Move an entry back into
 * PAPER when its section gets the same pass §1–§3 have had.
 */
export const PARKED = [
    {
        number: 7,
        section: "§4 Poincaré",
        title: "How f_γ is built",
        caption:
            "Two things side by side. Left, a sphere with a circle drawn on it and, at one point of that circle, three arrows: the direction you are walking, the direction ninety degrees from it, and the wind at that spot. Right, a flat disc with that same wind arrow drawn from its centre. The definition is “lay the tangent plane flat on the disc so your walking direction points right, then see where the wind lands” — one sentence in §4, never drawn, and the biggest single leap in the paper.",
        panels: [
            {
                file: "poincare-frame",
                page: "poincare-render",
                preset: "frame",
                size: "1560x860",
                caption: "The moving frame at γ(θ), and the fibre disk it lands the vector in.",
            },
        ],
    },
    {
        number: 8,
        section: "§4 Poincaré",
        title: "The loop, and its reverse",
        caption:
            "Two spheres. Left: a sphere covered in small arrows for the wind, with a little red loop near the north pole — the paper's Figure 5, redrawn. Right: that loop being stretched — down past the tropics to the equator, on down to a small loop at the south pole, then up over the north pole and home, now running the other way round. Four sentences in the paper, no picture.",
        panels: [
            {
                file: "poincare-fur",
                page: "poincare-render",
                preset: "sphere-fur-loop",
                caption: "A tangent field on S², and the small loop γ near the north pole.",
            },
            {
                file: "poincare-loop-family",
                page: "poincare-render",
                preset: "loop-family",
                caption: "The deformation γ → γ̄, as a family of loops on the sphere.",
            },
        ],
    },
    {
        number: 9,
        section: "§4 Poincaré",
        title: "The graph must cross the core",
        caption:
            "Three doughnuts. Left: the graph for the small northern loop, a green curve winding once around as it travels round. Right: the graph after the loop has been reversed, winding the opposite way. Middle: somewhere in between the green curve touches the black core, and a point on the core means the wind is zero there. HONEST WARNING: as rendered today the left and right panels look identical — the thing that tells them apart is not visible from this camera. The fix is a row of fibre discs under each, showing the point going round one way and then the other.",
        panels: [
            {
                file: "poincare-bookend-11",
                page: "poincare-render",
                preset: "bookend-1-1",
                caption: "γ, the small north loop: Γ_{f_γ} is the (1,1)-curve.",
            },
            {
                file: "poincare-crossing",
                page: "poincare-render",
                preset: "crossing",
                caption: "Mid-deformation, the graph meets the core: v = 0 there.",
            },
            {
                file: "poincare-bookend-1-neg1",
                page: "poincare-render",
                preset: "bookend-1-neg1",
                caption: "γ̄, the same loop reversed: Γ_{f_γ̄} is the (1,−1)-curve.",
            },
        ],
    },
];

/** @type {PaperFigure[]} */
export const PAPER = [
    // ------------------------------------------------------------------ §1
    {
        number: 1,
        section: "§1 setup",
        title: "Slicing and graphing",
        caption:
            "Three objects on a table. On the left, a flat disk with a circle drawn on it: the domain, and one of the circles we slice it into. In the middle, a second disk with a crumpled sheet of paper resting on it — where the function sends things — and a blue curve riding over the folds, which is the image of that circle. On the right, a glass doughnut with the blue curve threading through it, passing through three translucent discs. That is the graph. The same three coloured dots appear in all three, so a single point of the circle can be followed all the way through. This is the figure that teaches the reader how to read every other figure, and the paper currently does it in four paragraphs with no picture.",
        // Three panels rather than one wide render. Composed side by side in
        // LaTeX, which lets each actor be framed on its own terms — the two
        // plates are square objects and were losing most of the frame to empty
        // table in a 1680×760 strip, while the torus is genuinely wide. Same
        // three coloured dots in all three, so a point still tracks across.
        panels: [
            {
                file: "setup-domain",
                page: "graphs-render",
                preset: "domain",
                size: "1000x1000", // a disk, framed square
                caption: "(a) the domain disk, with the circle S_r we slice it into.",
            },
            {
                file: "setup-codomain",
                page: "graphs-render",
                preset: "codomain",
                size: "1000x1000", // ditto
                caption:
                    "(b) the codomain: a crumpled sheet resting on the second disk, with the image f(S_r) riding over the folds.",
            },
            {
                file: "setup-torus",
                page: "graphs-render",
                preset: "torus",
                size: "1600x800", // the torus is the wide one — 2:1
                caption:
                    "(c) the graph Γ_{f_r} in the solid torus, threading three translucent fibre disks.",
            },
        ],
    },
    {
        number: 2,
        section: "§1 setup",
        title: "The one-dimensional cases",
        caption:
            "The two theorems in the dimension where you can just draw them. Left: a map of the interval to itself, graphed inside the square D¹ × D¹ that a graph of it cannot leave — the blue curve starts high above the orange diagonal and ends well below it, so it must cross, and the gold dot is where. Right: a height function on the circle, its graph riding above on a thin glass sheet, and the one pair of antipodal points whose joining bar is level. Both are in the paper as sentences. Worth drawing, because everything after this is an attempt to keep these exact pictures alive in a dimension where they no longer fit.",
        panels: [
            {
                file: "setup-ivt",
                page: "graphs-render",
                preset: "ivt",
                size: "1200x1000",
                caption:
                    "Brouwer, n = 1 (p. 3): f starts above the diagonal and ends below it, so the graphs must cross.",
            },
            {
                file: "setup-ivt-borsuk",
                page: "graphs-render",
                preset: "ivt-borsuk",
                size: "1200x1000",
                caption:
                    "Borsuk–Ulam, n = 1 (p. 7): a height function on the circle, its graph hanging above on a glass sheet, and the antipodal pair whose joining bar is level.",
            },
        ],
    },

    // ------------------------------------------------------------------ §2
    {
        number: 3,
        section: "§2 Brouwer",
        title: "Unlinked becomes linked",
        caption:
            "Three glass doughnuts in a row, the same camera each time, only the radius changing. Left: small radius, and the two curves — orange for the identity, blue for the function — are separate rings in parallel planes that could obviously be pulled apart. Right: radius 1, and now they are threaded through each other. Middle: the moment in between where they touch. That touch is the fixed point; it is the entire theorem. The paper's Figure 1 shows the two ends and not the middle.",
        panels: [
            {
                file: "brouwer-unlinked",
                page: "brouwer-render",
                preset: "small-r",
                caption: "Small r: Γ_{f_r} and Γ_{i_r} are disjoint circles in parallel planes.",
            },
            {
                file: "brouwer-crossing",
                page: "brouwer-render",
                preset: "crossing",
                caption:
                    "The r where the graphs meet — a fixed point, repeated face-on on the fibre plate.",
            },
            {
                file: "brouwer-linked",
                page: "brouwer-render",
                preset: "r-1",
                caption: "r = 1: Γ_{i_1} is the (1,1)-curve, and Γ_{f_1} is linked with it.",
            },
        ],
    },
    {
        number: 4,
        section: "§2 Brouwer",
        title: "Why the r = 1 pair is linked",
        caption:
            "Left: the blue curve being pushed down onto the black core of the doughnut, with a surface hanging between where it started and where it lands, and a small disc beside the torus showing one slice face-on — that little disc is exactly the paper's Figure 2, but here you can see what it is a slice OF. Right: a flat plate filling the hole of the doughnut, whose edge IS the black core, with the orange curve passing through the plate at exactly one gold dot. That single puncture is why the two curves cannot come apart, and it is the paper's only real argument for linking anywhere in the article.",
        panels: [
            {
                file: "brouwer-push",
                page: "brouwer-render",
                preset: "push-core-ghosts",
                caption:
                    "The deformation, staged globally: every point slides straight to its disk's centre. The plate is the paper's Figure 2.",
            },
            {
                file: "brouwer-linking-disk",
                page: "brouwer-render",
                preset: "linking-disk",
                caption:
                    "The core bounds a disk; the (1,1)-curve pierces it once. The paper's only real argument for linking (p. 6), and prose until now.",
            },
        ],
    },

    // ------------------------------------------------------------------ §3
    {
        number: 5,
        section: "§3 Borsuk–Ulam",
        title: "Slicing and graphing on the sphere",
        caption:
            "Blue is f and violet is f̄ throughout §3, the way coral was the identity and blue was f in §2 — the colour names the object, not its place in the picture. The same three beats as Figure 1, one dimension up. On the left the domain: a glass sphere with the latitude circle S_φ in blue and its antipodal partner −S_φ in violet. In the middle, the sphere crushed flat into the disk — that is what f does — with the image of the latitude riding on it in blue, and the image of its antipodal partner in violet. On the right, those two loops read off as curves in the solid torus, exactly the way Figure 1 read a circle's image off as a graph. Everything in §3 happens to that pair of curves.",
        panels: [
            {
                file: "borsuk-setup-sphere",
                page: "borsuk-render",
                preset: "setup-sphere",
                size: "1000x1000",
                caption: "(a) the domain S², sliced into latitudes, with an antipodal pair marked.",
            },
            {
                file: "borsuk-setup-image",
                page: "borsuk-render",
                preset: "setup-image",
                size: "1000x1000",
                caption:
                    "(b) the sphere crushed into the disk: f(S²), carrying f(S_φ) and f̄(S_φ).",
            },
            {
                file: "borsuk-setup-graphs",
                page: "borsuk-render",
                preset: "setup-graphs",
                caption:
                    "(c) the two loops read off as graphs Γ_{f_φ}, Γ_{f̄_φ} in the solid torus.",
            },
        ],
    },
    {
        number: 6,
        section: "§3 Borsuk–Ulam",
        title: "From the pole to the equator",
        // Three tori, one camera, only φ changing — the same shape as Figure 3,
        // and deliberately so: flat annulus → the curves touch → an odd twist.
        // The spanning surface is drawn throughout, because the surface is what
        // carries the twist; showing it only at the ends would make the middle
        // panel a different picture.
        caption:
            "First the sphere, with one circle of latitude drawn on it and two gold dots marking a pair of opposite points. Then three doughnuts, the same camera each time, each with a band stretched between the two curves. Near the pole the band is flat like a washer and its two edges are separate rings. At the equator the band has turned over on itself — it is light on one face and dark on the other, so you can see where it flips — and the edges can no longer be separated. In between, the band pinches to nothing at a single gold point, and that pinch is a pair of opposite points on the sphere where the function gives the same answer. The paper draws only the equator one.",
        panels: [
            {
                file: "borsuk-polar-ribbon",
                page: "borsuk-render",
                preset: "polar-ribbon",
                caption: "Near the pole: a flat, untwisted annulus. Unlinked.",
            },
            {
                file: "borsuk-pair",
                page: "borsuk-render",
                preset: "pinch",
                caption: "The forced touch: the band pinches to a point and f(x) = f(−x).",
            },
            {
                file: "borsuk-equator-ribbon",
                page: "borsuk-render",
                preset: "equator-ribbon",
                caption:
                    "The equator: the band turns over — the two faces flip colour — an odd number of half-twists. Linked.",
            },
        ],
    },

    // ------------------------------------------------------------------ §4

];

/**
 * Considered and left out. Every one of these is a real render; they are
 * alternates and offcuts, not rejects, and several are better for a talk than
 * anything in the set.
 * @type {(Panel & {note: string})[]}
 */
export const EXTRAS = [
    {
        file: "setup-graphing",
        page: "graphs-render",
        preset: "overview",
        size: "1680x760",
        caption:
            "All three actors in one wide frame: domain circle S_r · its crumpled image f(S_r) · the graph Γ_{f_r}.",
        note: "Cut in favour of the three-panel Figure 1. Kept because it is the better single slide for a talk, where you cannot put three subfigures side by side and point at them.",
    },
    {
        file: "setup-anatomy",
        page: "graphs-render",
        preset: "anatomy",
        caption:
            "The solid torus and its parts: core, one fibre disk {θ} × D², the (1,1)-curve on the boundary.",
        note: "Cut: Figure 1's torus panel already names these, and this one's fibre disk is faint for something whose whole job is to point at it. Bring it back if the labels on Figure 1 get crowded.",
    },
    {
        file: "setup-crumple",
        page: "graphs-render",
        preset: "crumple",
        size: "1200x1000",
        caption: "A crumpled copy of the map smushed onto the flat one (p. 2).",
        note: "Cut: illustrates the introduction's anecdote rather than a step of a proof. First thing to add back if there is room.",
    },
    {
        file: "brouwer-sweep",
        page: "brouwer-render",
        preset: "r-sweep",
        caption: "Both graphs at five radii at once, sweeping from near the core out to r = 1.",
        note: "Cut: overlaps Figure 3, and reads as continuity rather than as the change in linking — which is the thing that needs showing.",
    },
    {
        file: "poincare-over-pole",
        page: "poincare-render",
        preset: "over-the-pole",
        caption: "The γ → γ̄ trip in the torus, as ghost trails.",
        note: "Cut: Figure 8's sphere panel tells the same story more legibly; the trails in the torus read as mush.",
    },
];

/** Every panel that can actually be rendered, in paper order. */
export const FIGURES = PAPER.flatMap((figure) =>
    figure.panels
        .filter((panel) => !panel.planned)
        .map((panel) => ({ ...panel, section: figure.section, figure: figure.number })),
);

/** The paper set plus the offcuts — `npm run figures -- --all`. */
export const ALL_FIGURES = [
    ...FIGURES,
    ...EXTRAS.map((panel) => ({ ...panel, section: "not in the set" })),
];

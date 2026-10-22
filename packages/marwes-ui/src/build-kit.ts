import type { BuildKit } from "@penpair/core";
/** Recipes refer to library token names, while project-derived constants remain explicit parameters. */
export const marwesKit: BuildKit = {
  include: "@marwes-kit", requires: ["@kit"],
  recipes: [
    { name: "card", description: "Surface/border card; project radius token is explicit" },
    { name: "segmented", description: "Token-styled segments with an explicit selected label" },
    { name: "progress", description: "Labeled bounded progress; explicit pill-radius token" },
    { name: "icon-tile", description: "Square token-styled icon tile with explicit dimensions" },
    { name: "stat-tile", description: "Card with project content and library typography" },
  ],
  source: String.raw`// penpair: read
const mw = (() => {
    const requireRadius = props => { if (!props || typeof props.radius !== "string" || !props.radius)
        throw new Error("A measured or project-declared radius token is required"); pp.tok(props.radius); };
    const card = (parent, props = {}) => { requireRadius(props); return pp.box(parent, { name: props.name || "Card", dir: "column", gap: props.gap ?? "mw-spacing-sp-16", pad: props.pad ?? ["mw-spacing-sp-24", "mw-spacing-sp-24", "mw-spacing-sp-24", "mw-spacing-sp-24"], bg: props.surface || "mw-color-surface", stroke: props.border || "mw-color-border-low", radius: props.radius, ...props }); };
    const label = (parent, value, props = {}) => pp.text(parent, value, { typo: "mw-typography-text-label", color: "mw-color-text", ...props });
    const segmented = (parent, props = {}) => {
        if (!Array.isArray(props.labels) || !props.labels.length || props.labels.length > 20 || new Set(props.labels).size !== props.labels.length || !props.labels.includes(props.selected) || props.labels.some(value => typeof value !== "string" || !value))
            throw new Error("Segments need 1-20 distinct labels and a selected label");
        const radius = props.radius || "mw-ui-radius";
        pp.tok(radius);
        const group = pp.box(parent, { name: props.name || "Segmented control", dir: "row", gap: props.gap ?? "mw-spacing-sp-2", pad: props.pad ?? ["mw-spacing-sp-2", "mw-spacing-sp-2", "mw-spacing-sp-2", "mw-spacing-sp-2"], align: "center", bg: props.surface || "mw-color-surface-subtle", stroke: props.border || "mw-color-border-low", radius });
        for (const value of props.labels) {
            const selected = value === props.selected;
            const segment = pp.box(group, { name: "Segment " + value, dir: "row", pad: props.segmentPad || ["mw-spacing-sp-8", "mw-spacing-sp-12", "mw-spacing-sp-8", "mw-spacing-sp-12"], align: "center", justify: "center", bg: selected ? props.selectedSurface || "mw-color-surface-primary" : undefined, stroke: selected ? props.selectedBorder || "mw-color-border-medium" : undefined, radius });
            label(segment, value, { typo: props.typo || "mw-typography-text-label", color: selected ? props.color || "mw-color-text" : props.mutedColor || "mw-color-text-muted", ...props.text });
        }
        return group;
    };
    const progress = (parent, props = {}) => {
        requireRadius(props);
        if (typeof props.value !== "number" || !Number.isFinite(props.value) || props.value < 0 || props.value > 100 || typeof props.width !== "number" || !Number.isFinite(props.width) || props.width <= 0)
            throw new Error("Progress needs value 0-100 and positive width");
        if (typeof props.label !== "string" || !props.label)
            throw new Error("Progress label required");
        if (typeof props.height !== "string")
            throw new Error("Progress needs an explicit sizing height token");
        const heightToken = pp.tok(props.height);
        if (heightToken.type !== "sizing")
            throw new Error("Progress height must be a sizing token");
        const height = Number(heightToken.resolvedValue === undefined ? heightToken.value : heightToken.resolvedValue);
        if (!Number.isFinite(height) || height <= 0)
            throw new Error("Progress height token did not resolve");
        const column = pp.box(parent, { name: props.name || "Progress", dir: "column", gap: props.gap ?? "mw-spacing-sp-8" });
        const head = pp.fill(pp.box(column, { name: "Label row", dir: "row", gap: props.gap ?? "mw-spacing-sp-8", align: "center", justify: "space-between" }));
        label(head, props.label, props.text);
        label(head, String(props.value) + "%", { color: props.mutedColor || "mw-color-text-muted", ...props.text });
        const track = pp.box(column, { name: "Track", w: props.width, h: height, clip: true, bg: props.track || "mw-color-border-low", radius: props.radius });
        pp.bind(track, heightToken.name, ["height"]);
        if (props.value > 0) {
            const fill = pp.box(track, { name: "Fill", w: props.width * props.value / 100, h: height, bg: props.color || "mw-color-primary-base", radius: props.radius });
            pp.bind(fill, heightToken.name, ["height"]);
        }
        return column;
    };
    const iconTile = (parent, props = {}) => {
        requireRadius(props);
        if (!Number.isFinite(props.size) || props.size <= 0 || !Number.isFinite(props.iconSize) || props.iconSize <= 0 || props.iconSize > props.size)
            throw new Error("Icon tile needs explicit positive square/icon dimensions");
        const tile = pp.box(parent, { name: props.name || "Icon tile", dir: "row", align: "center", justify: "center", w: props.size, h: props.size, bg: props.surface || "mw-color-surface-subtle", radius: props.radius });
        pp.icon(tile, props.kind, props.color || "mw-color-text", props.iconSize);
        return tile;
    };
    const statTile = (parent, props = {}) => { if (typeof props.title !== "string" || !props.title || typeof props.value !== "string" || !props.value)
        throw new Error("Stat tile title/value required"); const tile = card(parent, props); label(tile, props.title, { typo: props.labelTypo || "mw-typography-text-label", color: props.mutedColor || "mw-color-text-muted", ...props.text }); label(tile, props.value, { typo: props.valueTypo || "mw-typography-h2", color: props.color || "mw-color-text", ...props.text }); if (props.caption)
        label(tile, props.caption, { typo: props.captionTypo || "mw-typography-text-caption", color: props.mutedColor || "mw-color-text-muted", ...props.text }); return tile; };
    pp.defineRecipe("card", card, "Surface/border card; project radius token is explicit");
    pp.defineRecipe("segmented", segmented, "Token-styled segments with an explicit selected label");
    pp.defineRecipe("progress", progress, "Labeled bounded progress; explicit pill-radius token");
    pp.defineRecipe("icon-tile", iconTile, "Square token-styled icon tile with explicit dimensions");
    pp.defineRecipe("stat-tile", statTile, "Card with project content and library typography");
    return { card, segmented, progress, iconTile, statTile };
})();
`,
};

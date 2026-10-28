/** Plain plugin-sandbox JavaScript that extends `pp` from the core kit. Inclusion defines helpers without touching the document. */
export const instanceKitSource = String.raw`// penpair: read
Object.assign(pp, (() => {
    const walk = root => { const out = [], stack = [root]; while (stack.length) {
        if (out.length >= 20000)
            throw new Error("Instance traversal exceeds budget");
        const shape = stack.pop();
        out.push(shape);
        const kids = shape.children || [];
        for (let index = kids.length - 1; index >= 0; index--)
            stack.push(kids[index]);
    } return out; };
    const fullName = component => component.path ? component.path + " / " + component.name : component.name;
    /** The library component an instance comes from, with its path (component().name alone does not carry it). */
    const componentName = instance => {
        const component = instance && typeof instance.component === "function" ? instance.component() : null;
        if (!component || typeof component.name !== "string")
            throw new Error("A component instance is required");
        return { id: component.id === undefined ? null : component.id, path: component.path || "", name: component.name, full: fullName(component) };
    };
    /** Scales an icon instance to size px, including the nested shapes a plain resize leaves at their old size. */
    const iconSize = (instance, size) => {
        if (typeof size !== "number" || !Number.isFinite(size) || size <= 0)
            throw new Error("Icon size must be positive");
        if (!instance || !(instance.width > 0))
            throw new Error("An icon instance with a width is required");
        const factor = size / instance.width, ox = instance.x, oy = instance.y;
        const inner = walk(instance).slice(1).map(shape => ({ shape, x: shape.x, y: shape.y, width: shape.width, height: shape.height }));
        instance.resize(size, instance.height * factor);
        let scaled = 0;
        for (const entry of inner) {
            const width = entry.width * factor, height = entry.height * factor, x = ox + (entry.x - ox) * factor, y = oy + (entry.y - oy) * factor, shape = entry.shape;
            if (Math.abs(shape.width - width) > 0.5 || Math.abs(shape.height - height) > 0.5) {
                shape.resize(width, height);
                scaled++;
            }
            if (Math.abs(shape.x - x) > 0.5 || Math.abs(shape.y - y) > 0.5) {
                shape.x = x;
                shape.y = y;
            }
        }
        const overflow = inner.some(entry => entry.shape.x < instance.x - 0.5 || entry.shape.y < instance.y - 0.5 || entry.shape.x + entry.shape.width > instance.x + instance.width + 0.5 || entry.shape.y + entry.shape.height > instance.y + instance.height + 0.5);
        return { scale: factor, nodes: inner.length, scaled, overflow };
    };
    /** Replaces an instance with one of another component at the same index, keeping its texts in reading order and its sizing. */
    const swap = (instance, target, options = {}) => {
        if (!instance || !instance.parent || !Array.isArray(instance.parent.children))
            throw new Error("An instance with a parent is required");
        const keepText = options.keepText !== false, keepSize = options.keepSize !== false, library = options.library || penpot.library.local;
        const found = library.components.filter(component => fullName(component) === target);
        if (found.length !== 1)
            throw new Error("Component missing or ambiguous: " + target);
        const parent = instance.parent, index = parent.children.indexOf(instance);
        const oldTexts = walk(instance).filter(shape => shape.type === "text").map(shape => shape.characters);
        const lc = instance.layoutChild || {}, size = { width: instance.width, height: instance.height, horizontal: lc.horizontalSizing, vertical: lc.verticalSizing };
        const fresh = found[0].instance();
        const newTexts = walk(fresh).filter(shape => shape.type === "text");
        if (keepText && newTexts.length !== oldTexts.length && !options.allowTextMismatch) {
            fresh.remove();
            throw new Error("Text count differs (" + oldTexts.length + " to " + newTexts.length + "); the original was kept. Pass allowTextMismatch to carry what fits");
        }
        if (typeof parent.insertChild === "function")
            parent.insertChild(index, fresh);
        else
            parent.appendChild(fresh);
        if (keepText)
            newTexts.forEach((shape, at) => { if (at < oldTexts.length)
                shape.characters = oldTexts[at]; });
        if (keepSize) {
            const fillH = size.horizontal === "fill", fillV = size.vertical === "fill";
            if (fresh.layoutChild) {
                if (fillH)
                    fresh.layoutChild.horizontalSizing = "fill";
                if (fillV)
                    fresh.layoutChild.verticalSizing = "fill";
            }
            if (!fillH || !fillV)
                fresh.resize(fillH ? fresh.width : size.width, fillV ? fresh.height : size.height);
        }
        instance.remove();
        return fresh;
    };
    /** A library icon instance at size px, recoloured by binding the token on its inner paths. */
    const libraryIcon = (parent, path, name, color, size = 20) => {
        const shape = pp.inst(parent, path, name);
        iconSize(shape, size);
        let bound = 0;
        for (const inner of walk(shape).slice(1)) {
            if (inner.children && inner.children.length)
                continue;
            if (inner.strokes && inner.strokes.length) {
                pp.bind(inner, color, ["strokeColor"]);
                bound++;
            }
            if (inner.fills && inner.fills.length) {
                pp.bind(inner, color, ["fill"]);
                bound++;
            }
        }
        if (!bound)
            throw new Error("The icon has no stroked or filled inner shape to recolour: " + path + "/" + name);
        return shape;
    };
    const find = (root, filter, expected = 1) => {
        if (!root) {
            throw new Error("find needs a root shape (got " + JSON.stringify(root) + ")");
        }
        if (!Number.isInteger(expected) || expected < 1) {
            throw new Error("find expected must be a positive integer (got " + JSON.stringify(expected) + ")");
        }

        const label = typeof filter === "function" ? filter.name || "predicate" : JSON.stringify(filter);
        const match = typeof filter === "function" ? filter : shape => shape.name === filter;
        const found = walk(root).filter(match);
        if (found.length !== expected) {
            throw new Error("find(" + label + ") matched " + found.length + " shapes under " + JSON.stringify(root.name === undefined ? null : root.name) + ", expected " + expected);
        }

        return expected === 1 ? found[0] : found;
    };
    return { componentName, iconSize, swap, libraryIcon, find };
})());
`;

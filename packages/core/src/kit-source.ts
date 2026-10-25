import { layoutPolicySource } from "./layout-policy.js";

/** Plain plugin-sandbox JavaScript. Inclusion defines helpers without touching the document. */
export const coreKitSource = String.raw`// penpair: read
const pp = (() => {
    const bindings = [], styles = [], recipes = new Map();
    let flushing = false, queuedContext = null;
    const numeric = (value, label) => { if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw new Error(label + " must be finite and nonnegative"); return value; };
    const activeSets = () => { const sets = penpot.library.local.tokens.sets; if (!Array.isArray(sets))
        throw new Error("Token API unavailable"); return sets.filter(set => set.active); };
    const context = () => JSON.stringify(activeSets().map(set => [set.id || null, set.name, set.tokens.map(token => [token.id || null, token.name, token.type, token.value])]));
    const tok = name => { if (typeof name !== "string" || !name)
        throw new Error("Token name required"); let found = null, count = 0; for (const set of activeSets()) {
        const matches = [];
        for (const token of set.tokens) {
            if (++count > 10000)
                throw new Error("Active token budget exceeded");
            if (token.name === name)
                matches.push(token);
        }
        if (matches.length > 1)
            throw new Error("Ambiguous token in set: " + name);
        if (matches.length)
            found = matches[0];
    } if (!found)
        throw new Error("No active token: " + name); return found; };
    const numericToken = (value, label) => { if (value === undefined || value === 0)
        return { value: 0, token: null }; if (typeof value !== "string")
        throw new Error(label + " needs a token name (only unbound zero is allowed)"); const token = tok(value); if (token.type !== "spacing")
        throw new Error(label + " needs a spacing token"); const resolved = token.resolvedValue === undefined ? Number(token.value) : Number(token.resolvedValue); return { value: numeric(resolved, label), token: value }; };
    const reserve = () => { const actual = context(); if (queuedContext === null)
        queuedContext = actual;
    else if (queuedContext !== actual)
        throw new Error("Active token context changed while building"); };
    const bind = (shape, name, properties) => { if (!shape || !shape.id || typeof shape.applyToken !== "function")
        throw new Error("Bindable shape required"); if (!Array.isArray(properties) || !properties.length || properties.some(key => typeof key !== "string" || !key))
        throw new Error("Explicit binding properties required"); tok(name); reserve(); if (bindings.length >= 10000)
        throw new Error("Binding queue exceeds budget"); bindings.push({ shape, name, properties: [...properties] }); return shape; };
    const checkStyle = options => { for (const key of ["bg", "stroke", "radius"])
        if (options[key] !== undefined && (typeof options[key] !== "string" || !options[key]))
            throw new Error(key + " needs a token name"); for (const key of ["bg", "stroke", "radius"])
        if (options[key] !== undefined) {
            const token = tok(options[key]);
            if (token.type !== (key === "radius" ? "borderRadius" : "color"))
                throw new Error("Wrong token type for " + key);
        } numericToken(options.gap, "gap"); const pad = options.pad === undefined ? [0, 0, 0, 0] : options.pad; if (!Array.isArray(pad) || pad.length !== 4)
        throw new Error("Padding requires four token names or zeros"); pad.forEach(value => numericToken(value, "padding")); };
    const style = (shape, options = {}) => {
        checkStyle(options);
        if ((options.gap !== undefined || options.pad !== undefined) && !shape.flex)
            throw new Error("Spacing style requires a flex board");
        for (const name of [options.bg, options.stroke, options.radius].filter(Boolean))
            tok(name);
        const gap = numericToken(options.gap, "gap"), pad = options.pad === undefined ? [0, 0, 0, 0] : options.pad;
        if (!Array.isArray(pad) || pad.length !== 4)
            throw new Error("Padding requires four token names or zeros");
        const pads = pad.map(value => numericToken(value, "padding"));
        reserve();
        if (styles.length >= 5000)
            throw new Error("Style queue exceeds budget");
        styles.push(() => {
            if (shape.flex) {
                if (options.gap !== undefined) {
                    shape.flex.rowGap = gap.value;
                    shape.flex.columnGap = gap.value;
                }
                if (options.pad !== undefined) {
                    shape.flex.paddingType = "multiple";
                    ["topPadding", "rightPadding", "bottomPadding", "leftPadding"].forEach((key, index) => { shape.flex[key] = pads[index].value; });
                }
            }
            if (options.stroke) {
                shape.strokes = [{ strokeColor: "#000000", strokeWidth: options.strokeWidth === undefined ? 1 : numeric(options.strokeWidth, "stroke width"), strokeAlignment: "inner" }];
                bind(shape, options.stroke, ["strokeColor"]);
            }
            if (options.bg)
                bind(shape, options.bg, ["fill"]);
            if (options.radius)
                bind(shape, options.radius, ["borderRadiusTopLeft", "borderRadiusTopRight", "borderRadiusBottomRight", "borderRadiusBottomLeft"]);
            if (gap.token)
                bind(shape, gap.token, ["rowGap", "columnGap"]);
            pads.forEach((entry, index) => { if (entry.token)
                bind(shape, entry.token, [["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"][index]]); });
        });
        return shape;
    };
    const box = (parent, options = {}) => {
        checkStyle(options);
        const gap = numericToken(options.gap, "gap");
        if (options.w !== undefined)
            numeric(options.w, "width");
        if (options.h !== undefined)
            numeric(options.h, "height");
        const board = penpot.createBoard();
        if (parent)
            parent.appendChild(board);
        board.name = options.name || "Board";
        board.fills = [];
        board.clipContent = !!options.clip;
        board.addFlexLayout();
        board.flex.dir = options.dir || "column";
        board.flex.wrap = options.wrap ? "wrap" : "nowrap";
        board.flex.alignItems = options.align || "start";
        board.flex.justifyContent = options.justify || "start";
        board.flex.rowGap = gap.value;
        board.flex.columnGap = gap.value;
        if (options.w !== undefined || options.h !== undefined)
            board.resize(options.w === undefined ? board.width : options.w, options.h === undefined ? board.height : options.h);
        board.flex.horizontalSizing = options.w === undefined ? "auto" : "fix";
        board.flex.verticalSizing = options.h === undefined ? "auto" : "fix";
        return style(board, { ...options, gap: options.gap === undefined ? 0 : options.gap, pad: options.pad === undefined ? [0, 0, 0, 0] : options.pad });
    };
    const text = (parent, value, options = {}) => {
        if (typeof value !== "string" || value.length === 0)
            throw new Error("Text needs nonempty characters; use an explicit space for blank text");
        const typography = tok(options.typo);
        if (typography.type !== "typography" || tok(options.color).type !== "color")
            throw new Error("Text needs typography and color token types");
        let resolved = typography.resolvedValue;
        if (Array.isArray(resolved) && resolved.length === 1)
            resolved = resolved[0];
        const data = resolved && typeof resolved === "object" && !Array.isArray(resolved) ? resolved : typography.value;
        const families = options.font || (data && typeof data === "object" && (data.fontFamilies || data.fontFamily));
        const family = Array.isArray(families) ? families[0] : families;
        if (typeof family !== "string" || !family || family.includes("{"))
            throw new Error("An explicit or resolved font family is required");
        const font = penpot.fonts.findByName(family);
        if (!font || !Array.isArray(font.variants) || typeof font.applyToText !== "function")
            throw new Error("Font unavailable: " + family);
        const weight = String(options.weight || (data && typeof data === "object" && (data.fontWeight || data.fontWeights)) || "400"), fontStyle = options.fontStyle || "normal";
        const variants = font.variants.filter(variant => String(variant.fontWeight) === weight && (variant.fontStyle || "normal") === fontStyle);
        if (variants.length !== 1)
            throw new Error("Font weight/style is missing or ambiguous: " + family + " " + weight);
        const shape = penpot.createText(value);
        if (parent)
            parent.appendChild(shape);
        shape.name = options.name || value.slice(0, 80);
        shape.growType = options.wrap ? "auto-height" : options.grow || "auto-width";
        if (options.align)
            shape.align = options.align;
        font.applyToText(shape, variants[0]);
        if (options.wrap || options.fill) {
            if (!shape.layoutChild)
                throw new Error("Text layout child unavailable");
            shape.layoutChild.horizontalSizing = "fill";
        }
        bind(shape, options.typo, ["typography"]);
        bind(shape, options.color, ["fill"]);
        return shape;
    };
    const glyphs = { chevron: { path: "M9 6 L15 12 L9 18", bounds: [9, 6, 6, 12] }, check: { path: "M4 12 L10 18 L20 6", bounds: [4, 6, 16, 12] }, alert: { path: "M12 3 L22 20 H2 Z M12 10 V14", bounds: [2, 3, 20, 17] }, calendar: { path: "M4 6 H20 V20 H4 Z M4 10 H20 M8 3 V7 M16 3 V7", bounds: [4, 3, 16, 17] } };
    const icon = (parent, kind, color, size = 20) => {
        numeric(size, "icon size");
        if (size === 0)
            throw new Error("Icon size must be positive");
        tok(color);
        const glyph = typeof kind === "string" ? glyphs[kind] : kind;
        if (!glyph || typeof glyph.path !== "string" || !Array.isArray(glyph.bounds) || glyph.bounds.length !== 4 || !glyph.bounds.every(Number.isFinite) || glyph.bounds[2] <= 0 || glyph.bounds[3] <= 0)
            throw new Error("Icon requires known path and positive bounds");
        const board = penpot.createBoard();
        if (parent)
            parent.appendChild(board);
        board.name = "Icon";
        board.fills = [];
        board.clipContent = false;
        board.resize(size, size);
        const path = penpot.createPath();
        board.appendChild(path);
        path.name = "Glyph";
        path.content = glyph.path;
        path.fills = [];
        path.strokes = [{ strokeColor: "#000000", strokeWidth: Math.max(1, 2 * size / 24), strokeCapStyle: "round", strokeJoinStyle: "round" }];
        const [x, y, width, height] = glyph.bounds, scale = size / 24;
        path.proportionLock = true;
        path.resize(width * scale, height * scale);
        path.x = board.x + x * scale;
        path.y = board.y + y * scale;
        bind(path, color, ["strokeColor"]);
        return board;
    };
    const dot = (parent, color, size = 8) => { numeric(size, "dot size"); if (!size)
        throw new Error("Positive dot size required"); tok(color); const shape = penpot.createEllipse(); if (parent)
        parent.appendChild(shape); shape.name = "Dot"; shape.resize(size, size); bind(shape, color, ["fill"]); return shape; };
    const rule = (parent, color) => { tok(color); const shape = penpot.createRectangle(); if (parent)
        parent.appendChild(shape); shape.name = "Rule"; shape.resize(10, 1); if (!shape.layoutChild)
        throw new Error("Rule layout child unavailable"); shape.layoutChild.horizontalSizing = "fill"; bind(shape, color, ["fill"]); return shape; };
    const descendants = root => { const out = [], stack = [root], seen = new Set(); while (stack.length) {
        if (out.length >= 20000)
            throw new Error("Component traversal exceeds budget");
        const shape = stack.pop();
        if (!shape.id || seen.has(shape.id))
            throw new Error("Invalid component identity");
        seen.add(shape.id);
        out.push(shape);
        for (const child of shape.children || [])
            stack.push(child);
    } return out; };
    const inst = (parent, path, name, texts = {}, library = penpot.library.local) => {
        const components = library.components.filter(component => component.path === path && component.name === name);
        if (components.length !== 1)
            throw new Error("Component missing or ambiguous: " + path + "/" + name);
        const entries = Object.entries(texts);
        if (entries.some(([, value]) => typeof value !== "string" || !value))
            throw new Error("Text overrides must be nonempty strings");
        const validate = root => { const rows = descendants(root); return entries.map(([key, value]) => { const matches = rows.filter(shape => shape.type === "text" && shape.name === key); if (matches.length !== 1)
            throw new Error("Override target missing or ambiguous: " + key); return { shape: matches[0], value }; }); };
        if (typeof components[0].mainInstance === "function")
            validate(components[0].mainInstance());
        const shape = components[0].instance();
        const overrides = validate(shape);
        if (parent)
            parent.appendChild(shape);
        for (const override of overrides)
            override.shape.characters = override.value;
        return shape;
    };
    const fill = shape => { if (!shape.layoutChild)
        throw new Error("Layout child unavailable"); shape.layoutChild.horizontalSizing = "fill"; return shape; };
    const fillV = shape => { if (!shape.layoutChild)
        throw new Error("Layout child unavailable"); shape.layoutChild.verticalSizing = "fill"; return shape; };
    const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
    ${layoutPolicySource}
    const settle = async (root = penpot.currentPage.root, options = {}) => {
        const fileId = penpot.currentFile.id, pageId = penpot.currentPage.id;
        try { return await settleLayout(async nativeMs => {
            if (penpot.currentFile.id !== fileId || penpot.currentPage.id !== pageId) throw new Error("Layout target changed between samples");
            return observeLayout(penpot, root, { nativeMs, maxNodes: options.maxNodes });
        }, { timeoutMs: options.timeoutMs === undefined ? 10000 : options.timeoutMs, intervalMs: options.intervalMs === undefined ? 100 : options.intervalMs, strategy: options.strategy === undefined ? "auto" : options.strategy, maxNodes: options.maxNodes, sleep: wait }); }
        catch (error) { return { stable: false, method: "unavailable", samples: 0, reason: String(error && error.message || error) }; }
    };
    const flush = async (options = {}) => {
        if (flushing)
            throw new Error("Concurrent flush is unsupported");
        flushing = true;
        const timeout = options.timeoutMs === undefined ? 10000 : options.timeoutMs, started = Date.now();
        let applied = 0;
        const remaining = () => { const value = timeout - (Date.now() - started); if (value < 1)
            throw new Error("Flush deadline exceeded"); return value; };
        try {
            if (queuedContext !== null && context() !== queuedContext)
                throw new Error("Active token context changed before flush");
            let layout = await settle(options.root || penpot.currentPage.root, { timeoutMs: remaining(), strategy: options.strategy });
            if (!layout.stable)
                throw new Error(layout.reason || "Layout did not settle");
            if (queuedContext !== null && context() !== queuedContext)
                throw new Error("Active token context changed during layout");
            while (styles.length) {
                remaining();
                styles[0]();
                styles.shift();
            }
            while (bindings.length) {
                remaining();
                if (context() !== queuedContext)
                    throw new Error("Token context changed during binding");
                const binding = bindings[0];
                await binding.shape.applyToken(tok(binding.name), binding.properties);
                bindings.shift();
                applied++;
            }
            layout = await settle(options.root || penpot.currentPage.root, { timeoutMs: remaining(), strategy: options.strategy });
            if (!layout.stable)
                throw new Error(layout.reason || "Layout did not settle");
            queuedContext = null;
            return { applied, layout };
        }
        finally {
            flushing = false;
        }
    };
    const defineRecipe = (name, build, description = "") => { if (!/^[a-z][a-z0-9-]*$/.test(name) || typeof build !== "function" || recipes.has(name))
        throw new Error("Invalid or duplicate recipe: " + name); recipes.set(name, { build, description }); return build; };
    const recipe = (name, parent, props) => { const found = recipes.get(name); if (!found)
        throw new Error("Unknown recipe: " + name); return found.build(parent, props || {}); };
    defineRecipe("hello-card", (parent, props) => { if (!props.box || !props.text)
        throw new Error("hello-card needs explicit box/text token styles"); tok(props.text.typo); tok(props.text.color); const board = box(parent, props.box); text(board, props.label || "Hello, card", props.text); return board; }, "A neutral text-in-board example, with explicit token styles");
    return { tok, bind, box, text, icon, dot, rule, inst, style, fill, fillV, settle, flush, defineRecipe, recipe, recipes: () => [...recipes].map(([name, value]) => ({ name, description: value.description })) };
})();
`;

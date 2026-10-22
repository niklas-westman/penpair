export function kitFixture() {
  let next = 0;
  const events: string[] = [];
  const sets = [
    {
      id: "base",
      name: "Base",
      active: true,
      tokens: [
        {
          name: "surface",
          type: "color",
          value: "#FFFFFF",
          resolvedValue: "#FFFFFF",
        },
        {
          name: "ink",
          type: "color",
          value: "#000000",
          resolvedValue: "#000000",
        },
        {
          name: "space",
          type: "spacing",
          value: "4",
          resolvedValue: 4,
        },
        {
          name: "radius",
          type: "borderRadius",
          value: "8",
          resolvedValue: 8,
        },
        {
          name: "body",
          type: "typography",
          value: {
            fontFamilies: "Test Sans",
            fontWeight: "400",
            fontSize: "16",
          },
          resolvedValue: {
            fontFamilies: [
              "Test Sans",
            ],
            fontWeights: "400",
            fontSizes: 16,
          },
        },
      ],
    },
  ];
  const shapes: Shape[] = [];
  class Shape {
    id = "shape-" + ++next;
    name = "";
    x = 0;
    y = 0;
    width = 100;
    height = 100;
    children: Shape[] = [];
    parent: Shape | null = null;
    tokens: Record<string, string> = {};
    characters = "";
    fills: unknown[] = [];
    clipContent = false;
    private shared = new Map<string, string>();
    setSharedPluginData(namespace: string, key: string, value: string) {
      this.shared.set(namespace + "/" + key, value);
    }
    getSharedPluginData(namespace: string, key: string) {
      return this.shared.get(namespace + "/" + key) ?? "";
    }
    private strokeData: unknown[] = [];
    flex?: Record<string, unknown>;
    layoutChild = new Proxy<Record<string, unknown>>(
      {},
      {
        set: (target, key, value) => {
          events.push(`${this.id}:child:${String(key)}=${value}`);
          target[String(key)] = value;
          return true;
        },
      },
    );
    constructor(public type: string) {
      shapes.push(this);
    }
    get strokes() {
      return this.strokeData;
    }
    set strokes(value) {
      events.push(`${this.id}:strokes`);
      delete this.tokens.strokeColor;
      this.strokeData = value;
    }
    appendChild(child: Shape) {
      events.push(`${this.id}:append:${child.id}`);
      if (child.parent) {
        child.parent.children = child.parent.children.filter((item) => item !== child);
      }
      child.parent = this;
      this.children.push(child);
    }
    addFlexLayout() {
      this.flex = new Proxy<Record<string, unknown>>(
        {},
        {
          set: (target, key, value) => {
            events.push(`${this.id}:flex:${String(key)}=${value}`);
            const binding =
              (
                {
                  topPadding: "paddingTop",
                  rightPadding: "paddingRight",
                  bottomPadding: "paddingBottom",
                  leftPadding: "paddingLeft",
                } as Record<string, string>
              )[String(key)] ?? String(key);
            delete this.tokens[binding];
            target[String(key)] = value;
            return true;
          },
        },
      );
      return this.flex;
    }
    resize(width: number, height: number) {
      events.push(`${this.id}:resize:${width},${height}`);
      this.width = width;
      this.height = height;
    }
    async applyToken(
      token: {
        name: string;
      },
      properties: string[],
    ) {
      await Promise.resolve();
      for (const property of properties) {
        events.push(`${this.id}:bind:${property}=${token.name}`);
        this.tokens[property] = token.name;
      }
    }
    remove() {
      for (const child of [
        ...this.children,
      ]) {
        child.remove();
      }
      events.push(`${this.id}:remove`);
      if (this.parent) {
        this.parent.children = this.parent.children.filter((child) => child !== this);
      }
      const index = shapes.indexOf(this);
      if (index >= 0) {
        shapes.splice(index, 1);
      }
    }
    async export() {
      return new TextEncoder().encode("fixture pixels");
    }
  }
  const root = new Shape("root");
  root.id = "root";
  root.width = 0;
  root.height = 0;
  const create = (type: string) => {
    const shape = new Shape(type);
    root.appendChild(shape);
    return shape;
  };
  const font = {
    variants: [
      {
        fontWeight: "400",
        fontStyle: "normal",
      },
      {
        fontWeight: "700",
        fontStyle: "normal",
      },
    ],
    applyToText(shape: Shape) {
      events.push(`${shape.id}:font-face`);
      delete shape.tokens.typography;
    },
  };
  const page = {
    id: "page",
    name: "Candidate",
    root,
    getShapeById: (id: string) => shapes.find((shape) => shape.id === id),
  };
  const library = {
    tokens: {
      sets,
      themes: [],
    },
    components: [] as {
      path: string;
      name: string;
      instance(): Shape;
      mainInstance?(): Shape;
    }[],
  };
  const penpot = {
    currentPage: page,
    currentFile: {
      id: "file",
      revn: 1,
      pages: [
        page,
      ],
    },
    library: {
      local: library,
    },
    fonts: {
      findByName: (name: string) => (name === "Test Sans" ? font : undefined),
    },
    waitForLayoutUpdate: async () => {
      events.push("layout");
    },
    createBoard: () => create("board"),
    createRectangle: () => create("rect"),
    createEllipse: () => create("ellipse"),
    createPath: () => create("path"),
    createText: (value: string) => {
      if (!value) {
        throw new Error("empty native text");
      }
      const text = create("text");
      text.characters = value;
      return text;
    },
  };
  return {
    penpot,
    root,
    events,
    shapes,
    sets,
    library,
    Shape,
  };
}

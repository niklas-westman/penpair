import { snippet, type SnippetResult } from "./snippet.js";
import type { Operation } from "./operation.js";

export const tokenTypes = [
  "borderRadius",
  "shadow",
  "color",
  "dimension",
  "fontFamilies",
  "fontSizes",
  "fontWeights",
  "letterSpacing",
  "number",
  "opacity",
  "rotation",
  "sizing",
  "spacing",
  "borderWidth",
  "textCase",
  "textDecoration",
  "typography",
] as const;
export interface EditableToken {
  name: string;
  type: string;
  value: string | Record<string, string>;
  description: string;
}
export type TokenEdit =
  | {
      kind: "add-set";
      set: string;
    }
  | {
      kind: "set";
      set: string;
      token: EditableToken;
    }
  | {
      kind: "remove";
      set: string;
      name: string;
    }
  | {
      kind: "promote";
      set: string;
      to: string;
    };
export interface TokenEditState {
  sets: {
    name: string;
    active: boolean;
    tokens: EditableToken[];
  }[];
  themes: {
    group: string;
    name: string;
    active: boolean;
    sets: string[];
  }[];
  bindings: {
    id: string;
    page: string;
    tokens: Record<string, string>;
  }[];
}
export interface TokenEditPlan {
  before: TokenEditState;
  after: TokenEditState;
  changed: boolean;
  impact: string[];
}

export function validateEditableToken(value: unknown): EditableToken {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Token must be an object");
  }
  const token = value as EditableToken;
  if (
    Object.keys(token).some(
      (key) =>
        ![
          "name",
          "type",
          "value",
          "description",
        ].includes(key),
    )
  ) {
    throw new Error("Unknown token field");
  }
  if (
    typeof token.name !== "string" ||
    !token.name.trim() ||
    token.name.length > 200 ||
    /[{}\x00-\x1f]/.test(token.name)
  ) {
    throw new Error(
      "Token name must be nonempty, at most 200 characters and contain no braces or control characters",
    );
  }
  if (!tokenTypes.includes(token.type as (typeof tokenTypes)[number])) {
    throw new Error("Unsupported token type");
  }
  if (
    !(
      (typeof token.value === "string" && token.value.length > 0) ||
      (token.value &&
        typeof token.value === "object" &&
        !Array.isArray(token.value) &&
        Object.keys(token.value).length > 0 &&
        Object.values(token.value).every((v) => typeof v === "string"))
    )
  ) {
    throw new Error("Token value must be a nonempty string or composite string-valued object");
  }
  if (token.description !== undefined && typeof token.description !== "string") {
    throw new Error("Token description must be a string");
  }
  if (Buffer.byteLength(JSON.stringify(token)) > 16384) {
    throw new Error("Token exceeds 16 KiB");
  }
  return {
    name: token.name,
    type: token.type,
    value: token.value,
    description: token.description ?? "",
  };
}
export function validateTokenEdit(edit: TokenEdit): TokenEdit {
  if (
    ![
      "add-set",
      "set",
      "remove",
      "promote",
    ].includes(edit.kind)
  ) {
    throw new Error("Unknown token edit");
  }
  for (const name of [
    edit.set,
    ...(edit.kind === "promote"
      ? [
          edit.to,
        ]
      : []),
  ]) {
    if (typeof name !== "string" || !name.trim() || name.length > 200 || /[\x00-\x1f]/.test(name)) {
      throw new Error(
        "Set names must be nonempty and at most 200 characters without control characters",
      );
    }
  }
  if (edit.kind === "set") {
    return {
      ...edit,
      token: validateEditableToken(edit.token),
    };
  }
  if (edit.kind === "remove" && (typeof edit.name !== "string" || !edit.name.trim())) {
    throw new Error("Remove requires a token name");
  }
  if (edit.kind === "promote" && edit.set === edit.to) {
    throw new Error("Promotion requires distinct source and destination sets");
  }
  return edit;
}

/** Pure desired-state planner. Kept self-contained so the delivered mutation rechecks the same facts. */
export function planTokenEdit(before: TokenEditState, edit: TokenEdit): TokenEditPlan {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) {
      return "[" + value.map(canonical).join(",") + "]";
    }
    if (value && typeof value === "object") {
      return (
        "{" +
        Object.keys(value)
          .sort()
          .map(
            (key) => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key]),
          )
          .join(",") +
        "}"
      );
    }
    return JSON.stringify(value);
  };
  const after = JSON.parse(JSON.stringify(before)) as TokenEditState;
  if (
    !Array.isArray(after.sets) ||
    !Array.isArray(after.themes) ||
    !Array.isArray(after.bindings)
  ) {
    throw new Error("Missing token observations");
  }
  const names = new Set<string>();
  for (const set of after.sets) {
    if (names.has(set.name)) {
      throw new Error("Ambiguous set: " + set.name);
    }
    names.add(set.name);
    const tokens = new Set<string>();
    for (const token of set.tokens) {
      if (tokens.has(token.name)) {
        throw new Error("Ambiguous token: " + token.name);
      }
      tokens.add(token.name);
    }
  }
  const impact: string[] = [];
  const set = after.sets.find((s) => s.name === edit.set);
  if (edit.kind === "add-set") {
    if (!set) {
      after.sets.push({
        name: edit.set,
        active: false,
        tokens: [],
      });
    }
  } else {
    if (!set) {
      throw new Error("Missing set: " + edit.set);
    }
    if (edit.kind === "set") {
      const token = set.tokens.find((t) => t.name === edit.token.name);
      if (token && token.type !== edit.token.type) {
        throw new Error("Type replacement requires a separate reviewed removal");
      }
      if (token) {
        Object.assign(token, edit.token);
      } else {
        set.tokens.push(edit.token);
      }
      for (const row of before.bindings) {
        if (Object.values(row.tokens).includes(edit.token.name)) {
          impact.push(row.page + "/" + row.id);
        }
      }
    } else if (edit.kind === "remove") {
      // Conservatively refuse even when another active set might supply the same name.
      if (set.tokens.some((t) => t.name === edit.name)) {
        const pattern = "{" + edit.name + "}";
        for (const source of after.sets) {
          for (const token of source.tokens) {
            if (
              !(source.name === set.name && token.name === edit.name) &&
              JSON.stringify(token.value).includes(pattern)
            ) {
              throw new Error("Retained reference from " + source.name + "/" + token.name);
            }
          }
        }
        if (before.bindings.some((row) => Object.values(row.tokens).includes(edit.name))) {
          throw new Error("Token is bound to a retained shape");
        }
        set.tokens = set.tokens.filter((t) => t.name !== edit.name);
      }
    } else {
      const target = after.sets.find((s) => s.name === edit.to);
      if (!target) {
        throw new Error("Missing promotion destination: " + edit.to);
      }
      for (const token of set.tokens) {
        const existing = target.tokens.find((t) => t.name === token.name);
        if (existing && canonical(existing) !== canonical(token)) {
          throw new Error("Promotion conflicts with destination token: " + token.name);
        }
        if (!existing) {
          target.tokens.push(token);
        }
      }
      impact.push("Copies tokens; source, themes and active selection are preserved");
    }
  }
  for (const set of after.sets) {
    set.tokens.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  return {
    before,
    after,
    changed: canonical(before) !== canonical(after),
    impact,
  };
}

// Snapshot getter-backed API fields explicitly; refuse partial/oversized observations before any edit.
const observe = `
const observe = () => {
  const catalog=penpot.library.local.tokens;
  if (!catalog || !Array.isArray(catalog.sets) || !Array.isArray(catalog.themes)) throw new Error("Token API unavailable");
  let count=0;
  const sets=catalog.sets.map(s=>({name:s.name,active:!!s.active,tokens:s.tokens.map(t=>{
    if(++count>10000)throw new Error("Token edit inspection exceeds 10000 tokens");
    if(typeof t.name!=="string"||typeof t.type!=="string"||t.value===undefined)throw new Error("Incomplete token observation");
    return {name:t.name,type:t.type,value:t.value,description:t.description||""};
  }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)}));
  const themes=catalog.themes.map(t=>({group:t.group,name:t.name,active:!!t.active,sets:(t.activeSets||[]).map(s=>typeof s==="string"?s:s.name)}));
  const bindings=[],stack=[],seen=new Set();
  for(const page of penpot.currentFile.pages)for(const shape of page.root.children||[])stack.push({page:page.id,shape});
  let visited=0;
  while(stack.length){if(++visited>20000)throw new Error("Token edit binding inspection exceeds 20000 shapes");const {page,shape}=stack.pop();if(!shape.id||seen.has(shape.id))throw new Error("Invalid shape identity");seen.add(shape.id);
    const tokens=shape.tokens||{};if(Object.values(tokens).some(v=>typeof v!=="string"))throw new Error("Unknown shape binding");
    if(Object.keys(tokens).length)bindings.push({page,id:shape.id,tokens});for(const child of shape.children||[])stack.push({page,shape:child});}
  const state=JSON.parse(JSON.stringify({sets,themes,bindings}));
  if(JSON.stringify(state).length>500000)throw new Error("Token edit observation exceeds bounded document size; narrow using a reviewed project operation");
  return state;
};`;
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) {
    return "[" + value.map(canonical).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key]),
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
};
function comparable(state: TokenEditState): unknown {
  return {
    ...state,
    sets: state.sets.map((set) => ({
      ...set,
      tokens: set.tokens.map((token) => {
        let value: unknown = token.value;
        if (token.type === "fontFamilies") {
          value = Array.isArray(value)
            ? value
            : [
                value,
              ];
        }
        if (
          token.type === "typography" &&
          value &&
          typeof value === "object" &&
          !Array.isArray(value)
        ) {
          const { fontFamilies, fontFamily, ...rest } = value as Record<string, unknown>;
          const family = fontFamily ?? fontFamilies;
          value = {
            ...rest,
            ...(family === undefined
              ? {}
              : {
                  fontFamily: Array.isArray(family)
                    ? family
                    : [
                        family,
                      ],
                }),
          };
        }
        return {
          ...token,
          value,
        };
      }),
    })),
  };
}
const stateFrom = (result: SnippetResult): TokenEditState => {
  if (result.ok !== true || !result.state) {
    throw new Error("No independent token-state evidence");
  }
  return result.state as TokenEditState;
};

export const tokenEditOperation: Operation<TokenEdit> = {
  name: "tokens-edit",
  page: () => undefined,
  inspect(edit) {
    edit = validateTokenEdit(edit);
    return snippet(
      "tokens-edit-inspect",
      `${observe}\nconst state=observe();const plan=(${planTokenEdit.toString()})(state,CFG.edit);return {ok:true,readOnly:true,state,plan};`,
      {
        edit,
      },
    );
  },
  apply(edit, inspected) {
    edit = validateTokenEdit(edit);
    return snippet(
      "tokens-edit-apply",
      `${observe}
const canonical=${canonical.toString()}, before=observe();
if(!CFG.before)throw new Error("Missing pinned inspection");
if(canonical(before)!==canonical(CFG.before))throw new Error("Token source changed after inspection");
const plan=(${planTokenEdit.toString()})(before,CFG.edit),catalog=penpot.library.local.tokens;
if(plan.changed){
 if(CFG.edit.kind==="add-set")catalog.addSet({name:CFG.edit.set});
 else {
  const set=catalog.sets.find(s=>s.name===CFG.edit.set);
  if(CFG.edit.kind==="remove"){const token=set.tokens.find(t=>t.name===CFG.edit.name);if(token)token.remove();}
  else if(CFG.edit.kind==="set"){
    const token=set.tokens.find(t=>t.name===CFG.edit.token.name);
    if(token){token.value=CFG.edit.token.value;token.description=CFG.edit.token.description;}
    else{const added=set.addToken(CFG.edit.token);added.description=CFG.edit.token.description;}
  }else{
    const target=catalog.sets.find(s=>s.name===CFG.edit.to);
    for(const token of set.tokens)if(!target.tokens.some(t=>t.name===token.name)){const added=target.addToken({name:token.name,type:token.type,value:token.value});added.description=token.description||"";}
  }
 }
}
return {ok:true,changed:plan.changed};`,
      {
        edit,
        before: inspected?.state ?? null,
      },
    );
  },
  readback: () =>
    snippet("tokens-edit-readback", `${observe}\nreturn {ok:true,readOnly:true,state:observe()};`),
  verify({ inspect, readback }) {
    try {
      const plan = inspect.plan as TokenEditPlan;
      if (!plan?.after) {
        return [
          "Missing original desired-state plan",
        ];
      }
      return canonical(comparable(stateFrom(readback))) === canonical(comparable(plan.after))
        ? []
        : [
            "Independent token state differs from the inspected plan",
          ];
    } catch (error) {
      return [
        String(error),
      ];
    }
  },
};

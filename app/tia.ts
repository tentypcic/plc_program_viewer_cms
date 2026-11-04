import {
  diagramRouter,
  type DiagramObstacle,
  type DiagramPoint,
  type DiagramSegment,
} from "./tia-routing";
import { tokenize } from "./analysis/lexer";
import {
  newProject,
  newNode,
  uuid,
  validateProject,
  type BlockType,
  type Project,
} from "./model";
const all = (e: Element | Document, name: string) =>
  Array.from(e.getElementsByTagNameNS("*", name));
const child = (e: Element, name: string) =>
  Array.from(e.children).find((c) => c.localName === name);
const value = (e: Element, name: string) => child(e, name)?.textContent || "";
export function parseTia(text: string) {
  if (text.length > 2000000 || /<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error("Unsafe or excessive TIA XML");
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (all(xml, "parsererror").length) throw Error("Invalid TIA XML");
  const root = Array.from(xml.documentElement.children).find((e) =>
    /^(SW\.Blocks\.(OB|FC|FB|GlobalDB|InstanceDB|ArrayDB)|SW\.Types\.PlcStruct|SW\.Tags\.PlcTagTable|SW\.TechnologicalObjects\.TechnologicalInstanceDB)$/.test(
      e.localName,
    ),
  );
  if (!root) throw Error("Unsupported TIA export");
  const attr = child(root, "AttributeList")!;
  const kind = root.localName.split(".").pop()!;
  const type: BlockType =
    kind === "PlcStruct"
      ? "UDT"
      : kind === "PlcTagTable"
        ? "TAGS"
        : kind.endsWith("DB")
          ? "DB"
          : (kind as BlockType);
  return {
    root,
    attr,
    type,
    name: value(attr, "Name"),
    number: value(attr, "Number"),
    safety: value(attr, "ProgrammingLanguage").startsWith("F_"),
    technology: root.localName.startsWith("SW.TechnologicalObjects."),
  };
}
export function parseSclHeader(text: string): {
  name: string;
  type: BlockType;
} {
  const declaration = text
    .replace(/^\uFEFF/, "")
    .trimStart()
    .match(
      /^(FUNCTION_BLOCK|FUNCTION|ORGANIZATION_BLOCK)\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z_0-9]*))/i,
    );
  if (!declaration) throw Error("Unsupported SCL source declaration");
  return {
    name: declaration[2] || declaration[3],
    type:
      declaration[1].toUpperCase() === "FUNCTION_BLOCK"
        ? "FB"
        : declaration[1].toUpperCase() === "FUNCTION"
          ? "FC"
          : "OB",
  };
}
export function importTia(files: Record<string, string>, name: string) {
  const p = newProject(name);
  const folders = new Map(p.nodes.map((n) => [n.name, n.id]));
  for (const [path, text] of Object.entries(files)) {
    const parsed = /\.scl$/i.test(path)
      ? { ...parseSclHeader(text), number: "", safety: false }
      : parseTia(text);
    const pieces = path.split("/");
    pieces.pop();
    let parent: string | null = null,
      key = "";
    for (const piece of pieces) {
      key += (key ? "/" : "") + piece;
      if (!folders.has(key)) {
        const n = newNode(piece, parent, "group");
        p.nodes.push(n);
        folders.set(key, n.id);
      }
      parent = folders.get(key)!;
    }
    if (!parent)
      parent = p.nodes.find(
        (n) =>
          n.name ===
          (parsed.type === "UDT"
            ? "PLC data types"
            : parsed.type === "TAGS"
              ? "PLC tags"
              : "Program blocks"),
      )!.id;
    const n = newNode(
      parsed.name + (parsed.number ? ` [${parsed.type}${parsed.number}]` : ""),
      parent,
      "block",
      parsed.type,
    );
    n.safety = parsed.safety;
    p.nodes.push(n);
    p.documents.push({
      id: uuid(),
      nodeId: n.id,
      name: path.split("/").pop()!,
      mime: /\.scl$/i.test(path) ? "text/plain" : "application/xml",
      size: new TextEncoder().encode(text).length,
      text,
    });
  }
  validateProject(p);
  return p;
}
function typeDefault(dt: string): string | undefined {
  return /^bool$/i.test(dt)
    ? "false"
    : /^(w?string)(\[\d+\])?$/i.test(dt)
      ? "''"
      : /^(s?int|dint|lint|usint|uint|udint|ulint|real|lreal|byte|word|dword|lword)$/i.test(
            dt,
          )
        ? "0"
        : undefined;
}
function sliceSuffix(component: Element): string {
  const modifier = component.getAttribute("SliceAccessModifier");
  return modifier && /^[xbwd]\d+$/i.test(modifier)
    ? ".%" + modifier.toUpperCase()
    : "";
}
function symbol(e: Element): string {
  const constant = child(e, "Constant")
    ? all(child(e, "Constant")!, "ConstantValue")[0]
    : undefined;
  if (constant) return constant.textContent || "";
  const named = child(e, "Constant")?.getAttribute("Name");
  if (named)
    return (e.getAttribute("Scope") === "LocalConstant" ? "#" : "") + named;
  return (
    (e.getAttribute("Scope") === "LocalVariable" ? "#" : "") +
    all(e, "Component")
      .map((c, index) => {
        const name = c.getAttribute("Name") || "";
        const member =
          index > 0 && /^\d/.test(name)
            ? '"' + name.replace(/"/g, '$"') + '"'
            : name;
        return (
          member +
          (c.getAttribute("AccessModifier") === "Array"
            ? `[${all(c, "ConstantValue")
                .map((v) => v.textContent)
                .join(",")}]`
            : "") +
          sliceSuffix(c)
        );
      })
      .join(".")
  );
}
const html = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "") => {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
};
export function resolveTiaCall(project: Project, name: string, type: string) {
  const nodeIds = new Set(
    project.nodes
      .filter((n) => n.kind === "block" && n.blockType === type)
      .map((n) => n.id),
  );
  const matches = project.documents.filter((d) => {
    if (!nodeIds.has(d.nodeId) || !/\.(xml|scl)$/i.test(d.name) || !d.text)
      return false;
    try {
      const parsed = /\.scl$/i.test(d.name)
        ? parseSclHeader(d.text)
        : parseTia(d.text);
      return parsed.name === name && parsed.type === type;
    } catch {
      return false;
    }
  });
  return new Set(matches.map((d) => d.nodeId)).size === 1
    ? matches[0]
    : undefined;
}
const symbolCache = new WeakMap<Project, TiaSymbolIndex>();
export type TiaSymbolIndex = {
  block: (name: string, type: string) => string | undefined;
  operand: (name: string) => string | undefined;
  defaultInput: (name: string, type: string, pin: string) => string | undefined;
  safetyOperand: (name: string) => boolean;
};
export function tiaSymbolIndex(project: Project): TiaSymbolIndex {
  const cached = symbolCache.get(project);
  if (cached) return cached;
  const inputDefaults = new Map<string, Set<string>>();
  const owners = new Map<string, Set<string>>();
  const safetyDBs = new Set<string>();
  const blocks = new Map<string, Set<string>>(),
    tags = new Map<string, Set<string>>();
  const put = (map: Map<string, Set<string>>, key: string, address: string) => {
    const entries = map.get(key) || new Set<string>();
    entries.add(address);
    map.set(key, entries);
  };
  for (const d of project.documents) {
    if (!/\.xml$/i.test(d.name) || !d.text) continue;
    try {
      const p = parseTia(d.text);
      if (p.type === "DB" && p.safety) safetyDBs.add(p.name);
      const key = p.type + ":" + p.name;
      const found = owners.get(key) || new Set<string>();
      found.add(d.nodeId);
      owners.set(key, found);
      if (p.number && /^[0-9]+$/.test(p.number))
        put(blocks, p.type + ":" + p.name, "%" + p.type + p.number);
      for (const section of all(p.attr, "Section").filter(
        (e) => e.getAttribute("Name") === "Input" && !e.closest("Member"),
      ))
        for (const member of Array.from(section.children).filter(
          (e) => e.localName === "Member",
        )) {
          const start = child(member, "StartValue");
          if (start)
            put(
              inputDefaults,
              p.type + ":" + p.name + ":" + member.getAttribute("Name"),
              start.textContent || "",
            );
        }
      for (const tag of all(p.root, "SW.Tags.PlcTag")) {
        const a = child(tag, "AttributeList");
        if (a && value(a, "LogicalAddress"))
          put(tags, value(a, "Name"), value(a, "LogicalAddress"));
      }
    } catch {}
  }
  const unique = (map: Map<string, Set<string>>, key: string) => {
    const set = map.get(key);
    return set?.size === 1 ? [...set][0] : undefined;
  };
  const index = {
    safetyOperand: (name: string) =>
      [...safetyDBs].some(
        (db) =>
          name === db || name.startsWith(db + ".") || name.startsWith(db + "["),
      ),
    defaultInput: (name: string, type: string, pin: string) =>
      owners.get(type + ":" + name)?.size === 1
        ? unique(inputDefaults, type + ":" + name + ":" + pin)
        : undefined,
    block: (name: string, type: string) => unique(blocks, type + ":" + name),
    operand: (name: string) =>
      name.startsWith("#") ? undefined : unique(tags, name),
  };
  symbolCache.set(project, index);
  return index;
}
type CallLink = (name: string, type: string) => (() => void) | undefined;
type ReferenceLink = (symbol: string) => void;
export function tiaView(
  text: string,
  lang: "pl" | "en" = "en",
  callLink?: CallLink,
  symbols?: TiaSymbolIndex,
  referenceLink?: ReferenceLink,
) {
  const ui = (en: string, pl: string) => (lang === "pl" ? pl : en);
  const { root, attr, name, type, number, technology, safety } = parseTia(text);
  const wrap = html("div");
  wrap.className = "tia-view";
  wrap.append(html("h2", `${name} ${number ? `[${type}${number}]` : ""}`));
  const constants = new Map<string, string>();
  for (const section of all(attr, "Section").filter(
    (e) => e.getAttribute("Name") === "Constant",
  ))
    for (const m of Array.from(section.children).filter(
      (e) => e.localName === "Member",
    )) {
      const v = child(m, "StartValue");
      const fallback = typeDefault(m.getAttribute("Datatype") || "");
      if (v || fallback !== undefined)
        constants.set(
          "#" + m.getAttribute("Name"),
          v?.textContent || fallback || "",
        );
    }
  const data = tiaDataTable(root, attr, type, name, lang, referenceLink);
  if (["FC", "FB", "OB"].includes(type)) {
    const details = html("details");
    details.open = true;
    details.append(
      html("summary", ui("Block interface", "Interfejs bloku")),
      data,
    );
    wrap.append(details);
  } else wrap.append(data);
  if (technology)
    wrap.append(
      html(
        "p",
        ui(
          "Technology object: exported interface preview. Motion configuration is available in original XML.",
          "Obiekt technologiczny: podgląd eksportowanego interfejsu. Konfiguracja Motion jest dostępna w źródłowym XML.",
        ),
      ),
    );
  const units = all(root, "SW.Blocks.CompileUnit");
  if (units.length) {
    const tools = html("div");
    tools.className = "tia-network-tools";
    for (const [open, label] of [
      [true, ui("Expand all networks", "Rozwiń wszystkie sieci")],
      [false, ui("Collapse all networks", "Zwiń wszystkie sieci")],
    ] as const) {
      const button = html("button", label);
      button.className = "button small";
      button.onclick = () => {
        for (const network of wrap.querySelectorAll<HTMLDetailsElement>(
          "[data-network]",
        ))
          network.open = open;
      };
      tools.append(button);
    }
    const zoom = html("select");
    zoom.setAttribute("aria-label", ui("Diagram scale", "Skala schematu"));
    const fitOption = html("option", ui("Fit width", "Dopasuj szerokość"));
    fitOption.value = "fit";
    zoom.append(fitOption);
    for (const percent of [50, 75, 100, 125, 150]) {
      const option = html("option", percent + "%");
      option.value = String(percent);
      option.selected = percent === 100;
      zoom.append(option);
    }
    const applyScale = () => {
      for (const svg of wrap.querySelectorAll<SVGSVGElement>(
        ".tia-network svg",
      )) {
        const fit = zoom.value === "fit";
        svg.style.maxWidth = fit ? "100%" : "none";
        svg.style.minWidth = "0";
        svg.style.width =
          Number(svg.getAttribute("width")) *
            (fit ? 1 : Number(zoom.value) / 100) +
          "px";
        svg.style.height = "auto";
      }
    };
    zoom.onchange = applyScale;
    const fitButton = html("button", ui("Fit width", "Dopasuj szerokość"));
    fitButton.className = "button small";
    fitButton.onclick = () => {
      zoom.value = "fit";
      applyScale();
    };
    tools.append(fitButton);
    tools.append(zoom);
    wrap.prepend(tools);
  }
  units.forEach((unit, index) => {
    const details = html("details");
    details.open = true;
    details.dataset.network = String(index + 1);
    const title = all(unit, "MultilingualText").find(
      (e) => e.getAttribute("CompositionName") === "Title",
    );
    details.append(
      html(
        "summary",
        `${ui("Network", "Sieć")} ${index + 1}: ${title ? all(title, "Text").find((e) => e.textContent?.trim())?.textContent || "" : ""}`,
      ),
    );
    const net = all(unit, "FlgNet")[0];
    if (net) {
      const special = all(net, "Part").filter(
        (p) =>
          ![
            "Contact",
            "PContact",
            "NContact",
            "Coil",
            "SCoil",
            "RCoil",
            "Sr",
            "TON",
            "Add",
          ].includes(p.getAttribute("Name") || ""),
      );
      const branched = all(net, "Wire").some(
        (w) => all(w, "NameCon").length > 2,
      );
      if (special.length || branched) {
        const badge = html("span", " · ≈");
        badge.className = "tia-approximation";
        badge.title = ui(
          "Approximate layout: verify branching and generic instructions against TIA.",
          "Układ przybliżony: porównaj rozgałęzienia i instrukcje ogólne z TIA.",
        );
        badge.setAttribute("aria-label", badge.title);
        badge.tabIndex = 0;
        details.querySelector("summary")!.append(badge);
      }
      details.append(
        drawNetwork(net, callLink, symbols, safety, constants, referenceLink),
      );
    } else if (all(unit, "StructuredText")[0]) {
      const pre = html("pre");
      pre.className = "code-view tia-scl";
      const code = html("code");
      for (const token of tokenize(
        structuredText(all(unit, "StructuredText")[0]),
      ))
        code.append(htmlToken(token.kind, token.text));
      pre.append(code);
      details.append(pre);
    } else {
      const source = all(unit, "NetworkSource")[0];
      if (source?.children.length)
        details.append(
          html(
            "p",
            ui(
              "This network language is not rendered. See original XML.",
              "Ten język sieci nie jest wyświetlany graficznie. Otwórz źródłowy XML.",
            ),
          ),
        );
      else {
        details.append(html("p", ui("Empty network", "Pusta sieć")));
        const empty = new DOMParser().parseFromString(
          "<FlgNet><Parts/><Wires/></FlgNet>",
          "application/xml",
        );
        details.append(drawNetwork(empty.documentElement));
      }
    }
    wrap.append(details);
  });
  const source = html("details");
  source.append(html("summary", ui("Original XML", "Źródłowy XML")));
  const pre = html("pre", text);
  source.append(pre);
  wrap.append(source);
  return wrap;
}
function drawNetwork(
  net: Element,
  callLink?: CallLink,
  symbols?: TiaSymbolIndex,
  safety = false,
  constants = new Map<string, string>(),
  referenceLink?: ReferenceLink,
) {
  const parts = Array.from(all(net, "Parts")[0]?.children || []).filter((e) =>
    ["Part", "Call"].includes(e.localName),
  );
  const id = (e: Element) => e.getAttribute("UId")!;
  const kind = (e: Element) => e.getAttribute("Name") || "";
  const accessElements = all(net, "Access").filter((e) =>
    e.hasAttribute("UId"),
  );
  const accesses = new Map(accessElements.map((e) => [id(e), symbol(e)]));
  const variables = new Set(
    accessElements
      .filter((e) =>
        ["LocalVariable", "GlobalVariable"].includes(
          e.getAttribute("Scope") || "",
        ),
      )
      .map(id),
  );
  const symbolWidth = 104;
  const symbolCenter = symbolWidth / 2;
  const railX = 30;
  const pinLabelOffset = 20;
  const lineHeight = 13;
  const simpleKinds = [
    "Contact",
    "PContact",
    "NContact",
    "Coil",
    "SCoil",
    "RCoil",
  ];
  const coilKinds = ["Coil", "SCoil", "RCoil"];
  const font = document.createElement("canvas").getContext("2d")!;
  font.font = "11px Arial, sans-serif";
  const labelWidth = (value: string) => font.measureText(value).width;
  // Prefer member, word and camel-case boundaries. Each caption line
  // is measured using the same font and size as the SVG.
  const wrappedOperands = new Map<string, string[]>();
  const operandLines = (value: string) => {
    const cached = wrappedOperands.get(value);
    if (cached) return cached;
    const lines: string[] = [];
    let rest = value;
    while (labelWidth(rest) > 166 && lines.length < 7) {
      let split = 1;
      while (split < rest.length && labelWidth(rest.slice(0, split + 1)) <= 166)
        split++;
      for (let i = split; i > split / 2; i--) {
        if (
          /[._ -]/.test(rest[i - 1]) ||
          (/\p{Ll}/u.test(rest[i - 1]) && /\p{Lu}/u.test(rest[i] || ""))
        ) {
          split = i;
          break;
        }
      }
      if (rest.length - split < 5 && split > 8) split -= 5;
      lines.push(rest.slice(0, split));
      rest = rest.slice(split);
    }
    if (labelWidth(rest) > 166) {
      let end = 1;
      while (
        end < rest.length &&
        labelWidth(rest.slice(0, end + 1) + "…") <= 166
      )
        end++;
      rest = rest.slice(0, end) + "…";
    }
    lines.push(rest);
    wrappedOperands.set(value, lines);
    return lines;
  };
  const lineCount = (value: string) => operandLines(value).length;
  const operandWidth = (value: string) =>
    Math.max(...operandLines(value).map(labelWidth)) + 10;
  const rowGap = 20;
  const wires = all(net, "Wire");
  const defaults: Record<string, string[]> = {
    Contact: ["in", "out"],
    PContact: ["pre", "out"],
    NContact: ["pre", "out"],
    SCoil: ["in"],
    RCoil: ["in"],
    Coil: ["in"],
    Sr: ["s", "r1", "q"],
    TON: ["IN", "PT", "Q", "ET"],
    Add: ["en", "in1", "in2", "eno", "out"],
    Move: ["en", "in", "eno", "out1"],
    O: [],
    DeviceStates: ["en", "LADDR", "MODE", "STATE", "eno", "Ret_Val"],
  };
  const metadata = (name: string) =>
    ["operand", "bit"].includes(name.toLowerCase());
  const output = (uid: string, name: string) => {
    const part = parts.find((p) => id(p) === uid);
    const param =
      part &&
      all(part, "Parameter").find((p) => p.getAttribute("Name") === name);
    return param
      ? param.getAttribute("Section") === "Output"
      : /^(out\d*|q|eno|et|ret_val)$/i.test(name);
  };
  const pins = new Map(
    parts.map((p) => {
      const names = new Set(defaults[kind(p)] || []);
      if (all(p, "CallInfo").length) {
        names.add("en");
        names.add("eno");
        for (const param of all(p, "Parameter"))
          names.add(param.getAttribute("Name")!);
      }
      for (const w of wires)
        for (const c of all(w, "NameCon").filter((c) => id(c) === id(p)))
          names.add(c.getAttribute("Name")!);
      return [
        id(p),
        [...names]
          .filter((n) => !metadata(n))
          .map((name) => ({ name, out: output(id(p), name) })),
      ];
    }),
  );
  const sourceForPin = (uid: string, pin: string) => {
    const links = wires.filter((w) =>
      all(w, "NameCon").some(
        (c) => id(c) === uid && c.getAttribute("Name") === pin,
      ),
    );
    const sources = links.flatMap((w) =>
      all(w, "NameCon").filter(
        (c) => id(c) !== uid && output(id(c), c.getAttribute("Name") || ""),
      ),
    );
    const label = links
      .flatMap((w) => all(w, "IdentCon"))
      .map((c) => accesses.get(id(c)) || "")
      .join(" ");
    const branchLabels = sources.flatMap((c) =>
      wires
        .filter((w) =>
          all(w, "NameCon").some(
            (n) => id(n) === id(c) && n.getAttribute("Name") === "operand",
          ),
        )
        .flatMap((w) => all(w, "IdentCon"))
        .map((a) => accesses.get(id(a)) || ""),
    );
    return {
      label,
      branch: sources.length > 0,
      lines: Math.max(1, ...branchLabels.map((s) => lineCount(s))),
      pulse: sources.some((c) =>
        ["PContact", "NContact"].includes(
          kind(parts.find((p) => id(p) === id(c))!),
        ),
      ),
    };
  };
  const pinOffsets = new Map<string, Map<string, number>>();
  for (const part of parts) {
    const offsets = new Map<string, number>();
    for (const out of [false, true]) {
      let offset = 0,
        previousLines = 1,
        previousPulse = false;
      const side = pins.get(id(part))!.filter((p) => p.out === out);
      side.forEach((pin, i) => {
        const source = sourceForPin(id(part), pin.name);
        if (i)
          offset += Math.max(
            rowGap,
            previousLines * lineHeight + 7,
            source.branch
              ? source.lines * lineHeight + 24
              : lineCount(source.label) * lineHeight +
                  (symbols?.operand(source.label) || constants.has(source.label)
                    ? 15
                    : 5),
            previousPulse && source.branch ? 54 : 0,
          );
        if (kind(part) === "Sr" && pin.name === "r1")
          offset = Math.max(offset, 3 * rowGap);
        if (kind(part) === "Add" && pin.name === "out")
          offset = Math.max(offset, rowGap);
        offsets.set(pin.name, offset);
        previousLines = Math.max(1, lineCount(source.label));
        previousPulse = source.pulse;
      });
    }
    pinOffsets.set(id(part), offsets);
  }
  // Reserve the complete incoming ladder branch, including OR inputs and
  // pulse memory labels, before placing the next input of a function box.
  const branchSpan = (
    uid: string,
    name: string,
    seen = new Set<string>(),
  ): { top: number; bottom: number } => {
    const key = uid + ":" + name;
    if (seen.has(key)) return { top: 0, bottom: 0 };
    const visited = new Set(seen).add(key);
    const source = sourceForPin(uid, name);
    let top = source.label
      ? 10 +
        (symbols?.operand(source.label) || constants.has(source.label) ? 14 : 0)
      : 0;
    let bottom = source.label ? 7 + (lineCount(source.label) - 1) * 13 : 0;
    for (const w of wires.filter((w) =>
      all(w, "NameCon").some(
        (c) => id(c) === uid && c.getAttribute("Name") === name,
      ),
    )) {
      for (const c of all(w, "NameCon").filter(
        (c) => id(c) !== uid && output(id(c), c.getAttribute("Name")!),
      )) {
        const part = parts.find((p) => id(p) === id(c));
        if (!part) continue;
        if (["Contact", "PContact", "NContact"].includes(kind(part))) {
          for (const labelWire of wires.filter((w) =>
            all(w, "NameCon").some(
              (c) =>
                id(c) === id(part) && metadata(c.getAttribute("Name") || ""),
            ),
          )) {
            const value =
              accesses.get(id(all(labelWire, "IdentCon")[0] || part)) || "";
            const bit = all(labelWire, "NameCon").some(
              (c) => c.getAttribute("Name") === "bit",
            );
            if (bit)
              bottom = Math.max(
                bottom,
                26 +
                  (lineCount(value) - 1) * lineHeight +
                  (symbols?.operand(value) ? 13 : 0),
              );
            else
              top = Math.max(
                top,
                14 + lineCount(value) * 13 + (symbols?.operand(value) ? 15 : 0),
              );
          }
        } else if (kind(part) === "O") {
          const outputOffset =
            pinOffsets.get(id(part))?.get(c.getAttribute("Name")!) || 0;
          for (const pin of pins.get(id(part))!.filter((p) => !p.out)) {
            const span = branchSpan(id(part), pin.name, visited);
            const delta =
              (pinOffsets.get(id(part))?.get(pin.name) || 0) - outputOffset;
            top = Math.max(top, span.top - delta);
            bottom = Math.max(bottom, span.bottom + delta);
          }
        }
      }
    }
    return { top, bottom };
  };
  for (let pass = 0; pass < parts.length; pass++) {
    let changed = false;
    for (const part of parts)
      for (const out of [false, true]) {
        const side = pins.get(id(part))!.filter((p) => p.out === out);
        let previous = 0;
        for (let i = 1; i < side.length; i++) {
          const before = branchSpan(id(part), side[i - 1].name),
            after = branchSpan(id(part), side[i].name);
          const offsets = pinOffsets.get(id(part))!;
          const beforeBottom =
            kind(part) !== "O" &&
            sourceForPin(id(part), side[i - 1].name).branch &&
            !sourceForPin(id(part), side[i].name).branch
              ? 0
              : before.bottom;
          const current = Math.max(
            offsets.get(side[i].name)!,
            previous + Math.max(rowGap, beforeBottom + after.top + 8),
          );
          if (current !== offsets.get(side[i].name)) changed = true;
          offsets.set(side[i].name, current);
          previous = current;
        }
      }
    if (!changed) break;
  }
  const boxWidth = (uid: string) => {
    const p = parts.find((p) => id(p) === uid)!;
    if (simpleKinds.includes(kind(p)) || kind(p) === "O") return symbolWidth;
    const list = pins.get(uid)!;
    const left = Math.max(
      0,
      ...list.filter((p) => !p.out).map((p) => Math.min(38, p.name.length + 2)),
    );
    const right = Math.max(
      0,
      ...list.filter((p) => p.out).map((p) => Math.min(38, p.name.length + 2)),
    );
    const title = all(p, "CallInfo")[0]?.getAttribute("Name") || kind(p);
    return Math.max(
      158,
      (left + right) * 7.3 + 24,
      Math.min(38, title.length) * 8 + 20,
    );
  };
  const pitch = Math.max(
    120,
    ...[...pinOffsets.values()].map(
      (offsets) => 44 + Math.max(0, ...offsets.values()) + 80,
    ),
  );
  const levels = new Map(parts.map((p) => [id(p), 0]));
  for (let i = 0; i < parts.length; i++)
    for (const w of wires) {
      const con = all(w, "NameCon");
      const src = con.find((c) => output(id(c), c.getAttribute("Name")!));
      if (src)
        for (const target of con.filter((c) => c !== src && levels.has(id(c))))
          levels.set(
            id(target),
            Math.max(
              levels.get(id(target))!,
              Math.min(parts.length, (levels.get(id(src)) || 0) + 1),
            ),
          );
    }
  const incoming = (uid: string) =>
    wires.flatMap((w) => {
      const con = all(w, "NameCon").filter(
        (c) => !metadata(c.getAttribute("Name") || ""),
      );
      return con.some(
        (c) => id(c) === uid && !output(uid, c.getAttribute("Name")!),
      )
        ? con.filter(
            (c) => id(c) !== uid && output(id(c), c.getAttribute("Name")!),
          )
        : [];
    });
  const outgoing = (uid: string) =>
    wires.flatMap((w) => {
      const con = all(w, "NameCon").filter(
        (c) => !metadata(c.getAttribute("Name") || ""),
      );
      return con.some(
        (c) => id(c) === uid && output(uid, c.getAttribute("Name")!),
      )
        ? con.filter(
            (c) => id(c) !== uid && !output(id(c), c.getAttribute("Name")!),
          )
        : [];
    });
  const splitLeg = (uid: string) => {
    const seen = new Set<string>();
    while (!seen.has(uid)) {
      seen.add(uid);
      const sources = incoming(uid);
      if (sources.length !== 1) break;
      const source = id(sources[0]);
      const part = parts.find((p) => id(p) === source);
      if (!part || !simpleKinds.includes(kind(part))) break;
      const targets = outgoing(source);
      if (targets.length > 1)
        return { source, primary: id(targets[0]) === uid };
      uid = source;
    }
  };
  // The ends of parallel MOVE branches share a column even when
  // one branch has a contact and the neighbouring branch has none.
  const moveColumns = new Map<string, string[]>();
  for (const part of parts.filter(
    (p) => kind(p) === "Move" && !outgoing(id(p)).length,
  )) {
    const leg = splitLeg(id(part));
    if (!leg) continue;
    const group = moveColumns.get(leg.source) || [];
    group.push(id(part));
    moveColumns.set(leg.source, group);
  }
  for (const group of moveColumns.values()) {
    const level = Math.max(...group.map((uid) => levels.get(uid)!));
    for (const uid of group) levels.set(uid, level);
  }
  const columns = Math.max(0, ...levels.values()) + 1;
  const openPinValue = (uid: string, pin: string) => {
    if (output(uid, pin)) return undefined;
    const part = parts.find((p) => id(p) === uid);
    const call = part && all(part, "CallInfo")[0];
    return (
      call &&
      symbols?.defaultInput(
        call.getAttribute("Name") || "",
        call.getAttribute("BlockType") || "",
        pin,
      )
    );
  };
  const operands = new Map<string, { pin: string; value: string }[]>();
  for (const wire of wires) {
    const access = all(wire, "IdentCon")[0];
    const open = all(wire, "OpenCon").length > 0;
    if (!access && !open) continue;
    for (const connector of all(wire, "NameCon")) {
      const uid = id(connector);
      const pin = connector.getAttribute("Name")!;
      const value = access
        ? accesses.get(id(access)) || "?"
        : openPinValue(uid, pin) || "○";
      const labels = operands.get(uid) || [];
      labels.push({ pin, value });
      operands.set(uid, labels);
    }
  }
  const extents = (part: Element) => {
    const uid = id(part);
    const k = kind(part);
    const width = boxWidth(uid);
    let left = 0,
      right = width;
    if (k === "O") return { left, right: 26 };
    for (const label of operands.get(uid) || []) {
      const w = Math.max(
        operandWidth(label.value),
        labelWidth(symbols?.operand(label.value) || "") + 8,
      );
      if (metadata(label.pin)) {
        const center = simpleKinds.includes(k) ? symbolCenter : width / 2;
        left = Math.max(left, w / 2 - center);
        right = Math.max(right, center + w / 2);
      } else if (output(uid, label.pin))
        right = Math.max(right, width + pinLabelOffset + w);
      else left = Math.max(left, pinLabelOffset + w);
    }
    const instance = all(part, "Instance")[0];
    if (instance) {
      const half = operandWidth(symbol(instance)) / 2;
      left = Math.max(left, half - width / 2);
      right = Math.max(right, width / 2 + half);
    }
    return { left, right };
  };
  const columnX: number[] = [];
  let edge = railX + 14;
  for (let level = 0; level < columns; level++) {
    const group = parts.filter((p) => levels.get(id(p)) === level).map(extents);
    columnX[level] = edge + Math.max(0, ...group.map((p) => p.left));
    edge = columnX[level] + Math.max(0, ...group.map((p) => p.right)) + 34;
  }
  const positions = new Map<string, { x: number; y: number }>();
  const rows = new Map<number, number>();
  for (const p of parts) {
    const level = levels.get(id(p))!;
    const row = rows.get(level) || 0;
    rows.set(level, row + 1);
    positions.set(id(p), { x: columnX[level], y: 34 + row * 78 });
  }
  const pinRow = (uid: string, name: string) =>
    simpleKinds.includes(kind(parts.find((p) => id(p) === uid)!))
      ? 0
      : (pinOffsets.get(uid)?.get(name) || 0) / rowGap;
  // Keep terminal coils on the shared right edge. Coils at the end of
  // a secondary fan-out leg stay near that branch's last instruction.
  const terminalCoils = parts.filter(
    (p) => coilKinds.includes(kind(p)) && !outgoing(id(p)).length,
  );
  const coilEnds = new Set(terminalCoils.map(id));
  const rightCoils = terminalCoils.filter(
    (p) => splitLeg(id(p))?.primary !== false,
  );
  const rightCoilIds = new Set(rightCoils.map(id));
  const rightCoilX = Math.max(
    825,
    ...rightCoils.map((p) => positions.get(id(p))!.x),
  );
  for (const part of rightCoils) positions.get(id(part))!.x = rightCoilX;
  const contentRight = Math.max(
    0,
    ...parts.map((p) => positions.get(id(p))!.x + extents(p).right),
  );
  const width = Math.max(
    990,
    Math.ceil(contentRight + 42),
    rightCoils.length ? rightCoilX + symbolWidth + 60 : 0,
  );
  const rungEnd = width - 24;
  // Inline chains belong to their destination pin. Move the whole chain when
  // making room; leaving a single contact behind draws wires through other FBs.
  const attachment = new Map<string, { parent: string; offset: number }>();
  for (const part of parts) {
    const uid = id(part),
      k = kind(part),
      targets = outgoing(uid);
    if (
      ["Contact", "PContact", "NContact", "O"].includes(k) &&
      targets.length === 1
    ) {
      const t = targets[0];
      attachment.set(uid, {
        parent: id(t),
        offset: pinRow(id(t), t.getAttribute("Name")!) * rowGap,
      });
    } else if (["Coil", "SCoil", "RCoil"].includes(k)) {
      const sources = incoming(uid);
      if (
        sources.length === 1 &&
        !["Contact", "PContact", "NContact", "O"].includes(
          kind(parts.find((p) => id(p) === id(sources[0]))!),
        ) &&
        outgoing(id(sources[0])).length === 1
      ) {
        const t = sources[0];
        attachment.set(uid, {
          parent: id(t),
          offset: pinRow(id(t), t.getAttribute("Name")!) * rowGap,
        });
      }
    }
  }
  const anchor = (uid: string) => {
    const seen = new Set<string>();
    let offset = 0;
    while (attachment.has(uid) && !seen.has(uid)) {
      seen.add(uid);
      const a = attachment.get(uid)!;
      offset += a.offset;
      uid = a.parent;
    }
    return { uid, offset };
  };
  const syncPositions = () => {
    for (const part of parts) {
      const a = anchor(id(part));
      if (a.uid !== id(part))
        positions.get(id(part))!.y = positions.get(a.uid)!.y + a.offset;
    }
  };
  const boxTop = 14;
  const boxBottom = (uid: string) =>
    56 +
    Math.max(0, ...pins.get(uid)!.map((pin) => pinRow(uid, pin.name) * rowGap));
  const footprint = (part: Element) => {
    const uid = id(part),
      pos = positions.get(uid)!,
      k = kind(part);
    if (simpleKinds.includes(k)) {
      const labels = wires
        .filter((w) =>
          all(w, "NameCon").some(
            (c) => id(c) === uid && metadata(c.getAttribute("Name") || ""),
          ),
        )
        .flatMap((w) =>
          all(w, "IdentCon").map((c) => accesses.get(id(c)) || ""),
        );
      const n = Math.max(1, ...labels.map(lineCount));
      return {
        top: pos.y + 30 - n * lineHeight - 16,
        bottom:
          pos.y +
          (["PContact", "NContact"].includes(k) ? 63 + n * lineHeight : 55),
      };
    }
    const instance = all(part, "Instance")[0];
    const head = instance
      ? lineCount(symbol(instance)) * lineHeight + 44
      : all(part, "CallInfo").length
        ? 13
        : -boxTop;
    return { top: pos.y - head, bottom: pos.y + boxBottom(uid) };
  };
  syncPositions();
  const topShift = Math.max(
    0,
    12 - Math.min(12, ...parts.map((p) => footprint(p).top)),
  );
  for (const p of parts)
    if (anchor(id(p)).uid === id(p)) positions.get(id(p))!.y += topShift;
  syncPositions();
  for (let pass = 0; pass < parts.length * 2; pass++) {
    let moved = false;
    for (let level = 0; level < columns; level++) {
      const group = parts
        .filter((p) => levels.get(id(p)) === level && kind(p) !== "O")
        .sort((a, b) => positions.get(id(a))!.y - positions.get(id(b))!.y);
      for (let i = 1; i < group.length; i++) {
        const before = group[i - 1],
          after = group[i];
        const gap = footprint(before).bottom + 10 - footprint(after).top;
        const a = anchor(id(after)),
          b = anchor(id(before));
        if (gap > 0 && a.uid !== b.uid) {
          positions.get(a.uid)!.y += gap;
          syncPositions();
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  const height = Math.max(
    100,
    ...[...positions.values()].map((p) => p.y + pitch - 30),
  );
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.style.width = width + "px";
  svg.style.maxWidth = "none";
  svg.style.height = "auto";
  svg.style.minWidth = "0";
  svg.setAttribute("height", String(height));
  svg.setAttribute("role", referenceLink ? "group" : "img");
  svg.setAttribute("aria-label", "LAD network connections");
  let owner = "";
  const wirePaths: {
    e: Element;
    start: DiagramPoint;
    end: DiagramPoint;
    owner: string;
    wire: string;
  }[] = [];
  const tails: { uid: string; start: DiagramPoint; endX: number }[] = [];
  let wireId = "";
  const add = (
    tag: string,
    attrs: Record<string, string | number>,
    text = "",
  ) => {
    const e = document.createElementNS(svg.namespaceURI, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    e.textContent = text;
    if (owner) e.setAttribute("data-owner", owner);
    svg.append(e);
    return e;
  };
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    fixed = false,
  ) => {
    const e = add("path", {
      d: `M${x1} ${y1} H${(x1 + x2) / 2} V${y2} H${x2}`,
      class: fixed ? "tia-symbol-line" : "tia-wire",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.5,
    });
    if (!fixed)
      wirePaths.push({
        e,
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        owner,
        wire: wireId,
      });
    return e;
  };
  const text = (
    x: number,
    y: number,
    value: string,
    anchor = "start",
    cls = "",
    below = false,
  ) => {
    const label =
      cls === "tia-operand"
        ? value
        : value.length > 38
          ? value.slice(0, 17) + "…" + value.slice(-20)
          : value;
    const e = add(
      "text",
      { x, y, "text-anchor": anchor, "font-size": 11, class: cls },
      cls === "tia-operand" ? "" : label,
    );
    if (cls === "tia-operand") {
      const lines = operandLines(value);
      const top =
        anchor === "middle" && !below ? y - (lines.length - 1) * lineHeight : y;
      lines.forEach((line, i) => {
        const span = document.createElementNS(svg.namespaceURI, "tspan");
        span.setAttribute("x", String(x));
        span.setAttribute("y", String(top + i * lineHeight));
        span.textContent = line;
        e.append(span);
      });
    }
    if (
      cls === "tia-operand" &&
      ((safety && value.startsWith("#")) || symbols?.safetyOperand(value))
    ) {
      const spans = [...e.querySelectorAll("tspan")];
      const top = Number(spans[0]?.getAttribute("y") || y) - 11;
      const w = Math.max(
        16,
        ...spans.map((s) => labelWidth(s.textContent || "") + 8),
      );
      const r = add("rect", {
        x: anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x - 4,
        y: top,
        width: w,
        height: Math.max(1, spans.length) * lineHeight + 3,
        fill: "#ffff49",
        class: "tia-safety-operand",
      });
      svg.insertBefore(r, e);
      e.classList.add("tia-safety-symbol");
    }
    if (cls === "tia-operand" || label !== value) {
      const title = document.createElementNS(svg.namespaceURI, "title");
      title.textContent = value;
      e.append(title);
    }
    return e;
  };
  const point = (uid: string, name: string) => {
    const pos = positions.get(uid);
    const pin = pins.get(uid)?.find((p) => p.name === name);
    if (!pos || !pin) return null;
    const row = pinRow(uid, name);
    return {
      x:
        kind(parts.find((p) => id(p) === uid)!) === "O"
          ? pos.x + 13
          : pos.x + (pin.out ? boxWidth(uid) : 0),
      y: pos.y + 44 + row * rowGap,
      out: pin.out,
    };
  };
  const rail = line(railX, 15, railX, height - 20, true);
  const linkOperand = (label: Element, accessId: string, operand: string) => {
    if (!referenceLink || operand === "?" || !variables.has(accessId)) return;
    label.classList.add("tia-reference-link");
    label.setAttribute("role", "button");
    label.setAttribute("tabindex", "0");
    label.setAttribute("aria-label", "Cross-reference: " + operand);
    label.addEventListener("click", () => referenceLink(operand));
    label.addEventListener("keydown", (event) => {
      const { key } = event as KeyboardEvent;
      if (key !== "Enter" && key !== " ") return;
      event.preventDefault();
      referenceLink(operand);
    });
  };
  for (const w of wires) {
    const con = all(w, "NameCon");
    const access = all(w, "IdentCon")[0];
    if (access)
      for (const c of con) {
        owner = id(c);
        const name = c.getAttribute("Name")!;
        const pos = positions.get(id(c));
        if (!pos) continue;
        const operand = accesses.get(id(access)) || "?";
        if (metadata(name)) {
          const uid = id(c);
          const simple = simpleKinds.includes(
            kind(parts.find((p) => id(p) === uid)!),
          );
          const below = name.toLowerCase() === "bit";
          const addr = symbols?.operand(operand);
          const labelX = pos.x + (simple ? symbolCenter : boxWidth(uid) / 2);
          const labelY = pos.y + (below ? (addr ? 79 : 66) : simple ? 30 : -10);
          linkOperand(
            text(labelX, labelY, operand, "middle", "tia-operand", below),
            id(access),
            operand,
          );
          if (addr)
            text(
              labelX,
              labelY - (below ? 13 : lineCount(operand) * lineHeight + 2),
              addr,
              "middle",
              "tia-address",
            );
          continue;
        }
        const p = point(id(c), name);
        if (!p) continue;
        const constantValue = constants.get(operand);
        if (constantValue !== undefined)
          text(
            p.x + (p.out ? pinLabelOffset : -pinLabelOffset),
            p.y - 12,
            constantValue,
            p.out ? "start" : "end",
            "tia-constant-value",
          );
        line(p.x, p.y, p.x + (p.out ? 16 : -16), p.y, true);
        linkOperand(
          text(
            p.x + (p.out ? pinLabelOffset : -pinLabelOffset),
            p.y + 4,
            operand,
            p.out ? "start" : "end",
            "tia-operand",
          ),
          id(access),
          operand,
        );
        const addr = symbols?.operand(operand);
        if (addr)
          text(
            p.x + (p.out ? pinLabelOffset : -pinLabelOffset),
            p.y - 10,
            addr,
            p.out ? "start" : "end",
            "tia-address",
          );
      }
    // Open connectors have no assigned value; do not invent a live value.
    if (all(w, "OpenCon").length)
      for (const c of con) {
        owner = id(c);
        const p = point(id(c), c.getAttribute("Name")!);
        if (!p) continue;
        const def = openPinValue(id(c), c.getAttribute("Name")!);
        const label = text(
          p.x + (p.out ? pinLabelOffset : -pinLabelOffset),
          p.y + 4,
          def === undefined ? "○" : def,
          p.out ? "start" : "end",
          def === undefined ? "" : "tia-default-pin",
        );
        if (def !== undefined) {
          const t = document.createElementNS(svg.namespaceURI, "title");
          t.textContent = "Default from target interface; pin is not assigned";
          label.append(t);
        }
      }
  }
  for (const p of parts) {
    owner = id(p);
    const pos = positions.get(id(p))!;
    const k = kind(p);
    add("g", {
      "data-part": id(p),
      "data-kind": k,
      "data-layout-x": pos.x,
      "data-layout-y": pos.y,
    });
    const info = all(p, "CallInfo")[0];
    const name = info?.getAttribute("Name") || k;
    if (k === "O") continue;
    if (simpleKinds.includes(k)) {
      const x = pos.x + symbolCenter;
      const y = pos.y + 44;
      add("rect", {
        x: x - 10,
        y: y - 10,
        width: 20,
        height: 20,
        fill: "transparent",
        class: "tia-symbol-hit",
      });
      const coil = coilKinds.includes(k);
      line(pos.x, y, x - 8, y, true);
      line(x + 8, y, pos.x + symbolWidth, y, true);
      if (coil) {
        add("path", {
          d: `M${x - 5} ${y - 8} Q${x - 12} ${y} ${x - 5} ${y + 8} M${x + 5} ${y - 8} Q${x + 12} ${y} ${x + 5} ${y + 8}`,
          fill: "none",
          stroke: "currentColor",
          "stroke-width": 1.7,
        });
        if (k !== "Coil") text(x, y + 4, k === "SCoil" ? "S" : "R", "middle");
        if (coilEnds.has(id(p))) {
          const end = rightCoilIds.has(id(p))
            ? rungEnd
            : pos.x + symbolWidth + 20;
          tails.push({
            uid: id(p),
            start: { x: pos.x + symbolWidth, y },
            endX: end,
          });
        }
      } else {
        line(x - 8, y - 7, x - 8, y + 7, true);
        line(x + 8, y - 7, x + 8, y + 7, true);
        if (k === "PContact" || k === "NContact")
          text(x, y + 4, k === "PContact" ? "P" : "N", "middle");
        if (all(p, "Negated").some((e) => e.getAttribute("Name") === "operand"))
          add("path", {
            d: `M${x - 8} ${y + 8} L${x + 8} ${y - 8}`,
            stroke: "currentColor",
            "stroke-width": 1.5,
          });
      }
      continue;
    }
    const list = pins.get(id(p))!;
    const h = boxBottom(id(p)) - boxTop;
    add("rect", {
      x: pos.x,
      y: pos.y + boxTop,
      width: boxWidth(id(p)),
      height: h,
      fill: "var(--tia-box, #e1e5ed)",
    });
    add("rect", {
      x: pos.x,
      y: pos.y + boxTop,
      width: boxWidth(id(p)),
      height: 18,
      fill: safety
        ? "var(--tia-safety-title, #fff45c)"
        : "var(--tia-title, #cbd1df)",
    });
    text(
      pos.x + boxWidth(id(p)) / 2,
      pos.y + boxTop + 13,
      name === "Sr"
        ? "SR"
        : name === "Add"
          ? "ADD"
          : name === "Move"
            ? "MOVE"
            : name,
      "middle",
      "tia-instruction",
    );
    const instance = all(p, "Instance")[0];
    const callAddress =
      info && symbols?.block(name, info.getAttribute("BlockType") || "");
    const instanceName = instance && symbol(instance);
    const instanceAddress =
      instanceName &&
      !instanceName.startsWith("#") &&
      symbols?.block(instanceName, "DB");
    if (callAddress)
      text(
        pos.x + boxWidth(id(p)) / 2,
        pos.y - 10,
        callAddress,
        "middle",
        "tia-address",
      );
    if (instanceAddress)
      text(
        pos.x + boxWidth(id(p)) / 2,
        pos.y - (callAddress ? 33 : 15) - lineCount(instanceName || "") * 13,
        instanceAddress,
        "middle",
        "tia-address",
      );
    if (instance)
      text(
        pos.x + boxWidth(id(p)) / 2,
        pos.y - (callAddress ? 28 : 10),
        symbol(instance),
        "middle",
        "tia-operand",
      );
    for (const pin of list) {
      const pt = point(id(p), pin.name)!;
      text(
        pt.x + (pin.out ? -5 : 5),
        pt.y + 4,
        (all(p, "Parameter")
          .find((e) => e.getAttribute("Name") === pin.name)
          ?.getAttribute("Section") === "InOut" ||
        (k === "DeviceStates" && pin.name === "STATE")
          ? "↔ "
          : "") +
          (info && !/^(en|eno)$/i.test(pin.name)
            ? pin.name
            : pin.name === "Ret_Val"
              ? pin.name
              : pin.name.toUpperCase()),
        pin.out ? "end" : "start",
      );
    }
    if (info && callLink) {
      const activate = callLink(name, info.getAttribute("BlockType") || "");
      const hit = add("rect", {
        x: pos.x,
        y: pos.y + boxTop,
        width: boxWidth(id(p)),
        height: h,
        fill: "transparent",
        class: activate ? "tia-call-link" : "tia-call-unresolved",
      });
      const title = document.createElementNS(svg.namespaceURI, "title");
      title.textContent = activate
        ? `${name} · double-click / Enter`
        : `${name} · target not available or ambiguous`;
      hit.append(title);
      if (activate) {
        hit.setAttribute("role", "link");
        hit.setAttribute("tabindex", "0");
        hit.setAttribute("aria-label", name);
        hit.setAttribute("data-block-call", name);
        hit.addEventListener("dblclick", activate);
        hit.addEventListener("keydown", (event) => {
          const e = event as KeyboardEvent;
          if (e.key === "Enter") {
            e.preventDefault();
            activate();
          }
        });
      }
    }

    // TIA displays the enable/Q continuation even when no output operand is assigned.
    const continuation = list.find(
      (pin) => pin.out && /^(eno|q)$/i.test(pin.name),
    );
    if (
      continuation &&
      !wires.some((w) =>
        all(w, "NameCon").some(
          (c) =>
            id(c) === id(p) && c.getAttribute("Name") === continuation.name,
        ),
      )
    ) {
      const pt = point(id(p), continuation.name)!;
      const topRow = Math.min(...[...positions.values()].map((pos) => pos.y));
      const end =
        rightCoils.length === 0 && pos.y === topRow && !outgoing(id(p)).length
          ? rungEnd
          : Math.min(rungEnd, pt.x + 44);
      tails.push({ uid: id(p), start: pt, endX: end });
    }
  }
  for (const part of parts.filter((p) => kind(p) !== "O")) {
    owner = id(part);
    for (const pin of pins.get(id(part))!) {
      const pt = point(id(part), pin.name)!;
      add("rect", {
        x: pt.x - 2,
        y: pt.y - 4,
        width: 4,
        height: 8,
        fill: "transparent",
        class: "tia-pin-hit",
      });
    }
  }
  owner = "";
  // Measure actual font glyphs before routing. This also works while tiaView
  // is built off-document (imports, tabs and tests), without a visible reflow.
  const measure = html("div");
  measure.className = "tia-view";
  measure.style.cssText =
    "position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  const measureNetwork = html("div");
  measureNetwork.className = "tia-network";
  measureNetwork.append(svg);
  measure.append(measureNetwork);
  document.body.append(measure);
  const shapes = [
    ...svg.querySelectorAll<SVGGraphicsElement>("text, rect"),
  ].filter(
    (e) =>
      e.tagName === "text" ||
      e.getAttribute("fill")?.startsWith("var(--tia-box") ||
      e.classList.contains("tia-symbol-hit") ||
      e.classList.contains("tia-pin-hit"),
  );
  const bounds = new Map(shapes.map((e) => [e, e.getBBox()]));
  const shifts = new Map(parts.map((p) => [id(p), 0]));
  const rect = (e: SVGGraphicsElement): DiagramObstacle => {
    const b = bounds.get(e)!;
    return {
      x: b.x,
      y: b.y + (shifts.get(e.getAttribute("data-owner") || "") || 0),
      width: b.width,
      height: b.height,
    };
  };
  const intersects = (a: DiagramObstacle, b: DiagramObstacle) =>
    a.x + 1 < b.x + b.width &&
    b.x + 1 < a.x + a.width &&
    a.y + 1 < b.y + b.height &&
    b.y + 1 < a.y + a.height;
  // A final measured packing pass catches cross-column operands and generic
  // instruction labels that cannot be estimated from pin counts alone.
  for (let pass = 0; pass < parts.length * 3; pass++) {
    let moved = false;
    for (let i = 0; i < shapes.length; i++)
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i],
          b = shapes[j],
          au = a.getAttribute("data-owner")!,
          bu = b.getAttribute("data-owner")!;
        if (!au || !bu || au === bu) continue;
        const ar = rect(a),
          br = rect(b);
        if (!intersects(ar, br)) continue;
        const later =
          positions.get(au)!.y + shifts.get(au)! >
          positions.get(bu)!.y + shifts.get(bu)!
            ? au
            : bu;
        const gap =
          later === bu
            ? ar.y + ar.height + 12 - br.y
            : br.y + br.height + 12 - ar.y;
        shifts.set(later, shifts.get(later)! + gap);
        moved = true;
      }
    if (!moved) break;
  }
  for (const p of parts) {
    const uid = id(p),
      dy = shifts.get(uid)!;
    if (dy)
      for (const e of svg.querySelectorAll(`[data-owner="${uid}"]`))
        e.setAttribute("transform", `translate(0 ${dy})`);
    positions.get(uid)!.y += dy;
    svg
      .querySelector(`[data-part="${uid}"]`)
      ?.setAttribute("data-layout-y", String(positions.get(uid)!.y));
  }
  const obstacles: DiagramObstacle[] = shapes
    .filter((e) => !e.classList.contains("tia-pin-hit"))
    .map((e) => {
      const b = rect(e),
        pad = e.tagName === "text" ? 3 : 0;
      return {
        x: b.x - pad,
        y: b.y - pad,
        width: b.width + 2 * pad,
        height: b.height + 2 * pad,
      };
    });
  for (const { uid, start, endX } of tails) {
    const { x } = start;
    const y = start.y + shifts.get(uid)!;
    // A rung end is decorative. Stop before a nearby label or block
    // instead of routing the cap through a neighbour.
    const end = Math.min(
      endX,
      ...obstacles
        .filter(
          (r) =>
            r.x + r.width > x + 0.1 && r.y < y + 4 && r.y + r.height > y - 4,
        )
        .map((r) => r.x - 8),
    );
    if (end <= x + 6) continue;
    owner = uid;
    line(x, y, end, y);
    line(end, y - 3, end, y + 3, true);
  }
  owner = "";
  const junctionX = (preferred: number, top: number, bottom: number) => {
    const candidates = [
      preferred,
      ...obstacles.flatMap((r) => [r.x - 12, r.x + r.width + 12]),
    ]
      .filter((x) => x > 40)
      .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
    return (
      candidates.find(
        (x) =>
          !obstacles.some(
            (r) =>
              x > r.x &&
              x < r.x + r.width &&
              bottom >= r.y &&
              top <= r.y + r.height,
          ),
      ) ?? preferred
    );
  };
  for (const p of parts.filter((p) => kind(p) === "O")) {
    const pos = positions.get(id(p))!,
      ps = pins.get(id(p))!.map((pin) => point(id(p), pin.name)!);
    pos.x =
      junctionX(
        pos.x + 13,
        Math.min(...ps.map((p) => p.y)),
        Math.max(...ps.map((p) => p.y)),
      ) - 13;
    svg
      .querySelector(`[data-part="${id(p)}"]`)
      ?.setAttribute("data-layout-x", String(pos.x));
  }
  owner = "";
  for (const w of wires) {
    wireId = id(w);
    const con = all(w, "NameCon");
    const points = con
      .map((c) => point(id(c), c.getAttribute("Name")!))
      .filter((p) => p !== null);
    if (all(w, "Powerrail").length)
      for (const p of points) line(railX, p.y, p.x, p.y);
    else if (points.length > 2) {
      const src = points.find((p) => p.out) || points[0];
      const others = points.filter((p) => p !== src);
      const bus = junctionX(
        Math.min(...others.map((p) => p.x)) - 35,
        Math.min(src.y, ...others.map((p) => p.y)),
        Math.max(src.y, ...others.map((p) => p.y)),
      );
      line(src.x, src.y, bus, src.y);
      line(
        bus,
        Math.min(src.y, ...others.map((p) => p.y)),
        bus,
        Math.max(src.y, ...others.map((p) => p.y)),
      );
      for (const p of others) {
        line(bus, p.y, p.x, p.y);
        add("circle", { cx: bus, cy: p.y, r: 2.3, fill: "currentColor" });
      }
    } else if (points.length > 1)
      line(points[0].x, points[0].y, points[1].x, points[1].y);
  }
  for (const p of parts.filter((p) => kind(p) === "O")) {
    const pos = positions.get(id(p))!;
    owner = "";
    wireId = "junction-" + id(p);
    {
      const ps = pins
        .get(id(p))!
        .map((pin) => point(id(p), pin.name))
        .filter((pt) => pt !== null);
      const bus = pos.x + 13;
      for (const pt of ps) line(pt.x, pt.y, bus, pt.y);
      if (ps.length) {
        line(
          bus,
          Math.min(...ps.map((pt) => pt.y)),
          bus,
          Math.max(...ps.map((pt) => pt.y)),
        );
        for (const pt of ps)
          add("circle", { cx: bus, cy: pt.y, r: 2.3, fill: "currentColor" });
      }
    }
  }
  const netGroups = new Map<string, string>();
  const netGroup = (key: string): string => {
    let next = netGroups.get(key);
    while (next && next !== key) {
      key = next;
      next = netGroups.get(key);
    }
    return key;
  };
  for (const part of parts.filter((p) => kind(p) === "O")) {
    const group = "junction-" + id(part);
    for (const w of wires.filter((w) =>
      all(w, "NameCon").some((c) => id(c) === id(part)),
    ))
      netGroups.set(netGroup(id(w)), group);
  }
  for (const w of wires.filter((w) => all(w, "Powerrail").length))
    netGroups.set(netGroup(id(w)), "powerrail");
  const route = diagramRouter(
    obstacles,
    wirePaths.flatMap((p) => [p.start, p.end]),
  );
  let bottom = Math.max(70, ...obstacles.map((r) => r.y + r.height)) + 24;
  let right = Math.max(width, ...obstacles.map((r) => r.x + r.width + 24));
  const routed: {
    path: (typeof wirePaths)[number];
    points: DiagramPoint[];
    group: string;
  }[] = [];
  for (const path of wirePaths) {
    const group = netGroup(path.wire || "continuation-" + path.owner);
    const occupied: DiagramSegment[] = routed
      .filter((p) => p.group !== group)
      .flatMap((p) =>
        p.points.slice(1).map((end, i) => ({ start: p.points[i], end })),
      );
    const points = route(path.start, path.end, occupied);
    if (!points.length) {
      path.e.setAttribute("data-route-unresolved", "true");
      continue;
    }
    path.e.setAttribute("data-wire", group);
    routed.push({ path, points, group });
    path.e.setAttribute("data-route", JSON.stringify(points));
    path.e.setAttribute(
      "d",
      points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" "),
    );
    bottom = Math.max(bottom, ...points.map((p) => p.y + 24));
    right = Math.max(right, ...points.map((p) => p.x + 24));
  }
  // Unconnected nets may cross in a non-planar ladder graph. Draw a jumper
  // instead of making the crossing look like an electrical junction.
  for (const entry of routed) {
    const bridges: DiagramPoint[] = [];
    let d = `M${entry.points[0].x} ${entry.points[0].y}`;
    for (let i = 1; i < entry.points.length; i++) {
      const a = entry.points[i - 1],
        b = entry.points[i];
      const crosses: number[] = [];
      if (a.y === b.y)
        for (const other of routed.filter((p) => p.group !== entry.group))
          for (let j = 1; j < other.points.length; j++) {
            const c = other.points[j - 1],
              e = other.points[j];
            if (
              c.x === e.x &&
              c.x > Math.min(a.x, b.x) + 4 &&
              c.x < Math.max(a.x, b.x) - 4 &&
              a.y > Math.min(c.y, e.y) + 4 &&
              a.y < Math.max(c.y, e.y) - 4
            )
              crosses.push(c.x);
          }
      const direction = Math.sign(b.x - a.x);
      for (const x of [...new Set(crosses)].sort(
        (x, y) => (x - y) * direction,
      )) {
        const y = a.y,
          r = 4;
        const freeAbove = !obstacles.some(
          (o) =>
            x + r > o.x &&
            x - r < o.x + o.width &&
            y > o.y &&
            y - 8 < o.y + o.height,
        );
        const offset = freeAbove ? -7 : 7;
        const arc = `M${x - direction * r} ${y} Q${x} ${y + offset} ${x + direction * r} ${y}`;
        d += ` L${x - direction * r} ${y} Q${x} ${y + offset} ${x + direction * r} ${y}`;
        owner = "";
        add("path", {
          d: arc,
          fill: "none",
          stroke: "var(--surface, #fff)",
          "stroke-width": 5,
          class: "tia-wire-bridge-mask",
          "pointer-events": "none",
        });
        const bridge = add("path", {
          d: arc,
          fill: "none",
          stroke: "currentColor",
          "stroke-width": 1.5,
          class: "tia-wire-bridge",
          "pointer-events": "none",
        });
        const title = document.createElementNS(svg.namespaceURI, "title");
        title.textContent = "Crossing wires · no connection";
        bridge.append(title);
        bridges.push({ x, y });
      }
      d += ` L${b.x} ${b.y}`;
    }
    entry.path.e.setAttribute("d", d);
    if (bridges.length)
      entry.path.e.setAttribute("data-bridges", JSON.stringify(bridges));
  }
  rail.setAttribute("d", `M${railX} 15 V${bottom - 16}`);
  svg.setAttribute("width", String(right));
  svg.setAttribute("height", String(bottom));
  svg.setAttribute("viewBox", `0 0 ${right} ${bottom}`);
  svg.style.width = right + "px";
  measure.remove();
  const scroll = html("div");
  scroll.className = "tia-network";
  scroll.append(svg);
  return scroll;
}

export type TiaReference = {
  symbol: string;
  docId: string;
  nodeId: string;
  block: string;
  network: number;
  usage: string;
};
export function tiaReferences(project: Project) {
  const references: TiaReference[] = [];
  let skipped = 0;
  for (const doc of project.documents) {
    if (!/\.xml$/i.test(doc.name) || !doc.text) continue;
    try {
      const { root, name } = parseTia(doc.text);
      const units = all(root, "SW.Blocks.CompileUnit");
      units.forEach((unit, index) => {
        const add = (symbol: string, usage: string) => {
          if (symbol)
            references.push({
              symbol,
              usage,
              docId: doc.id,
              nodeId: doc.nodeId,
              block: name,
              network: index + 1,
            });
        };
        for (const call of all(unit, "CallInfo"))
          add(call.getAttribute("Name") || "", "CALL");
        for (const instance of all(unit, "Instance"))
          add(symbol(instance), "INSTANCE");
        const net = all(unit, "FlgNet")[0];
        if (!net) return;
        for (const access of Array.from(
          all(net, "Parts")[0]?.children || [],
        ).filter(
          (e) =>
            e.localName === "Access" &&
            ["LocalVariable", "GlobalVariable"].includes(
              e.getAttribute("Scope") || "",
            ),
        )) {
          const usages = new Set<string>();
          for (const wire of all(net, "Wire").filter((w) =>
            all(w, "IdentCon").some(
              (c) => c.getAttribute("UId") === access.getAttribute("UId"),
            ),
          )) {
            for (const con of all(wire, "NameCon")) {
              const part = Array.from(all(net, "Parts")[0].children).find(
                (e) => e.getAttribute("UId") === con.getAttribute("UId"),
              );
              const pin = con.getAttribute("Name") || "";
              const param =
                part &&
                all(part, "Parameter").find(
                  (e) => e.getAttribute("Name") === pin,
                );
              const section = param?.getAttribute("Section");
              const kind = part?.getAttribute("Name");
              usages.add(
                section === "InOut" ||
                  (kind === "Sr" && pin === "operand") ||
                  (kind === "DeviceStates" && pin === "STATE")
                  ? "R/W"
                  : section === "Output" ||
                      /^(out\d*|q|et|eno|ret_val)$/i.test(pin) ||
                      (kind === "Coil" && pin === "operand")
                    ? "W"
                    : section === "Input" ||
                        ["Contact", "PContact", "Add", "TON"].includes(
                          kind || "",
                        )
                      ? "R"
                      : "?",
              );
            }
          }
          add(symbol(access), [...usages].join(", ") || "?");
        }
      });
    } catch {
      skipped++;
    }
  }
  return { references, skipped };
}
export function matchingReferences(
  refs: TiaReference[],
  query: string,
  localNode?: string,
) {
  const q = query.trim().replace(/"/g, "").toLocaleLowerCase();
  if (!q) return [];
  return refs.filter(
    (r) =>
      (!q.startsWith("#") || r.nodeId === localNode) &&
      (() => {
        const s = r.symbol.replace(/"/g, "").toLocaleLowerCase();
        return s === q || s.startsWith(q + ".") || s.startsWith(q + "[");
      })(),
  );
}

function tiaDataTable(
  root: Element,
  attr: Element,
  type: string,
  name: string,
  lang: "pl" | "en",
  referenceLink?: ReferenceLink,
) {
  const ui = (en: string, pl: string) => (lang === "pl" ? pl : en);
  const interfaceBlock = ["FB", "FC", "OB"].includes(type);
  const host = html("div");
  host.className = "tia-data-grid";
  host.append(html("h3", name));
  const table = html("table");
  const head = html("thead");
  const header = html("tr");
  const columns = [
    "#",
    ui("Name", "Nazwa"),
    ui("Data type", "Typ danych"),
    type === "TAGS"
      ? ui("Address", "Adres")
      : type === "UDT" || interfaceBlock
        ? ui("Default value", "Wartość domyślna")
        : ui("Start value", "Wartość początkowa"),
    ...(type === "UDT" ? [] : ["Retain"]),
    ...(interfaceBlock
      ? [
          ui("Accessible", "Dostępne"),
          ui("Writable", "Zapis"),
          ui("Visible", "Widoczne"),
          "Setpoint",
          ui("Supervision", "Nadzór"),
          ui("Comment", "Komentarz"),
        ]
      : []),
  ];
  for (const label of columns) header.append(html("th", label));
  head.append(header);
  table.append(head);
  const body = html("tbody");
  table.append(body);
  host.append(table);
  type Row = {
    name: string;
    path: string;
    datatype: string;
    start: string;
    inferred?: boolean;
    retain: string;
    children?: Row[];
    open?: boolean;
    group?: boolean;
    load?: () => Row[];
    flags?: (boolean | undefined)[];
    comment?: string;
  };
  const defaults = (dt: string) =>
    /^bool$/i.test(dt)
      ? "false"
      : /^(w?string)(\[\d+\])?$/i.test(dt)
        ? "''"
        : /^(s?int|dint|lint|usint|uint|udint|ulint|real|lreal|byte|word|dword|lword)$/i.test(
              dt,
            )
          ? "0"
          : "";
  const retain = (e: Element, inherited = "") =>
    e.getAttribute("Remanence") || value(e, "Retain") || inherited;
  const members = (e: Element) =>
    all(e, "Member").filter(
      (m) =>
        m.parentElement?.closest("Member") === e ||
        (e.localName === "Section" && !m.parentElement?.closest("Member")),
    );
  const memberRow = (m: Element, prefix = "", inherited = ""): Row => {
    const dt = m.getAttribute("Datatype") || "";
    const key = m.getAttribute("Name") || "";
    const path = prefix + key;
    const explicit = child(m, "StartValue") || child(m, "DefaultValue");
    const row: Row = {
      name: key,
      path,
      datatype: dt,
      start: explicit ? explicit.textContent || "" : defaults(dt),
      inferred: !explicit,
      retain: retain(m, inherited),
      flags: [
        "ExternalAccessible",
        "ExternalWritable",
        "ExternalVisible",
        "SetPoint",
        "Supervision",
      ].map((key) => {
        const flag = all(
          child(m, "AttributeList") || m,
          "BooleanAttribute",
        ).find((e) => e.getAttribute("Name") === key);
        return flag ? flag.textContent === "true" : undefined;
      }),
      comment: child(m, "Comment")
        ? (
            all(child(m, "Comment")!, "MultiLanguageText").find((e) =>
              e.getAttribute("Lang")?.startsWith(lang),
            ) || all(child(m, "Comment")!, "MultiLanguageText")[0]
          )?.textContent || ""
        : "",
    };
    const children = members(m);
    if (children.length) {
      row.children = children.map((c) => memberRow(c, path + ".", row.retain));
      row.open = true;
    }
    const array = dt.match(/^Array\[(-?\d+)\.\.(-?\d+)\] of (.+)$/i);
    if (array && !children.length) {
      const lo = Number(array[1]),
        hi = Number(array[2]);
      if (Number.isSafeInteger(lo) && Number.isSafeInteger(hi) && hi >= lo)
        row.load = () => {
          const entries: Row[] = [];
          for (let i = lo; i <= hi && entries.length < 200; i++)
            entries.push({
              name: `[${i}]`,
              path: `${path}[${i}]`,
              datatype: array[3],
              start: explicit ? "" : defaults(array[3]),
              inferred: !explicit,
              retain: row.retain,
            });
          if (hi - lo >= 200)
            entries.push({
              name: ui(
                "First 200 elements shown",
                "Wyświetlono pierwsze 200 elementów",
              ),
              path,
              datatype: "",
              start: "",
              retain: "",
            });
          return entries;
        };
    }
    return row;
  };
  const rows: Row[] = [];
  if (type === "TAGS")
    for (const tag of all(root, "SW.Tags.PlcTag")) {
      const a = child(tag, "AttributeList")!;
      rows.push({
        name: value(a, "Name"),
        path: value(a, "Name"),
        datatype: value(a, "DataTypeName"),
        start: value(a, "LogicalAddress"),
        retain: retain(a),
      });
    }
  else
    for (const section of Array.from(
      all(attr, "Sections")[0]?.children || [],
    ).filter((e) => e.localName === "Section")) {
      const items = Array.from(section.children)
        .filter((e) => e.localName === "Member")
        .map((m) => memberRow(m));
      if (section.getAttribute("Name") === "None") rows.push(...items);
      else
        rows.push({
          name: section.getAttribute("Name") || "",
          path: "",
          datatype: "",
          start: "",
          retain: "",
          children: items,
          open: true,
          group: true,
        });
    }
  function render() {
    body.replaceChildren();
    let number = 0;
    function add(row: Row, depth: number) {
      const tr = html("tr");
      tr.dataset.path = row.path;
      if (row.group) tr.className = "tia-data-section";
      tr.append(html("td", String(++number)));
      const cell = html("td");
      cell.style.paddingLeft = `${depth * 18 + 6}px`;
      cell.title = row.path;
      const operand =
        row.group || !row.path || !row.datatype
          ? ""
          : interfaceBlock
            ? "#" + row.path
            : type === "DB"
              ? name + "." + row.path
              : type === "TAGS"
                ? row.path
                : "";
      const link =
        referenceLink && operand ? html("button", row.name) : undefined;
      if (link) {
        link.type = "button";
        link.className = "tia-reference-link";
        link.title = "Cross-reference: " + operand;
        link.onclick = () => referenceLink!(operand);
      }
      if (row.children || row.load) {
        const marker = row.open ? "▾" : "▸";
        const toggle = html("button", link ? marker : `${marker} ${row.name}`);
        toggle.className = "tia-data-toggle";
        toggle.setAttribute("aria-expanded", String(!!row.open));
        if (link)
          toggle.setAttribute(
            "aria-label",
            (row.open ? ui("Collapse", "Zwiń") : ui("Expand", "Rozwiń")) +
              " " +
              row.name,
          );
        toggle.onclick = () => {
          if (row.load) {
            row.children = row.load();
            delete row.load;
          }
          row.open = !row.open;
          render();
        };
        cell.append(toggle);
        if (link) cell.append(" ", link);
      } else {
        const icon = html("span", "▪");
        icon.className = "tia-member-icon";
        cell.append(icon, link || document.createTextNode(row.name));
      }
      tr.append(cell, html("td", row.datatype));
      const start = html("td", row.start);
      if (row.inferred && row.start) {
        start.className = "tia-default";
        start.title = ui(
          "Type default; not explicitly exported. Not a live value.",
          "Wartość domyślna typu, niewpisana jawnie w eksporcie. To nie jest wartość online.",
        );
      }
      tr.append(start);
      if (type !== "UDT") {
        const retainCell = html("td");
        if (!row.group) {
          const known = /^(Retain|NonRetain|true|false)$/i.test(row.retain);
          if (known) {
            const mark = html("input");
            mark.type = "checkbox";
            mark.checked = /^(Retain|true)$/i.test(row.retain);
            mark.disabled = true;
            mark.setAttribute("aria-label", "Retain " + row.path);
            retainCell.append(mark);
          } else {
            retainCell.textContent = "—";
            retainCell.title = ui(
              "Retain not specified in XML",
              "Retain nieokreślone w XML",
            );
          }
        }
        tr.append(retainCell);
      }
      if (interfaceBlock) {
        for (const flag of row.flags || [
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ]) {
          const td = html("td");
          if (!row.group && flag !== undefined) {
            const mark = html("input");
            mark.type = "checkbox";
            mark.checked = flag;
            mark.disabled = true;
            td.append(mark);
          } else if (!row.group) td.textContent = "—";
          tr.append(td);
        }
        tr.append(html("td", row.comment || ""));
      }
      body.append(tr);
      if (row.open) for (const c of row.children || []) add(c, depth + 1);
    }
    for (const r of rows) add(r, 0);
  }
  render();
  return host;
}

function htmlToken(kind: string, text: string) {
  const span = html("span", text);
  span.className = "token-" + kind;
  return span;
}
export function structuredText(source: Element): string {
  function render(e: Element): string {
    const count = () =>
      Math.min(1000, Math.max(0, Number(e.getAttribute("Num")) || 1));
    if (e.localName === "Blank") return " ".repeat(count());
    if (e.localName === "NewLine") return "\n".repeat(count());
    if (e.localName === "Token") return e.getAttribute("Text") || "";
    if (e.localName === "LineComment")
      return "//" + (all(e, "Text")[0]?.textContent || "");
    if (
      e.localName === "Access" &&
      ["LocalVariable", "GlobalVariable"].includes(
        e.getAttribute("Scope") || "",
      )
    ) {
      const scope = e.getAttribute("Scope");
      const components = Array.from(all(e, "Symbol")[0]?.children || []).filter(
        (c) => c.localName === "Component",
      );
      return (
        (scope === "LocalVariable" ? "#" : "") +
        components
          .map((c, i) => {
            const n = c.getAttribute("Name") || "";
            const name =
              (scope === "GlobalVariable" && i === 0) ||
              !/^[A-Za-z_][A-Za-z_0-9]*$/.test(n)
                ? '"' + n.replace(/"/g, '$"') + '"'
                : n;
            const indexes = Array.from(c.children)
              .filter((c) => c.localName === "Access")
              .map(render);
            return (
              name +
              (indexes.length ? "[" + indexes.join(", ") + "]" : "") +
              sliceSuffix(c)
            );
          })
          .join(".")
      );
    }
    if (e.localName === "Constant")
      return (
        e.getAttribute("Name") || all(e, "ConstantValue")[0]?.textContent || ""
      );
    const children = Array.from(e.children).map(render).join("");
    if (e.localName === "Instruction")
      return (e.getAttribute("Name") || "") + children;
    return children;
  }
  return render(source);
}

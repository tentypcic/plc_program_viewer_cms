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
function symbol(e: Element): string {
  const constant = child(e, "Constant")
    ? all(child(e, "Constant")!, "ConstantValue")[0]
    : undefined;
  if (constant) return constant.textContent || "";
  return (
    (e.getAttribute("Scope") === "LocalVariable" ? "#" : "") +
    all(e, "Component")
      .map(
        (c) =>
          c.getAttribute("Name") +
          (c.getAttribute("AccessModifier") === "Array"
            ? `[${all(c, "ConstantValue")
                .map((v) => v.textContent)
                .join(",")}]`
            : ""),
      )
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
};
export function tiaSymbolIndex(project: Project): TiaSymbolIndex {
  const cached = symbolCache.get(project);
  if (cached) return cached;
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
      if (p.number && /^[0-9]+$/.test(p.number))
        put(blocks, p.type + ":" + p.name, "%" + p.type + p.number);
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
    block: (name: string, type: string) => unique(blocks, type + ":" + name),
    operand: (name: string) =>
      name.startsWith("#") ? undefined : unique(tags, name),
  };
  symbolCache.set(project, index);
  return index;
}
type CallLink = (name: string, type: string) => (() => void) | undefined;
export function tiaView(
  text: string,
  lang: "pl" | "en" = "en",
  callLink?: CallLink,
  symbols?: TiaSymbolIndex,
) {
  const ui = (en: string, pl: string) => (lang === "pl" ? pl : en);
  const { root, attr, name, type, number, technology } = parseTia(text);
  const wrap = html("div");
  wrap.className = "tia-view";
  wrap.append(html("h2", `${name} ${number ? `[${type}${number}]` : ""}`));
  wrap.append(
    html(
      "p",
      ui(
        "TIA XML · documentation preview · no simulation",
        "TIA XML · podgląd dokumentacji · bez symulacji",
      ),
    ),
  );
  const data = tiaDataTable(root, attr, type, name, lang);
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
    wrap.append(tools);
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
      if (special.length || branched)
        details.append(
          html(
            "p",
            ui(
              "Approximate diagram: branching or generic instructions. Verify against the TIA PDF / original XML.",
              "Schemat przybliżony: rozgałęzienia lub instrukcje ogólne. Porównaj z PDF z TIA / źródłowym XML.",
            ),
          ),
        );
      details.append(drawNetwork(net, callLink, symbols));
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
) {
  const parts = Array.from(all(net, "Parts")[0]?.children || []).filter((e) =>
    ["Part", "Call"].includes(e.localName),
  );
  const id = (e: Element) => e.getAttribute("UId")!;
  const kind = (e: Element) => e.getAttribute("Name") || "";
  const accesses = new Map(
    all(net, "Access")
      .filter((e) => e.hasAttribute("UId"))
      .map((e) => [id(e), symbol(e)]),
  );
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
  const roomy =
    parts.some((p) =>
      all(p, "Parameter").some(
        (e) => (e.getAttribute("Name") || "").length > 16,
      ),
    ) || [...accesses.values()].some((s) => s.length > 30);
  const boxWidth = (uid: string) => {
    const p = parts.find((p) => id(p) === uid)!;
    if (
      ["Contact", "PContact", "NContact", "Coil", "SCoil", "RCoil"].includes(
        kind(p),
      )
    )
      return 150;
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
      roomy ? 340 : 150,
      (left + right) * 7.3 + 24,
      Math.min(38, title.length) * 8 + 20,
    );
  };
  const step = Math.max(
    roomy ? 940 : 320,
    Math.max(150, ...parts.map((p) => boxWidth(id(p)))) + (roomy ? 600 : 170),
  );
  const pitch = Math.max(
    210,
    ...[...pins.values()].map(
      (list) =>
        44 +
        Math.max(
          list.filter((p) => p.out).length,
          list.filter((p) => !p.out).length,
        ) *
          32 +
        80,
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
  const columns = Math.max(0, ...levels.values()) + 1;
  const width = Math.max(1000, columns * step + (roomy ? 400 : 180));
  const positions = new Map<string, { x: number; y: number }>();
  const rows = new Map<number, number>();
  for (const p of parts) {
    const level = levels.get(id(p))!;
    const row = rows.get(level) || 0;
    rows.set(level, row + 1);
    positions.set(id(p), {
      x: (roomy ? 340 : 200) + level * step,
      y: 60 + row * pitch,
    });
  }
  const height = Math.max(
    200,
    ...[...positions.values()].map((p) => p.y + pitch - 30),
  );
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  if (roomy) {
    svg.style.width = width + "px";
    svg.style.height = height + "px";
  }
  svg.setAttribute("height", String(height));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "LAD network connections");
  const add = (
    tag: string,
    attrs: Record<string, string | number>,
    text = "",
  ) => {
    const e = document.createElementNS(svg.namespaceURI, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    e.textContent = text;
    svg.append(e);
    return e;
  };
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    add("path", {
      d: `M${x1} ${y1} H${(x1 + x2) / 2} V${y2} H${x2}`,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.5,
    });
  const text = (
    x: number,
    y: number,
    value: string,
    anchor = "start",
    cls = "",
  ) => {
    const label =
      value.length > 38 ? value.slice(0, 17) + "…" + value.slice(-20) : value;
    const e = add(
      "text",
      { x, y, "text-anchor": anchor, "font-size": 12, class: cls },
      label,
    );
    if (label !== value) {
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
    const side = pins.get(uid)!.filter((p) => p.out === pin.out);
    let row = side.indexOf(pin);
    if (kind(parts.find((p) => id(p) === uid)!) === "Add" && name === "out")
      row = 1;
    return {
      x: pos.x + (pin.out ? boxWidth(uid) : 0),
      y: pos.y + 44 + row * 32,
      out: pin.out,
    };
  };
  line(30, 25, 30, height - 20);
  for (const w of wires) {
    const con = all(w, "NameCon");
    const points = con
      .map((c) => point(id(c), c.getAttribute("Name")!))
      .filter((p) => p !== null);
    if (all(w, "Powerrail").length)
      for (const p of points) line(30, p.y, p.x, p.y);
    else if (points.length > 1)
      for (const p of points.slice(1)) line(points[0].x, points[0].y, p.x, p.y);
    const access = all(w, "IdentCon")[0];
    if (access)
      for (const c of con) {
        const name = c.getAttribute("Name")!;
        const pos = positions.get(id(c));
        if (!pos) continue;
        if (metadata(name)) {
          text(
            pos.x + 75,
            pos.y + (name.toLowerCase() === "bit" ? 88 : -10),
            accesses.get(id(access)) || "?",
            "middle",
            "tia-operand",
          );
          const addr = symbols?.operand(accesses.get(id(access)) || "");
          if (addr)
            text(
              pos.x + 75,
              pos.y + (name.toLowerCase() === "bit" ? 104 : -26),
              addr,
              "middle",
              "tia-address",
            );
          continue;
        }
        const p = point(id(c), name);
        if (!p) continue;
        line(p.x, p.y, p.x + (p.out ? 18 : -18), p.y);
        text(
          p.x + (p.out ? 22 : -22),
          p.y + 4,
          accesses.get(id(access)) || "?",
          p.out ? "start" : "end",
          "tia-operand",
        );
        const addr = symbols?.operand(accesses.get(id(access)) || "");
        if (addr)
          text(
            p.x + (p.out ? 22 : -22),
            p.y - 10,
            addr,
            p.out ? "start" : "end",
            "tia-address",
          );
      }
    // Open connectors have no assigned value; do not invent a live value.
    if (all(w, "OpenCon").length)
      for (const p of points)
        text(p.x + (p.out ? 22 : -22), p.y + 4, "○", p.out ? "start" : "end");
  }
  for (const p of parts) {
    const pos = positions.get(id(p))!;
    const k = kind(p);
    const info = all(p, "CallInfo")[0];
    const name = info?.getAttribute("Name") || k;
    const simple = [
      "Contact",
      "PContact",
      "NContact",
      "Coil",
      "SCoil",
      "RCoil",
    ].includes(k);
    if (simple) {
      const y = pos.y + 44;
      line(pos.x, y, pos.x + 65, y);
      line(pos.x + 85, y, pos.x + 150, y);
      if (["Coil", "SCoil", "RCoil"].includes(k)) {
        add("path", {
          d: `M${pos.x + 69} ${y - 10} Q${pos.x + 60} ${y} ${pos.x + 69} ${y + 10} M${pos.x + 81} ${y - 10} Q${pos.x + 90} ${y} ${pos.x + 81} ${y + 10}`,
          fill: "none",
          stroke: "currentColor",
          "stroke-width": 2,
        });
        if (k !== "Coil")
          text(pos.x + 75, y + 4, k === "SCoil" ? "S" : "R", "middle");
        line(pos.x + 150, y, width - 30, y);
      } else {
        line(pos.x + 65, y - 10, pos.x + 65, y + 10);
        line(pos.x + 85, y - 10, pos.x + 85, y + 10);
        if (k === "PContact" || k === "NContact")
          text(pos.x + 75, y + 4, k === "PContact" ? "P" : "N", "middle");
        if (all(p, "Negated").some((e) => e.getAttribute("Name") === "operand"))
          add("path", {
            d: `M${pos.x + 65} ${y + 10} L${pos.x + 85} ${y - 10}`,
            stroke: "currentColor",
            "stroke-width": 1.5,
          });
      }
      continue;
    }
    const list = pins.get(id(p))!;
    const h = Math.max(
      76,
      44 +
        Math.max(
          list.filter((p) => p.out).length,
          list.filter((p) => !p.out).length,
        ) *
          32,
    );
    add("rect", {
      x: pos.x,
      y: pos.y,
      width: boxWidth(id(p)),
      height: h,
      fill: "var(--tia-box, #e1e5ed)",
    });
    add("rect", {
      x: pos.x,
      y: pos.y,
      width: boxWidth(id(p)),
      height: 28,
      fill: "var(--tia-title, #cbd1df)",
    });
    text(
      pos.x + boxWidth(id(p)) / 2,
      pos.y + 19,
      name === "Sr" ? "SR" : name === "Add" ? "ADD" : name,
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
        pos.y - (callAddress ? 46 : 28),
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
        y: pos.y,
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
    if (!defaults[k] && !info)
      text(pos.x, pos.y + h + 18, "Generic instruction · verify XML");
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
      line(pt.x, pt.y, width - 30, pt.y);
    }
  }
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
      if (row.children || row.load) {
        const toggle = html("button", `${row.open ? "▾" : "▸"} ${row.name}`);
        toggle.className = "tia-data-toggle";
        toggle.setAttribute("aria-expanded", String(!!row.open));
        toggle.onclick = () => {
          if (row.load) {
            row.children = row.load();
            delete row.load;
          }
          row.open = !row.open;
          render();
        };
        cell.append(toggle);
      } else {
        const icon = html("span", "▪");
        icon.className = "tia-member-icon";
        cell.append(icon, document.createTextNode(row.name));
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
              name + (indexes.length ? "[" + indexes.join(", ") + "]" : "")
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

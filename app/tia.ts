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
    /^(SW.Blocks.(OB|FC|FB|GlobalDB|InstanceDB)|SW.Types.PlcStruct|SW.Tags.PlcTagTable)$/.test(
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
  };
}
export function importTia(files: Record<string, string>, name: string) {
  const p = newProject(name);
  const folders = new Map(p.nodes.map((n) => [n.name, n.id]));
  for (const [path, text] of Object.entries(files)) {
    const parsed = parseTia(text);
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
    p.nodes.push(n);
    p.documents.push({
      id: uuid(),
      nodeId: n.id,
      name: path.split("/").pop()!,
      mime: "application/xml",
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
    if (!nodeIds.has(d.nodeId) || !/\.xml$/i.test(d.name) || !d.text)
      return false;
    try {
      const parsed = parseTia(d.text);
      return parsed.name === name && parsed.type === type;
    } catch {
      return false;
    }
  });
  return new Set(matches.map((d) => d.nodeId)).size === 1
    ? matches[0]
    : undefined;
}
type CallLink = (name: string, type: string) => (() => void) | undefined;
export function tiaView(
  text: string,
  lang: "pl" | "en" = "en",
  callLink?: CallLink,
) {
  const ui = (en: string, pl: string) => (lang === "pl" ? pl : en);
  const { root, attr, name, type, number } = parseTia(text);
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
  const table = html("table");
  const header = html("tr");
  for (const label of [
    ui("Section / Address", "Sekcja / adres"),
    ui("Name", "Nazwa"),
    ui("Data type", "Typ danych"),
    ui("Start value", "Wartość początkowa"),
  ])
    header.append(html("th", label));
  table.append(header);
  for (const section of Array.from(
    all(attr, "Sections")[0]?.children || [],
  ).filter((e) => e.localName === "Section")) {
    const add = (member: Element, prefix = "") => {
      const row = html("tr");
      for (const v of [
        section.getAttribute("Name") || "",
        prefix + member.getAttribute("Name"),
        member.getAttribute("Datatype") || "",
        value(member, "StartValue"),
      ])
        row.append(html("td", v));
      table.append(row);
      for (const m of all(member, "Member").filter(
        (c) =>
          !c.parentElement?.closest("Member") ||
          c.parentElement.closest("Member") === member,
      ))
        add(m, prefix + member.getAttribute("Name") + ".");
    };
    for (const m of Array.from(section.children).filter(
      (c) => c.localName === "Member",
    ))
      add(m);
  }
  for (const tag of all(root, "SW.Tags.PlcTag")) {
    const a = child(tag, "AttributeList")!;
    const row = html("tr");
    for (const v of [
      value(a, "LogicalAddress"),
      value(a, "Name"),
      value(a, "DataTypeName"),
      "",
    ])
      row.append(html("td", v));
    table.append(row);
  }
  if (table.children.length > 1) {
    const details = html("details");
    details.open = true;
    details.append(
      html("summary", ui("Interface / data", "Interfejs / dane")),
      table,
    );
    wrap.append(details);
  }
  all(root, "SW.Blocks.CompileUnit").forEach((unit, index) => {
    const details = html("details");
    details.open = true;
    const title = all(unit, "MultilingualText").find(
      (e) => e.getAttribute("CompositionName") === "Title",
    );
    details.append(
      html(
        "summary",
        `${ui("Network", "Sieć")} ${index + 1}: ${title ? all(title, "Text")[0]?.textContent || "" : ""}`,
      ),
    );
    const net = all(unit, "FlgNet")[0];
    if (net) details.append(drawNetwork(net, callLink));
    else {
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
function drawNetwork(net: Element, callLink?: CallLink) {
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
    Coil: ["in"],
    Sr: ["s", "r1", "q"],
    TON: ["IN", "PT", "Q", "ET"],
    Add: ["en", "in1", "in2", "eno", "out"],
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
      : /^(out\d*|q|eno|et)$/i.test(name);
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
  const width = Math.max(1000, columns * 320 + 180);
  const positions = new Map<string, { x: number; y: number }>();
  const rows = new Map<number, number>();
  for (const p of parts) {
    const level = levels.get(id(p))!;
    const row = rows.get(level) || 0;
    rows.set(level, row + 1);
    positions.set(id(p), { x: 200 + level * 320, y: 60 + row * 210 });
  }
  const height = Math.max(
    200,
    ...[...positions.values()].map((p) => p.y + 150),
  );
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
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
  ) =>
    add(
      "text",
      { x, y, "text-anchor": anchor, "font-size": 12, class: cls },
      value,
    );
  const point = (uid: string, name: string) => {
    const pos = positions.get(uid);
    const pin = pins.get(uid)?.find((p) => p.name === name);
    if (!pos || !pin) return null;
    const side = pins.get(uid)!.filter((p) => p.out === pin.out);
    let row = side.indexOf(pin);
    if (kind(parts.find((p) => id(p) === uid)!) === "Add" && name === "out")
      row = 1;
    return {
      x: pos.x + (pin.out ? 150 : 0),
      y: pos.y + 44 + row * 24,
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
    const simple = ["Contact", "PContact", "Coil"].includes(k);
    if (simple) {
      const y = pos.y + 44;
      line(pos.x, y, pos.x + 65, y);
      line(pos.x + 85, y, pos.x + 150, y);
      if (k === "Coil") {
        add("path", {
          d: `M${pos.x + 69} ${y - 10} Q${pos.x + 60} ${y} ${pos.x + 69} ${y + 10} M${pos.x + 81} ${y - 10} Q${pos.x + 90} ${y} ${pos.x + 81} ${y + 10}`,
          fill: "none",
          stroke: "currentColor",
          "stroke-width": 2,
        });
        line(pos.x + 150, y, width - 30, y);
      } else {
        line(pos.x + 65, y - 10, pos.x + 65, y + 10);
        line(pos.x + 85, y - 10, pos.x + 85, y + 10);
        if (k === "PContact") text(pos.x + 75, y + 4, "P", "middle");
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
          24,
    );
    add("rect", {
      x: pos.x,
      y: pos.y,
      width: 150,
      height: h,
      fill: "var(--tia-box, #e1e5ed)",
    });
    add("rect", {
      x: pos.x,
      y: pos.y,
      width: 150,
      height: 28,
      fill: "var(--tia-title, #cbd1df)",
    });
    text(
      pos.x + 75,
      pos.y + 19,
      name === "Sr" ? "SR" : name === "Add" ? "ADD" : name,
      "middle",
      "tia-instruction",
    );
    const instance = all(p, "Instance")[0];
    if (instance)
      text(pos.x + 75, pos.y - 10, symbol(instance), "middle", "tia-operand");
    for (const pin of list) {
      const pt = point(id(p), pin.name)!;
      text(
        pt.x + (pin.out ? -5 : 5),
        pt.y + 4,
        pin.name.toUpperCase(),
        pin.out ? "end" : "start",
      );
    }
    if (info && callLink) {
      const activate = callLink(name, info.getAttribute("BlockType") || "");
      const hit = add("rect", {
        x: pos.x,
        y: pos.y,
        width: 150,
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

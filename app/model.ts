export const TYPES = ["OB", "FB", "FC", "DB", "UDT", "TAGS", "OTHER"] as const;
export type BlockType = (typeof TYPES)[number];
export type Node = {
  id: string;
  parentId: string | null;
  kind: "group" | "block";
  name: string;
  description: string;
  blockType: BlockType;
  safety: boolean;
  notes: string;
  alarmCode: string;
  remedy: string;
  sequence: string;
};
export type Doc = {
  id: string;
  nodeId: string;
  name: string;
  mime: string;
  size: number;
  url?: string;
  text?: string;
};
export type Project = {
  id: string;
  legacyId?: string;
  slug?: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  pinned: boolean;
  nodes: Node[];
  documents: Doc[];
  deletedAt?: string;
};
export type Bundle = {
  format: "plc-viewer";
  schemaVersion: 2;
  exportedAt: string;
  projects: Project[];
};
export const uuid = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const clone = <T>(value: T): T => structuredClone(value);
export const stamp = () => new Date().toISOString();
export function newNode(
  name: string,
  parentId: string | null,
  kind: Node["kind"],
  blockType: BlockType = "OTHER",
): Node {
  return {
    id: uuid(),
    name,
    parentId,
    kind,
    blockType,
    description: "",
    notes: "",
    safety: false,
    alarmCode: "",
    remedy: "",
    sequence: "",
  };
}
export function newProject(name: string): Project {
  return {
    id: uuid(),
    name,
    description: "",
    createdAt: stamp(),
    updatedAt: stamp(),
    revision: 0,
    pinned: false,
    nodes: [
      newNode("Program blocks", null, "group"),
      newNode("PLC tags", null, "group", "TAGS"),
      newNode("PLC data types", null, "group", "UDT"),
    ],
    documents: [],
  };
}
const obj = (v: unknown): v is Record<string, any> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
function str(v: unknown, max = 2000000): asserts v is string {
  if (typeof v !== "string" || v.length > max)
    throw Error("Invalid text field");
}
export function safeUrl(value: string) {
  str(value, 10000);
  if (!value.trim() || /[\u0000-\u001f\\]/.test(value))
    throw Error("Invalid URL");
  const url = new URL(value, "https://localhost/");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error("Only HTTP(S) or relative document paths are allowed");
  return value;
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(v: unknown): asserts v is string {
  if (typeof v !== "string" || !UUID.test(v)) throw Error("Invalid UUID");
}
function date(v: unknown) {
  str(v, 60);
  if (!Number.isFinite(Date.parse(v))) throw Error("Invalid date");
}
export function validateProject(value: unknown): asserts value is Project {
  if (!obj(value)) throw Error("Invalid project");
  id(value.id);
  str(value.name, 1000);
  if (!value.name.trim()) throw Error("Empty project name");
  str(value.description);
  date(value.createdAt);
  date(value.updatedAt);
  if (
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    typeof value.pinned !== "boolean"
  )
    throw Error("Invalid revision or pin");
  if (value.legacyId !== undefined) str(value.legacyId, 1000);
  if (value.slug !== undefined) str(value.slug, 1000);
  if (value.deletedAt !== undefined) date(value.deletedAt);
  if (
    !Array.isArray(value.nodes) ||
    value.nodes.length > 20000 ||
    !Array.isArray(value.documents) ||
    value.documents.length > 20000
  )
    throw Error("Project limit exceeded");
  const nodes = new Map<string, Node>();
  const ids = new Set<string>([value.id]);
  for (const n of value.nodes) {
    if (!obj(n)) throw Error("Invalid node");
    id(n.id);
    if (ids.has(n.id)) throw Error("Duplicate ID");
    ids.add(n.id);
    if (
      !["group", "block"].includes(n.kind) ||
      !TYPES.includes(n.blockType) ||
      typeof n.safety !== "boolean"
    )
      throw Error("Invalid node type");
    for (const k of [
      "name",
      "description",
      "notes",
      "alarmCode",
      "remedy",
      "sequence",
    ])
      str(n[k]);
    if (!n.name.trim()) throw Error("Empty node name");
    if (n.parentId !== null) id(n.parentId);
    nodes.set(n.id, n as Node);
  }
  for (const n of value.nodes) {
    let cursor = n;
    let depth = 0;
    const seen = new Set();
    while (cursor.parentId) {
      if (++depth > 64 || seen.has(cursor.id))
        throw Error("Cyclic or deep tree");
      seen.add(cursor.id);
      const parent = nodes.get(cursor.parentId);
      if (!parent || parent.kind !== "group") throw Error("Invalid parent");
      cursor = parent;
    }
  }
  for (const d of value.documents) {
    if (!obj(d)) throw Error("Invalid document");
    id(d.id);
    if (ids.has(d.id)) throw Error("Duplicate ID");
    ids.add(d.id);
    if (!nodes.has(d.nodeId)) throw Error("Orphan document");
    str(d.name, 1000);
    str(d.mime, 200);
    if (
      !Number.isSafeInteger(d.size) ||
      d.size < 0 ||
      d.size > 50 * 1024 * 1024
    )
      throw Error("Document limit exceeded");
    if (d.url !== undefined) safeUrl(d.url);
    if (d.text !== undefined) str(d.text);
  }
}
export function envelope(projects: Project[]): Bundle {
  return {
    format: "plc-viewer",
    schemaVersion: 2,
    exportedAt: stamp(),
    projects,
  };
}
export function validateBundle(value: unknown): asserts value is Bundle {
  if (
    !obj(value) ||
    value.format !== "plc-viewer" ||
    value.schemaVersion !== 2 ||
    !Array.isArray(value.projects) ||
    value.projects.length > 2000
  )
    throw Error("Unknown format or schema version");
  const ids = new Set<string>();
  for (const p of value.projects) {
    validateProject(p);
    for (const v of [
      p.id,
      ...p.nodes.map((n) => n.id),
      ...p.documents.map((d) => d.id),
    ]) {
      if (ids.has(v)) throw Error("Duplicate ID across projects");
      ids.add(v);
    }
  }
}
export function duplicate(p: Project, name = p.name + " (copy)"): Project {
  const next = clone(p);
  const ids = new Map(p.nodes.map((n) => [n.id, uuid()]));
  next.id = uuid();
  delete next.legacyId;
  delete next.slug;
  delete next.deletedAt;
  next.name = name;
  next.revision = 0;
  next.createdAt = next.updatedAt = stamp();
  next.nodes = next.nodes.map((n) => ({
    ...n,
    id: ids.get(n.id)!,
    parentId: n.parentId ? ids.get(n.parentId)! : null,
  }));
  next.documents = next.documents.map((d) => ({
    ...d,
    id: uuid(),
    nodeId: ids.get(d.nodeId)!,
  }));
  return next;
}
export function descendants(p: Project, id: string) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of p.nodes)
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
  }
  return ids;
}
export function removeNode(p: Project, id: string) {
  const ids = descendants(p, id);
  p.nodes = p.nodes.filter((n) => !ids.has(n.id));
  p.documents = p.documents.filter((d) => !ids.has(d.nodeId));
}
export function textIndex(p: Project, n: Node) {
  return [
    n.name,
    n.description,
    n.notes,
    n.alarmCode,
    n.remedy,
    n.sequence,
    ...p.documents
      .filter((d) => d.nodeId === n.id)
      .map((d) => d.name + " " + (d.text || "")),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

export function projectSearchIndex(p: Project) {
  const docs = new Map<string, string[]>();
  for (const d of p.documents) {
    const values = docs.get(d.nodeId) || [];
    values.push(d.name + " " + (d.text || ""));
    docs.set(d.nodeId, values);
  }
  return new Map(
    p.nodes.map((n) => [
      n.id,
      [
        n.name,
        n.description,
        n.notes,
        n.alarmCode,
        n.remedy,
        n.sequence,
        ...(docs.get(n.id) || []),
      ]
        .join(" ")
        .toLocaleLowerCase(),
    ]),
  );
}


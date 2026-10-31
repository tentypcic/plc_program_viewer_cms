import type { Project } from "../model";
export type Change = {
  kind: "added" | "removed" | "changed";
  name: string;
  detail: string;
};
export function compareProjects(before: Project, after: Project): Change[] {
  const result: Change[] = [];
  for (const key of ["name", "description", "pinned"] as const)
    if (before[key] !== after[key])
      result.push({
        kind: "changed",
        name: key,
        detail: String(before[key]) + " → " + String(after[key]),
      });
  for (const [label, a, b] of [
    ["node", before.nodes, after.nodes],
    ["document", before.documents, after.documents],
  ] as const) {
    const old = new Map(a.map((n) => [n.id, n]));
    const next = new Map(b.map((n) => [n.id, n]));
    for (const [id, n] of old) {
      const v = next.get(id);
      if (!v) result.push({ kind: "removed", name: n.name, detail: label });
      else if (JSON.stringify(n) !== JSON.stringify(v))
        result.push({ kind: "changed", name: n.name, detail: label });
    }
    for (const [id, n] of next)
      if (!old.has(id))
        result.push({ kind: "added", name: n.name, detail: label });
  }
  return result;
}

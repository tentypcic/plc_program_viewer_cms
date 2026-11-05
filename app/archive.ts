import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  envelope,
  validateBundle,
  validateProject,
  duplicate,
  type Doc,
  type Node,
  type Project,
} from "./model";
import { importData } from "./legacy";
import { decodeText } from "./text";
import { importTia } from "./tia";
import type { Repository, Asset } from "./db";
export const MAX_ARCHIVE = 250 * 1024 * 1024;
const MAX_UNPACKED = 500 * 1024 * 1024;
// VCI keeps library links and workspace settings alongside exported sources.
// They contain no XML/SCL program to display and are not decompressed.
const isVciMetadata = (path: string) =>
  /\.liblink$/i.test(path) ||
  /(?:^|\/)\.vci\/workspace\.vci(?:\.exportFormats)?\.config$/i.test(path);
export const isTiaSource = (doc: Doc) =>
  !doc.url && doc.text !== undefined && /\.(xml|scl)$/i.test(doc.name);

function archiveName(name: string) {
  const safe = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim()
    .replace(/[. ]+$/, "");
  return /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(safe)
    ? "_" + safe
    : safe || "_";
}

export function exportTiaZip(project: Project) {
  const sources = project.documents.filter(isTiaSource);
  if (!sources.length) throw Error("No local XML/SCL files to export");
  const files: Record<string, Uint8Array> = Object.create(null);
  const usedPaths = new Set<string>();
  const nextSuffix = new Map<string, number>();
  const uniquePath = (folder: string, name: string, extension = "") => {
    const stem = folder + archiveName(name);
    const key = (stem + extension).toLowerCase();
    let suffix = nextSuffix.get(key) ?? 1;
    let path = stem + extension;
    while (usedPaths.has(path.toLowerCase()))
      path = `${stem} (${++suffix})${extension}`;
    nextSuffix.set(key, suffix);
    usedPaths.add(path.toLowerCase());
    return path;
  };
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  const folders = new Map<string, string>();
  const folderPath = (node: Node): string => {
    const cached = folders.get(node.id);
    if (cached !== undefined) return cached;
    const parent = node.parentId ? folderPath(nodes.get(node.parentId)!) : "";
    if (node.kind !== "group") return parent;
    const path = uniquePath(parent, node.name) + "/";
    files[path] = new Uint8Array(0);
    folders.set(node.id, path);
    return path;
  };
  for (const node of project.nodes) if (node.kind === "group") folderPath(node);
  let total = 0;
  for (const doc of sources) {
    const extension = doc.name.slice(-4);
    // Source text is stored decoded. Match the declaration to the ZIP bytes.
    const text =
      extension.toLowerCase() === ".xml"
        ? doc.text!.replace(
            /^(<\?xml\s[^?]*?\bencoding\s*=\s*)(["'])(?!utf-8\2)[^"']+\2/i,
            "$1$2UTF-8$2",
          )
        : doc.text!;
    const bytes = strToU8(text);
    total += bytes.length;
    if (total > MAX_UNPACKED) throw Error("ZIP exceeds 500 MiB unpacked");
    const path = uniquePath(
      folderPath(nodes.get(doc.nodeId)!),
      doc.name.slice(0, -4),
      extension,
    );
    files[path] = bytes;
  }
  if (Object.keys(files).length > 20001)
    throw Error("ZIP exceeds 20,001 entries");
  const data = zipSync(files);
  if (data.length > MAX_ARCHIVE) throw Error("ZIP exceeds 250 MiB");
  return new Blob([data as Uint8Array<ArrayBuffer>], {
    type: "application/zip",
  });
}

export async function exportZip(
  projects: Project[],
  repo: Pick<Repository, "asset">,
) {
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(envelope(projects), null, 2)),
  };
  let total = files["manifest.json"].length;
  if (total > 50 * 1024 * 1024)
    throw Error("Manifest exceeds 50 MiB; export projects individually");
  for (const p of projects)
    for (const d of p.documents) {
      if (d.url || (d.mime !== "application/pdf" && d.text !== undefined))
        continue;
      const blob = await repo.asset(d.id);
      if (!blob) throw Error("Missing document: " + d.name);
      total += blob.size;
      if (total > MAX_UNPACKED)
        throw Error("Backup exceeds 500 MiB; export projects individually");
      files["documents/" + d.id] = new Uint8Array(await blob.arrayBuffer());
    }
  if (Object.keys(files).length > 20001)
    throw Error("ZIP exceeds 20,001 entries; export projects individually");
  const data = zipSync(files, { level: 0 });
  if (data.length > MAX_ARCHIVE)
    throw Error("ZIP exceeds 250 MiB; export projects individually");
  return new Blob([data as Uint8Array<ArrayBuffer>], {
    type: "application/zip",
  });
}
export async function readImport(
  file: File,
): Promise<{ projects: Project[]; assets: Asset[] }> {
  if (!file.size || file.size > MAX_ARCHIVE)
    throw Error("File must be nonempty and ≤250 MiB");
  if (/\.zip$/i.test(file.name)) {
    let total = 0,
      count = 0;
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (entry) => {
        const metadata = isVciMetadata(entry.name);
        if (++count > 20001) throw Error("ZIP exceeds 20,001 entries");
        if (entry.originalSize > 50 * 1024 * 1024)
          throw Error("ZIP entry exceeds 50 MiB: " + entry.name);
        if ((total += entry.originalSize) > MAX_UNPACKED)
          throw Error("ZIP exceeds 500 MiB unpacked");
        if (
          /(^\/|\\|(^|\/)\.\.(\/|$))/.test(entry.name) ||
          (!metadata &&
            !/^(.*\/|.*\.(xml|scl)|manifest\.json|documents\/[a-f0-9-]{36})$/i.test(
              entry.name,
            ))
        )
          throw Error("Unsafe or excessive ZIP entry");
        return !metadata;
      },
    });
    if (!files["manifest.json"]) {
      const xml: Record<string, string> = {};
      for (const [path, bytes] of Object.entries(files)) {
        if (path.endsWith("/")) continue;
        if (!/\.(xml|scl)$/i.test(path))
          throw Error("Unexpected TIA ZIP entry");
        xml[path] = await decodeText(
          new Blob([bytes as Uint8Array<ArrayBuffer>]),
        );
      }
      if (!Object.keys(xml).length) throw Error("No TIA XML/SCL files");
      return {
        projects: [
          importTia(
            xml,
            file.name.replace(/\.zip$/i, ""),
            Object.keys(files).filter((path) => path.endsWith("/")),
          ),
        ],
        assets: [],
      };
    }
    const bundle = JSON.parse(strFromU8(files["manifest.json"]));
    validateBundle(bundle);
    const assets: Asset[] = [];
    const expected = new Set(["manifest.json"]);
    for (const p of bundle.projects)
      for (const d of p.documents) {
        if (d.url || (d.mime !== "application/pdf" && d.text !== undefined))
          continue;
        const key = "documents/" + d.id;
        expected.add(key);
        const bytes = files[key];
        if (!bytes || bytes.length !== d.size)
          throw Error("Missing or damaged document: " + d.name);
        assets.push({
          id: d.id,
          projectId: p.id,
          blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: d.mime }),
        });
      }
    if (Object.keys(files).some((k) => !expected.has(k)))
      throw Error("Unexpected ZIP content");
    return { projects: bundle.projects, assets };
  }
  const projects = importData(JSON.parse(await decodeText(file)));
  return { projects, assets: [] };
}
export function copyImport(projects: Project[], assets: Asset[]) {
  const copied: Project[] = [];
  const nextAssets: Asset[] = [];
  for (const old of projects) {
    const next = duplicate(old, old.name);
    for (let i = 0; i < old.documents.length; i++) {
      const asset = assets.find((a) => a.id === old.documents[i].id);
      if (asset)
        nextAssets.push({
          ...asset,
          id: next.documents[i].id,
          projectId: next.id,
        });
    }
    validateProject(next);
    copied.push(next);
  }
  return { projects: copied, assets: nextAssets };
}

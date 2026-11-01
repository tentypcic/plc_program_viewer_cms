import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  envelope,
  validateBundle,
  validateProject,
  duplicate,
  type Project,
} from "./model";
import { importData } from "./legacy";
import { decodeText } from "./text";
import type { Repository, Asset } from "./db";
export const MAX_ARCHIVE = 100 * 1024 * 1024;
const MAX_UNPACKED = 250 * 1024 * 1024;
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
        throw Error("Backup exceeds 250 MiB; export projects individually");
      files["documents/" + d.id] = new Uint8Array(await blob.arrayBuffer());
    }
  if (Object.keys(files).length > 20001)
    throw Error("ZIP exceeds 20,001 entries; export projects individually");
  const data = zipSync(files, { level: 0 });
  if (data.length > MAX_ARCHIVE)
    throw Error("ZIP exceeds 100 MiB; export projects individually");
  return new Blob([data as Uint8Array<ArrayBuffer>], {
    type: "application/zip",
  });
}
export async function readImport(
  file: File,
): Promise<{ projects: Project[]; assets: Asset[] }> {
  if (!file.size || file.size > MAX_ARCHIVE)
    throw Error("File must be nonempty and ≤100 MiB");
  if (/\.zip$/i.test(file.name)) {
    let total = 0,
      count = 0;
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (entry) => {
        if (
          ++count > 20001 ||
          entry.originalSize > 50 * 1024 * 1024 ||
          (total += entry.originalSize) > MAX_UNPACKED ||
          !/^(manifest\.json|documents\/[a-f0-9-]{36})$/i.test(entry.name)
        )
          throw Error("Unsafe or excessive ZIP entry");
        return true;
      },
    });
    if (!files["manifest.json"]) throw Error("Missing manifest.json");
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


import { validateProject, clone, stamp, uuid, type Project, type Doc } from "./model";
import { importData } from "./legacy";
export type Asset = { id: string; projectId: string; blob: Blob };
export type Backup = {
  id: string;
  projectId: string;
  at: string;
  project: Project;
};
const req = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || Error("Transaction aborted"));
    tx.onerror = () => {};
  });
}
export class Repository {
  private db!: IDBDatabase;
  channel: BroadcastChannel | null = null;
  async open(name = "plc-viewer-v2") {
    const opening = indexedDB.open(name, 1);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      db.createObjectStore("projects", { keyPath: "id" });
      db.createObjectStore("assets", { keyPath: "id" });
      const b = db.createObjectStore("backups", { keyPath: "id" });
      b.createIndex("projectId", "projectId");
      db.createObjectStore("meta");
    };
    this.db = await req(opening);
    this.db.onversionchange = () => this.db.close();
    if (typeof BroadcastChannel !== "undefined")
      this.channel = new BroadcastChannel(name);
    return this;
  }
  close() {
    this.channel?.close();
    this.db.close();
  }
  async list() {
    return req(
      this.db.transaction("projects").objectStore("projects").getAll(),
    ) as Promise<Project[]>;
  }
  async get(id: string) {
    return req(
      this.db.transaction("projects").objectStore("projects").get(id),
    ) as Promise<Project | undefined>;
  }
  async asset(id: string) {
    return (
      (await req(
        this.db.transaction("assets").objectStore("assets").get(id),
      )) as Asset | undefined
    )?.blob;
  }
  async meta<T>(key: string) {
    return req(
      this.db.transaction("meta").objectStore("meta").get(key),
    ) as Promise<T | undefined>;
  }
  async assets(projectId: string) {
    return (
      (await req(
        this.db.transaction("assets").objectStore("assets").getAll(),
      )) as Asset[]
    ).filter((a) => a.projectId === projectId);
  }
  async save(p: Project, expected: number | null, assets: Asset[] = []) {
    return this.writeMany([{ project: p, expected }], assets);
  }
  async writeMany(
    changes: { project: Project; expected: number | null }[],
    assets: Asset[] = [],
    migration?: { raw: string | null; standalone: string | null },
  ) {
    for (const c of changes) validateProject(c.project);
    const projectIds = new Set(changes.map((c) => c.project.id));
    if (projectIds.size !== changes.length) throw Error("Duplicate projects");
    for (const a of assets)
      if (
        !projectIds.has(a.projectId) ||
        !changes.some(
          (c) =>
            c.project.id === a.projectId &&
            c.project.documents.some((d) => d.id === a.id),
        ) ||
        a.blob.size > 50 * 1024 * 1024
      )
        throw Error("Invalid attachment");
    const tx = this.db.transaction(
      ["projects", "assets", "backups", "meta"],
      "readwrite",
    );
    const finished = done(tx);
    try {
      if (
        migration &&
        (await req(tx.objectStore("meta").get("migration-v2")))
      ) {
        await finished;
        return;
      }
      const store = tx.objectStore("projects");
      const incoming = new Map(assets.map((a) => [a.id, a]));
      for (const a of assets) {
        const old = (await req(tx.objectStore("assets").get(a.id))) as
          | Asset
          | undefined;
        if (old && old.projectId !== a.projectId)
          throw Error("Attachment identity conflict");
      }
      for (const { project } of changes)
        for (const d of project.documents) {
          if (d.url || (d.mime !== "application/pdf" && d.text !== undefined))
            continue;
          const asset =
            incoming.get(d.id) ||
            ((await req(tx.objectStore("assets").get(d.id))) as
              | Asset
              | undefined);
          if (
            !asset ||
            asset.projectId !== project.id ||
            asset.blob.size !== d.size
          )
            throw Error("Missing or mismatched document: " + d.name);
        }

      for (const { project, expected } of changes) {
        const old = (await req(store.get(project.id))) as Project | undefined;
        if (expected === null ? !!old : !old || old.revision !== expected)
          throw Error("CONFLICT");
        if (old) {
          const history = tx.objectStore("backups");
          history.put({
            id: old.id + ":" + old.revision,
            projectId: old.id,
            at: stamp(),
            project: old,
          });
          const entries = (await req(
            history.index("projectId").getAll(old.id),
          )) as Backup[];
          entries.sort((a, b) => b.project.revision - a.project.revision);
          for (const entry of entries.slice(20)) history.delete(entry.id);
        }
        store.put({
          ...clone(project),
          revision: (old?.revision ?? 0) + 1,
          updatedAt: old ? stamp() : project.updatedAt,
        });
      }
      for (const a of assets) tx.objectStore("assets").put(a);
      // Keep blobs referenced by the current project or any retained history entry.
      const allAssets = (await req(
        tx.objectStore("assets").getAll(),
      )) as Asset[];
      for (const change of changes) {
        const refs = new Set(change.project.documents.map((d) => d.id));
        const history = (await req(
          tx
            .objectStore("backups")
            .index("projectId")
            .getAll(change.project.id),
        )) as Backup[];
        for (const b of history)
          for (const d of b.project.documents) refs.add(d.id);
        for (const a of allAssets)
          if (a.projectId === change.project.id && !refs.has(a.id))
            tx.objectStore("assets").delete(a.id);
      }

      if (migration) {
        tx.objectStore("meta").put(
          { ...migration, at: stamp() },
          "legacy-backup",
        );
        tx.objectStore("meta").put(true, "migration-v2");
      }
      await finished;
      this.channel?.postMessage({ changed: [...projectIds] });
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await finished.catch(() => {});
      throw e;
    }
  }
  async migrate(storage: Pick<Storage, "getItem">) {
    if (await this.meta("migration-v2")) return;
    const raw = storage.getItem("ppv.projects");
    const standalone = storage.getItem("menuData");
    let projects: Project[] = [];
    if (raw !== null) projects = importData(JSON.parse(raw));
    else if (standalone !== null)
      projects = importData({
        title: storage.getItem("pageTitle") || "Legacy project",
        menuData: JSON.parse(standalone),
        date: storage.getItem("pageEdited"),
      });
    await this.writeMany(
      projects.map((project) => ({ project, expected: null })),
      [],
      { raw, standalone },
    );
  }
  async history(id: string) {
    const values = (await req(
      this.db
        .transaction("backups")
        .objectStore("backups")
        .index("projectId")
        .getAll(id),
    )) as Backup[];
    return values.sort((a, b) => b.project.revision - a.project.revision);
  }
  async purge(id: string, expected: number) {
    return this.purgeMany([{ id, revision: expected }]);
  }
  async purgeMany(projects: { id: string; revision: number }[]) {
    const tx = this.db.transaction(
      ["projects", "assets", "backups"],
      "readwrite",
    );
    const finished = done(tx);
    try {
      for (const { id, revision } of projects) {
        const p = (await req(tx.objectStore("projects").get(id))) as
          | Project
          | undefined;
        if (!p || !p.deletedAt || p.revision !== revision)
          throw Error("CONFLICT");
        tx.objectStore("projects").delete(id);
        for (const a of (await req(
          tx.objectStore("assets").getAll(),
        )) as Asset[])
          if (a.projectId === id) tx.objectStore("assets").delete(a.id);
        for (const b of (await req(
          tx.objectStore("backups").index("projectId").getAll(id),
        )) as Backup[])
          tx.objectStore("backups").delete(b.id);
      }
      await finished;
      this.channel?.postMessage({ changed: projects.map((p) => p.id) });
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await finished.catch(() => {});
      throw e;
    }
  }
  async verifyDocuments(projects: Project[], assets: Asset[]) {
    const supplied = new Set(assets.map((a) => a.id));
    for (const p of projects)
      for (const d of p.documents)
        if (
          !d.url &&
          (d.mime === "application/pdf" || d.text === undefined) &&
          !supplied.has(d.id) &&
          !(
            (
              (await req(
                this.db.transaction("assets").objectStore("assets").get(d.id),
              )) as Asset | undefined
            )?.projectId === p.id
          )
        )
          throw Error("Missing document: " + d.name);
  }
}
export function docFromFile(file: File, nodeId: string): Doc {
  if (!file.size || file.size > 50 * 1024 * 1024)
    throw Error("Document must be 1 byte–50 MiB");
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const text =
    /\.(scl|txt|csv|xml|awl|st|md|vbs)$/i.test(file.name) ||
    file.type.startsWith("text/");
  if (!pdf && !text)
    throw Error("Supported: PDF, SCL, TXT, CSV, XML, AWL, ST, MD, VBS");
  return {
    id: uuid(),
    nodeId,
    name: file.name,
    mime: pdf ? "application/pdf" : "text/plain",
    size: file.size,
  };
}


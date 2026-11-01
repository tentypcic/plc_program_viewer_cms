import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newProject,
  newNode,
  validateProject,
  validateBundle,
  duplicate,
  envelope,
  removeNode,
} from "../app/model.ts";
import { importData } from "../app/legacy.ts";
import { Repository } from "../app/db.ts";
import "fake-indexeddb/auto";
const legacy = {
  title: "Old",
  menuData: [
    {
      title: "Program blocks",
      icon: "<img onerror=x>",
      items: [
        { text: "Main [OB1]", link: "pdf/Main.pdf" },
        { text: "Group", children: [] },
      ],
    },
  ],
};
test("legacy conversion preserves hierarchy, dates, links and explicit types", () => {
  const [p] = importData([
    { id: "legacy", name: "Old", inlineData: JSON.stringify(legacy) },
  ]);
  validateProject(p);
  assert.equal(p.legacyId, "legacy");
  assert.equal(p.nodes.find((n) => n.name === "Main [OB1]")!.blockType, "OB");
  assert.equal(p.documents[0].url, "pdf/Main.pdf");
  validateBundle(envelope([p]));
});
test("model rejects orphan, cyclic, future and duplicate data", () => {
  const p = newProject("x");
  p.nodes[0].parentId = p.nodes[0].id;
  assert.throws(() => validateProject(p));
  assert.throws(() =>
    importData({ format: "plc-viewer", schemaVersion: 99, projects: [] }),
  );
  assert.throws(() => importData(null));
  const a = newProject("ok");
  assert.throws(() => validateBundle(envelope([a, a])));
});
test("duplication remaps all identities and nested removal removes docs", () => {
  const [p] = importData(legacy);
  const copy = duplicate(p);
  validateProject(copy);
  assert.notEqual(copy.nodes[0].id, p.nodes[0].id);
  assert.equal(
    copy.documents[0].nodeId,
    copy.nodes.find((n) => n.name === "Main [OB1]")!.id,
  );
  removeNode(copy, copy.nodes[0].id);
  assert.equal(copy.nodes.length, 0);
  assert.equal(copy.documents.length, 0);
});
test("migration commits once, keeps raw backup, preserves source and survives reopening", async () => {
  const name = crypto.randomUUID();
  let r = await new Repository().open(name);
  const raw = JSON.stringify([{ inlineData: JSON.stringify(legacy) }]);
  const storage = {
    getItem: (k: string) => (k === "ppv.projects" ? raw : null),
  };
  await Promise.all([r.migrate(storage), r.migrate(storage)]);
  assert.equal((await r.list()).length, 1);
  assert.equal((await r.meta<any>("legacy-backup")).raw, raw);
  r.close();
  r = await new Repository().open(name);
  await r.migrate({ getItem: () => "{broken" });
  assert.equal((await r.list()).length, 1);
  r.close();
});
test("failed migration leaves no marker or partially imported catalog", async () => {
  const r = await new Repository().open(crypto.randomUUID());
  await assert.rejects(
    r.migrate({
      getItem: (k: string) => (k === "ppv.projects" ? "[null]" : null),
    }),
  );
  assert.equal(await r.meta("migration-v2"), undefined);
  assert.equal((await r.list()).length, 0);
  r.close();
});
test("transactions prevent concurrent lost updates and rollback a multi-project import", async () => {
  const r = await new Repository().open(crypto.randomUUID());
  const p = newProject("Original");
  await r.save(p, null);
  const a = (await r.get(p.id))!;
  const b = structuredClone(a);
  a.name = "A";
  b.name = "B";
  const results = await Promise.allSettled([r.save(a, 1), r.save(b, 1)]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await r.get(p.id))!.revision, 2);
  const added = newProject("Added");
  await assert.rejects(
    r.writeMany([
      { project: added, expected: null },
      { project: p, expected: 1 },
    ]),
  );
  assert.equal(await r.get(added.id), undefined);
  assert.equal((await r.history(p.id)).length, 1);
  r.close();
});
test("history keeps 20 snapshots and retains required blobs until versions expire", async () => {
  const r = await new Repository().open(crypto.randomUUID());
  let p = newProject("History");
  const id = crypto.randomUUID();
  p.documents.push({
    id,
    nodeId: p.nodes[0].id,
    name: "test.pdf",
    mime: "application/pdf",
    size: 3,
  });
  await r.save(p, null, [{ id, projectId: p.id, blob: new Blob(["pdf"]) }]);
  p = (await r.get(p.id))!;
  p.documents = [];
  await r.save(p, p.revision);
  assert.equal((await r.asset(id))?.size, 3);
  for (let i = 0; i < 23; i++) {
    p = (await r.get(p.id))!;
    p.description = String(i);
    await r.save(p, p.revision);
  }
  assert.equal((await r.history(p.id)).length, 20);
  assert.equal(await r.asset(id), undefined);
  r.close();
});
test("missing attachments and foreign project blob identities are refused atomically", async () => {
  const r = await new Repository().open(crypto.randomUUID());
  const p = newProject("A");
  const id = crypto.randomUUID();
  p.documents.push({
    id,
    nodeId: p.nodes[0].id,
    name: "x.pdf",
    mime: "application/pdf",
    size: 3,
  });
  await assert.rejects(r.save(p, null));
  assert.equal((await r.list()).length, 0);
  await r.save(p, null, [{ id, projectId: p.id, blob: new Blob(["pdf"]) }]);
  const other = newProject("B");
  other.documents.push({ ...p.documents[0], nodeId: other.nodes[0].id });
  await assert.rejects(
    r.save(other, null, [{ id, projectId: other.id, blob: new Blob(["bad"]) }]),
  );
  assert.equal(await (await r.asset(id))!.text(), "pdf");
  r.close();
});
test("first migration preserves the original project edit timestamp", async () => {
  const r = await new Repository().open(crypto.randomUUID());
  const raw = { ...legacy, date: "2020-01-02T03:04:05.000Z" };
  await r.migrate({
    getItem: (k: string) =>
      k === "ppv.projects"
        ? JSON.stringify([{ inlineData: JSON.stringify(raw) }])
        : null,
  });
  assert.equal((await r.list())[0].updatedAt, raw.date);
  r.close();
});
test("quota-style write failure rolls back the project, attachments and snapshot together", async () => {
  const r = await new Repository().open(crypto.randomUUID());
  const p = newProject("Committed");
  await r.save(p, null);
  const next = (await r.get(p.id))!;
  next.name = "Not committed";
  const id = crypto.randomUUID();
  next.documents.push({
    id,
    nodeId: next.nodes[0].id,
    name: "new.pdf",
    mime: "application/pdf",
    size: 3,
  });
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (
    ...args: Parameters<IDBObjectStore["put"]>
  ) {
    if (this.name === "projects")
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    return original.apply(this, args);
  };
  try {
    await assert.rejects(
      r.save(next, next.revision, [
        { id, projectId: p.id, blob: new Blob(["pdf"]) },
      ]),
    );
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  assert.equal((await r.get(p.id))!.name, "Committed");
  assert.equal(await r.asset(id), undefined);
  assert.equal((await r.history(p.id)).length, 0);
  r.close();
});


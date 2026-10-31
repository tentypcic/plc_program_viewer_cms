import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newProject,
  validateProject,
  safeUrl,
  envelope,
  uuid,
} from "../app/model.ts";
import { readImport } from "../app/archive.ts";
import { docFromFile, Repository } from "../app/db.ts";
import "fake-indexeddb/auto";
test("document URLs reject executable schemes, credentials and control characters", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///tmp/x",
    "https://a:b@example.com",
    "https://x/\nfoo",
    "\\evil/x",
  ])
    assert.throws(() => safeUrl(value));
  for (const value of [
    "pdf/Main OB1.pdf",
    "https://example.com/a.pdf",
    "../a%20b.pdf",
  ])
    assert.equal(safeUrl(value), value);
});
test("strict schema rejects wrong types, missing fields, huge text, orphan documents", () => {
  for (const change of [
    (p: any) => (p.pinned = "yes"),
    (p: any) => (p.revision = -1),
    (p: any) => (p.nodes[0].notes = "x".repeat(2000001)),
    (p: any) => (p.createdAt = "not a date"),
    (p: any) =>
      p.documents.push({
        id: uuid(),
        nodeId: uuid(),
        name: "x",
        mime: "text/plain",
        size: 0,
        text: "",
      }),
  ]) {
    const p = newProject("Schema");
    change(p);
    assert.throws(() => validateProject(p));
  }
});
test("empty and malformed JSON do not become empty valid projects", async () => {
  for (const text of [
    "",
    "{",
    "null",
    "{}",
    "[null]",
    '{"format":"plc-viewer","schemaVersion":3,"projects":[]}',
  ])
    await assert.rejects(readImport(new File([text], "bad.json")));
});
test("attachment upload limits and file types are enforced", () => {
  assert.throws(() => docFromFile(new File([], "empty.pdf"), uuid()));
  assert.throws(() => docFromFile(new File(["exe"], "x.exe"), uuid()));
  const file = {
    name: "big.pdf",
    type: "application/pdf",
    size: 50 * 1024 * 1024 + 1,
  } as File;
  assert.throws(() => docFromFile(file, uuid()));
  assert.equal(
    docFromFile(new File(["IF"], "x.scl"), uuid()).mime,
    "text/plain",
  );
});
test("purging trash is atomic and cannot delete active projects", async () => {
  const r = await new Repository().open(crypto.randomUUID());
  const a = newProject("A");
  a.deletedAt = new Date().toISOString();
  const b = newProject("B");
  await r.writeMany([
    { project: a, expected: null },
    { project: b, expected: null },
  ]);
  await assert.rejects(
    r.purgeMany([
      { id: a.id, revision: 1 },
      { id: b.id, revision: 1 },
    ]),
  );
  assert.equal((await r.list()).length, 2);
  await r.purge(a.id, 1);
  assert.equal((await r.list()).length, 1);
  r.close();
});
test("valid JSON export is versioned and does not embed executable user HTML", async () => {
  const p = newProject("<img src=x onerror=alert(1)>");
  const text = JSON.stringify(envelope([p]));
  const parsed = await readImport(new File([text], "project.json"));
  assert.equal(parsed.projects[0].name, p.name);
  assert.equal(JSON.parse(text).schemaVersion, 2);
});
test("source text decoding preserves UTF-16 characters and rejects corrupt UTF-8", async () => {
  const { decodeText } = await import("../app/text.ts");
  const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0, 0x05, 1]);
  assert.equal(await decodeText(new Blob([bytes])), "Aą");
  await assert.rejects(decodeText(new Blob([new Uint8Array([0xc0, 0xff])])));
});

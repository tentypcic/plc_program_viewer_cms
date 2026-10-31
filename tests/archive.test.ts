import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { readImport, exportZip, copyImport } from "../app/archive.ts";
import { newProject, newNode, uuid, envelope } from "../app/model.ts";
import { Repository } from "../app/db.ts";
import { tokenize } from "../app/analysis/lexer.ts";
import { compareProjects } from "../app/analysis/compare.ts";
import "fake-indexeddb/auto";
test("portable ZIP retains PDF bytes even after text indexing and copies document IDs", async () => {
  const r = await new Repository().open(crypto.randomUUID());
  const p = newProject("ZIP");
  const n = newNode("Main [OB1]", p.nodes[0].id, "block", "OB");
  p.nodes.push(n);
  const bytes = new Blob(["%PDF-test"]);
  const id = uuid();
  p.documents.push({
    id,
    nodeId: n.id,
    name: "Main.pdf",
    mime: "application/pdf",
    size: bytes.size,
    text: "indexed text",
  });
  await r.save(p, null, [{ id, projectId: p.id, blob: bytes }]);
  const zip = await exportZip([p], r);
  const parsed = await readImport(new File([zip], "backup.zip"));
  assert.equal(await parsed.assets[0].blob.text(), "%PDF-test");
  assert.equal(parsed.projects[0].documents[0].text, "indexed text");
  const copied = copyImport(parsed.projects, parsed.assets);
  assert.notEqual(copied.assets[0].id, id);
  assert.equal(copied.assets[0].id, copied.projects[0].documents[0].id);
  r.close();
});
test("ZIP refuses traversal, unknown members, missing bytes and future versions", async () => {
  for (const files of [
    { "../evil": strToU8("x") },
    {
      "manifest.json": strToU8(
        JSON.stringify({ ...envelope([]), schemaVersion: 99 }),
      ),
    },
    {
      "manifest.json": strToU8(JSON.stringify(envelope([]))),
      "documents/00000000-0000-4000-8000-000000000000": new Uint8Array(1),
    },
  ] as Record<string, Uint8Array>[]) {
    await assert.rejects(
      readImport(
        new File([zipSync(files) as Uint8Array<ArrayBuffer>], "bad.zip"),
      ),
    );
  }
  const p = newProject("missing");
  p.documents.push({
    id: uuid(),
    nodeId: p.nodes[0].id,
    name: "x.pdf",
    mime: "application/pdf",
    size: 10,
  });
  await assert.rejects(
    readImport(
      new File(
        [
          zipSync({
            "manifest.json": strToU8(JSON.stringify(envelope([p]))),
          }) as Uint8Array<ArrayBuffer>,
        ],
        "missing.zip",
      ),
    ),
  );
});
test("JSON parser preserves schema and rejects invalid JSON", async () => {
  const p = newProject("x");
  const parsed = await readImport(
    new File([JSON.stringify(envelope([p]))], "x.json"),
  );
  assert.equal(parsed.projects[0].id, p.id);
  await assert.rejects(readImport(new File(["{"], "bad.json")));
});
test("lexer conserves text and never colors keywords inside comments/strings", () => {
  const source =
    "IF #x THEN\n// END_IF\n#v := 'IF $\' escaped'; (* FOR *)\nEND_IF;";
  const tokens = tokenize(source);
  assert.equal(tokens.map((t) => t.text).join(""), source);
  assert.equal(
    tokens
      .filter((t) => t.kind === "comment")
      .map((t) => t.text)
      .join(" "),
    "// END_IF (* FOR *)",
  );
  assert.ok(tokens.some((t) => t.kind === "string" && t.text.includes("IF")));
});
test("project comparison uses stable IDs for edits and additions", () => {
  const p = newProject("A");
  const next = structuredClone(p);
  next.nodes[0].name = "renamed";
  next.nodes.push(newNode("new", p.nodes[0].id, "block", "FC"));
  const result = compareProjects(p, next);
  assert.ok(
    result.some((c) => c.kind === "changed" && c.name === p.nodes[0].name),
  );
  assert.ok(result.some((c) => c.kind === "added" && c.name === "new"));
  assert.deepEqual(compareProjects(p, p), []);
});

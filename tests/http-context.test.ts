import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject, newNode, uuid, validateProject } from "../app/model.ts";
import { Repository } from "../app/db.ts";
import "fake-indexeddb/auto";

test("HTTP contexts without randomUUID can create and persist projects", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  let repository: Repository | undefined;
  try {
    const ids = new Set(Array.from({ length: 100 }, () => uuid()));
    assert.equal(ids.size, 100);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const project = newProject("HTTP demo");
    project.nodes.push(newNode("Main", null, "block", "OB"));
    validateProject(project);
    repository = await new Repository().open(uuid());
    await repository.save(project, null);
    assert.equal((await repository.list())[0].name, "HTTP demo");
  } finally {
    repository?.close();
    if (descriptor) Object.defineProperty(crypto, "randomUUID", descriptor);
    else delete (crypto as Partial<Crypto>).randomUUID;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { readImport } from "../app/archive";
test("TIA archives reject traversal and empty exports before XML parsing", async () => {
  const archives: Record<string, Uint8Array>[] = [
    { "../bad.xml": strToU8("<Document/>") },
    { "../bad.liblink": strToU8("metadata") },
    { "../.vci/workspace.vci.config": strToU8("metadata") },
    { "Program blocks/": new Uint8Array() },
  ];
  for (const entries of archives) {
    const bytes = zipSync(entries);
    await assert.rejects(readImport(new File([bytes], "tia.zip")));
  }
});

import { chromium } from "playwright";
import { createServer } from "vite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
const files = {};
function walk(dir, prefix = "") {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) walk(path, prefix + e.name + "/");
    else files[prefix + e.name] = readFileSync(path, "utf8");
  }
}
walk("tests/fixtures/tia");
const server = await createServer({ server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(server.resolvedUrls.local[0]);
  const result = await page.evaluate(async (files) => {
    const { importTia, tiaView, parseTia } = await import("/app/tia.ts");
    const p = importTia(files, "Reference");
    document.body.replaceChildren();
    for (const text of Object.values(files))
      document.body.append(tiaView(text));
    let rejected = 0;
    for (const bad of ["<bad>", "<!DOCTYPE x><Document/>"]) {
      try {
        parseTia(bad);
      } catch {
        rejected++;
      }
    }
    const { zipSync, strToU8 } = await import(
      "/node_modules/.vite/deps/fflate.js"
    );
    const { readImport } = await import("/app/archive.ts");
    const zip = zipSync(
      Object.fromEntries(
        Object.entries(files).map(([k, v]) => [k, strToU8(v)]),
      ),
    );
    const imported = await readImport(new File([zip], "reference.zip"));
    return {
      blocks: p.nodes.filter((n) => n.kind === "block").length,
      docs: p.documents.length,
      imported: imported.projects[0].documents.length,
      networks: document.querySelectorAll("svg").length,
      svgText: [...document.querySelectorAll("svg")]
        .map((e) => e.textContent)
        .join(" "),
      text: document.body.textContent,
      rejected,
    };
  }, files);
  assert.equal(result.blocks, 5);
  assert.equal(result.docs, 5);
  assert.equal(result.imported, 5);
  assert.equal(result.networks, 3);
  assert.equal(result.rejected, 2);
  for (const label of [
    "DemoData.Request",
    "#RunRequest",
    "#MotorOn",
    "#observed",
  ])
    assert.ok(result.svgText.includes(label), label);
  for (const label of ["Info.Serial", "Array[1..3] of Real", "%M20.0"])
    assert.ok(result.text.includes(label), label);
  await page.reload();
  await page.evaluate(async (files) => {
    const { importTia } = await import("/app/tia.ts");
    const { Repository } = await import("/app/db.ts");
    const repo = await new Repository().open();
    await repo.writeMany([
      {
        project: importTia(files, "Conveyor demo"),
        expected: null,
      },
    ]);
    repo.close();
  }, files);
  await page.reload();
  await page
    .getByRole("button", {
      name: "Conveyor demo",
      exact: true,
    })
    .click();
  await page
    .getByRole("treeitem")
    .filter({ hasText: "SampleCycle [OB1]" })
    .click();
  await page.locator(".tia-network").first().waitFor();
  await page
    .getByRole("treeitem")
    .filter({ hasText: "DemoControl [FC7]" })
    .click();
  await page.locator(".tia-network").first().waitFor();
  assert.equal(await page.locator(".doc-chip").count(), 0);
  const program = page
    .getByRole("treeitem")
    .filter({ hasText: "Bloki programu" });
  await program.click();
  assert.equal(await program.getAttribute("aria-expanded"), "false");
  assert.equal(await page.locator(".tia-network").count(), 2);
  await program.click();
  assert.equal(await program.getAttribute("aria-expanded"), "true");
  await page.reload();
  await page.locator(".tia-network").first().waitFor();
  await page.screenshot({ path: "/tmp/plc-viewer-synthetic-light.png" });
  await page.getByRole("button", { name: "Zmień motyw", exact: true }).click();
  await page.screenshot({ path: "/tmp/plc-viewer-synthetic-dark.png" });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );

  console.log(
    "Synthetic TIA regression: 5 XML files, ZIP import, 2 wired and 1 empty network, interfaces, constants, tags and invalid XML passed",
  );
} finally {
  await browser.close();
  await server.close();
}

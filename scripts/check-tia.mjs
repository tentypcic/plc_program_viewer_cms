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
    const {
      importTia,
      tiaView,
      parseTia,
      resolveTiaCall,
      tiaReferences,
      matchingReferences,
      structuredText,
      parseSclHeader,
      tiaSymbolIndex,
    } = await import("/app/tia.ts");
    const sample = files["Program blocks/DemoData.xml"];
    for (const rootType of [
      "SW.Blocks.ArrayDB",
      "SW.TechnologicalObjects.TechnologicalInstanceDB",
    ]) {
      const xml = sample.replaceAll("SW.Blocks.GlobalDB", rootType);
      if (
        parseTia(xml).type !== "DB" ||
        !tiaView(xml).querySelector(".tia-data-grid")
      )
        throw Error("Special DB root");
    }
    const scl =
      'FUNCTION_BLOCK "DemoSource"\nVAR_INPUT\nEnable : Bool;\nEND_VAR\nEND_FUNCTION_BLOCK';
    if (parseSclHeader(scl).type !== "FB") throw Error("SCL declaration");
    const mixed = importTia(
      { ...files, "Program blocks/DemoSource.scl": scl },
      "Mixed",
    );
    if (
      mixed.documents.length !== 6 ||
      !resolveTiaCall(mixed, "DemoSource", "FB")
    )
      throw Error("SCL source import and call link");
    const st = new DOMParser().parseFromString(
      '<StructuredText><Access Scope="LocalVariable"><Symbol><Component Name="scaled"/></Symbol></Access><Blank Num="1"/><Token Text=":="/><Blank Num="1"/><Access Scope="Call"><Instruction Name="WORD_TO_INT"><Token Text="("/><NamelessParameter><Access Scope="LiteralConstant"><Constant><ConstantValue>16#2FF</ConstantValue></Constant></Access></NamelessParameter><Token Text=")"/></Instruction></Access><Token Text=";"/><NewLine Num="1"/><LineComment><Text>sample</Text></LineComment></StructuredText>',
      "application/xml",
    ).documentElement;
    if (structuredText(st) !== "#scaled := WORD_TO_INT(16#2FF);\n//sample")
      throw Error("StructuredText token reconstruction");
    const ladder = files["Program blocks/DemoControl.xml"]
      .replace('Name="Coil"', 'Name="SCoil"')
      .replace(
        '<Part UId="3" Name="Contact"/>',
        '<Part UId="3" Name="Contact"><Negated Name="operand"/></Part>',
      );
    if (!tiaView(ladder).textContent.includes("S")) throw Error("SET coil");
    const demo = files["Program blocks/DemoControl.xml"];
    const netXml = (parts, wires) =>
      demo.replace(
        /<FlgNet[\s\S]*?<\/FlgNet>/,
        `<FlgNet><Parts>${parts}</Parts><Wires>${wires}</Wires></FlgNet>`,
      );
    const pin = (id, name) => `<NameCon UId="${id}" Name="${name}"/>`;
    const wire = (con) => `<Wire>${con}</Wire>`;
    const parallel = netXml(
      '<Part Name="Contact" UId="1"/><Part Name="Contact" UId="2"/><Part Name="O" UId="3"/><Part Name="Coil" UId="4"/>',
      wire("<Powerrail/>" + pin(1, "in") + pin(2, "in")) +
        wire(pin(1, "out") + pin(3, "in1")) +
        wire(pin(2, "out") + pin(3, "in2")) +
        wire(pin(3, "out") + pin(4, "in")),
    );
    const parallelView = tiaView(parallel);
    if (
      parallelView.querySelectorAll("circle").length < 3 ||
      !parallelView.querySelector('[data-kind="O"]')
    )
      throw Error("OR wire junction");
    const fanout = netXml(
      '<Part Name="Contact" UId="1"/><Part Name="Move" UId="2"/><Part Name="Move" UId="3"/>',
      wire("<Powerrail/>" + pin(1, "in")) +
        wire(pin(1, "out") + pin(2, "en") + pin(3, "en")),
    );
    const fanoutView = tiaView(fanout);
    const moves = [...fanoutView.querySelectorAll('[data-kind="Move"]')];
    if (
      moves.length !== 2 ||
      moves[0].dataset.layoutY === moves[1].dataset.layoutY ||
      fanoutView.querySelectorAll("circle").length < 2
    )
      throw Error("MOVE fanout layout");
    const safetyView = tiaView(
      fanout.replace(
        "<Number>7</Number>",
        "<Number>7</Number><ProgrammingLanguage>F_LAD</ProgrammingLanguage>",
      ),
    );
    if (!safetyView.querySelector('rect[fill*="tia-safety-title"]'))
      throw Error("F block styling");
    const localConstant = netXml(
      '<Access Scope="LocalConstant" UId="8"><Constant Name="MODE_ZERO"/></Access><Part Name="Move" UId="2"/>',
      wire("<Powerrail/>" + pin(2, "en")) +
        wire('<IdentCon UId="8"/>' + pin(2, "in")),
    ).replace(
      "</Sections>",
      '<Section Name="Constant"><Member Name="MODE_ZERO" Datatype="Int"/></Section></Sections>',
    );
    const localView = tiaView(localConstant);
    if (
      localView.querySelector(".tia-constant-value")?.textContent !== "0" ||
      !localView.textContent.includes("#MODE_ZERO")
    )
      throw Error("Local constant type default");
    const fbXml = files["Program blocks/DemoControl.xml"]
      .replaceAll("SW.Blocks.FC", "SW.Blocks.FB")
      .replace(
        '<Member Name="RunRequest" Datatype="Bool"/>',
        '<Member Name="RunRequest" Datatype="Bool" Remanence="NonRetain"><AttributeList><BooleanAttribute Name="ExternalAccessible">true</BooleanAttribute><BooleanAttribute Name="ExternalWritable">false</BooleanAttribute></AttributeList><Comment><MultiLanguageText Lang="en-US">Sample input</MultiLanguageText></Comment></Member>',
      );
    const fbView = tiaView(fbXml);
    const fbRow = fbView.querySelector('[data-path="RunRequest"]');
    if (
      fbRow.querySelectorAll("td").length !== 11 ||
      fbRow.querySelectorAll("input:checked").length !== 1 ||
      !fbRow.textContent.includes("Sample input")
    )
      throw Error("FB IO metadata");
    const p = importTia(files, "Reference");
    if (
      !resolveTiaCall(p, "DemoControl", "FC") ||
      resolveTiaCall(p, "DemoControl", "FB") ||
      resolveTiaCall(p, "Missing", "FC")
    )
      throw Error("Call resolution mismatch");
    const duplicated = structuredClone(p);
    const original = duplicated.nodes.find(
      (n) => n.name === "DemoControl [FC7]",
    );
    const originalDoc = duplicated.documents.find(
      (d) => d.nodeId === original.id,
    );
    duplicated.nodes.push({ ...original, id: "duplicate" });
    duplicated.documents.push({
      ...originalDoc,
      id: "duplicate-doc",
      nodeId: "duplicate",
    });
    if (resolveTiaCall(duplicated, "DemoControl", "FC"))
      throw Error("Ambiguous target must not resolve");
    const refs = tiaReferences(p).references;
    if (
      matchingReferences(refs, "DemoControl").filter((r) => r.usage === "CALL")
        .length !== 1
    )
      throw Error("Call references");
    if (
      matchingReferences(refs, "DemoData").filter(
        (r) => r.symbol === "DemoData.Request" && r.usage === "R",
      ).length !== 1
    )
      throw Error("DB member references");
    const fcNode = p.nodes.find((n) => n.name === "DemoControl [FC7]");
    if (matchingReferences(refs, "#MotorOn", fcNode.id)[0]?.usage !== "W")
      throw Error("Coil writes");
    if (
      matchingReferences(refs, "#MotorOn", "wrong-node").length ||
      matchingReferences(refs, "Demo").length
    )
      throw Error("Reference scope");
    const withDefault = structuredClone(p);
    const target = withDefault.documents.find(
      (d) => d.name === "DemoControl.xml",
    );
    target.text = target.text.replace(
      '<Member Name="RunRequest" Datatype="Bool"/>',
      '<Member Name="RunRequest" Datatype="Bool"><StartValue>True</StartValue></Member>',
    );
    const defaultsIndex = tiaSymbolIndex(withDefault);
    const defaultCall = files["Program blocks/SampleCycle.xml"].replace(
      '<IdentCon UId="1"/>',
      '<OpenCon UId="1"/>',
    );
    if (
      !tiaView(defaultCall, "en", undefined, defaultsIndex)
        .querySelector(".tia-default-pin")
        ?.textContent.startsWith("True")
    )
      throw Error("Open pin default from declaration");
    const index = tiaSymbolIndex(p);
    if (
      index.block("DemoControl", "FC") !== "%FC7" ||
      index.operand("DemoFlag") !== "%M20.0" ||
      index.block("Missing", "FB") ||
      index.operand("#DemoFlag")
    )
      throw Error("Address resolution");
    const callView = tiaView(
      files["Program blocks/SampleCycle.xml"],
      "en",
      undefined,
      index,
    );
    if (!callView.querySelector(".tia-address")?.textContent.includes("%FC7"))
      throw Error("Call address label");
    document.body.replaceChildren();
    for (const text of Object.values(files))
      document.body.append(tiaView(text));
    const db = [...document.querySelectorAll(".tia-data-grid")].find(
      (e) => e.querySelector("h3")?.textContent === "DemoData",
    );
    const findRow = (path) =>
      [...db.querySelectorAll("[data-path]")].find(
        (e) => e.dataset.path === path,
      );
    if (
      !findRow("Info.Serial") ||
      !db.querySelector("th:last-child").textContent.includes("Retain")
    )
      throw Error("DB tree columns");
    findRow("Info").querySelector("button").click();
    if (findRow("Info.Serial")) throw Error("Structure collapse");
    findRow("Info").querySelector("button").click();
    findRow("Samples").querySelector("button").click();
    if (
      !findRow("Samples[1]") ||
      !findRow("Samples[3]") ||
      findRow("Samples[4]")
    )
      throw Error("Array bounds");
    findRow("Samples").querySelector("button").click();
    if (findRow("Samples[1]")) throw Error("Array collapse");
    const udt = [...document.querySelectorAll(".tia-data-grid")].find(
      (e) => e.querySelector("h3")?.textContent === "SampleInfo",
    );
    if (udt.querySelector("th:last-child").textContent !== "Default value")
      throw Error("UDT columns");
    const tags = [...document.querySelectorAll(".tia-data-grid")].find(
      (e) => e.querySelector("h3")?.textContent === "DemoTags",
    );
    if (tags.querySelectorAll("th")[3].textContent !== "Address")
      throw Error("Tag columns");
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
      text:
        document.body.textContent +
        [...document.querySelectorAll("[data-path]")]
          .map((e) => e.dataset.path)
          .join(" "),
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
  const call = page.locator('[data-block-call="DemoControl"]');
  await call.dblclick();
  await page
    .locator(".node-title-line h2")
    .filter({ hasText: "DemoControl [FC7]" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("treeitem")
      .filter({ hasText: "DemoControl [FC7]" })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.getByRole("tab", { name: "SampleCycle.xml", exact: true }).click();
  await call.focus();
  await page.keyboard.press("Enter");
  await page
    .locator(".node-title-line h2")
    .filter({ hasText: "DemoControl [FC7]" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "DemoControl.xml", exact: true })
      .count(),
    1,
  );
  await page
    .getByRole("button", { name: "Cross-reference", exact: true })
    .click();
  assert.equal(await page.locator(".xref-result").count(), 1);
  await page.locator(".xref-result").click();
  await page
    .locator(".node-title-line h2")
    .filter({ hasText: "SampleCycle [OB1]" })
    .waitFor();
  await page.locator(".xref-target").waitFor();
  await page
    .getByRole("button", { name: "Cross-reference", exact: true })
    .click();
  await page.getByLabel("Blok lub zmienna", { exact: true }).fill("DemoData");
  assert.equal(await page.locator(".xref-result").count(), 1);
  await page.locator(".xref-result").click();
  await page.getByRole("tab", { name: "DemoControl.xml", exact: true }).click();
  await page
    .getByRole("button", { name: "Zwiń wszystkie sieci", exact: true })
    .click();
  assert.equal(await page.locator(".tia-view [data-network][open]").count(), 0);
  assert.equal(
    await page.locator(".tia-view details").first().getAttribute("open"),
    "",
  );
  await page
    .getByRole("button", { name: "Rozwiń wszystkie sieci", exact: true })
    .click();
  assert.equal(await page.locator(".tia-view [data-network][open]").count(), 2);
  await page.getByLabel("Skala schematu", { exact: true }).selectOption("75");
  assert.equal(
    await page
      .locator(".tia-network svg")
      .first()
      .evaluate(
        (e) => parseFloat(e.style.width) / Number(e.getAttribute("width")),
      ),
    0.75,
  );
  await page
    .getByRole("button", { name: "Dopasuj szerokość", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".tia-network svg")
      .first()
      .evaluate((e) => e.style.maxWidth),
    "100%",
  );
  await page.getByLabel("Skala schematu", { exact: true }).selectOption("100");
  assert.equal(await page.locator(".doc-chip").count(), 0);
  const program = page
    .getByRole("treeitem")
    .filter({ hasText: "Bloki programu" });
  await program.click();
  assert.equal(await program.getAttribute("aria-expanded"), "false");
  assert.equal(
    await page
      .getByRole("treeitem")
      .filter({ hasText: "DemoControl [FC7]" })
      .count(),
    0,
  );
  assert.equal(await page.locator(".tia-network").count(), 2);
  await program.click();
  assert.equal(await program.getAttribute("aria-expanded"), "true");
  assert.equal(
    await page
      .getByRole("treeitem")
      .filter({ hasText: "DemoControl [FC7]" })
      .count(),
    1,
  );
  await program.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await program.getAttribute("aria-expanded"), "false");
  assert.equal(
    await program.evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press("ArrowRight");
  assert.equal(await program.getAttribute("aria-expanded"), "true");
  assert.equal(
    await page
      .getByRole("treeitem")
      .filter({ hasText: "DemoControl [FC7]" })
      .getAttribute("aria-selected"),
    "true",
  );
  await program.getByRole("button").click();
  assert.equal(await program.getAttribute("aria-expanded"), "false");
  await program.getByRole("button").click();
  assert.equal(await program.getAttribute("aria-expanded"), "true");
  await page.reload();
  await page.locator(".tia-network").first().waitFor();
  await page.screenshot({ path: "/tmp/plc-viewer-synthetic-light.png" });
  await page
    .getByRole("treeitem")
    .filter({ hasText: "DemoData [DB4]" })
    .click();
  await page.locator(".tia-data-grid").waitFor();
  await page.screenshot({ path: "/tmp/plc-viewer-db.png" });
  await page.getByRole("tab", { name: "DemoControl.xml", exact: true }).click();
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

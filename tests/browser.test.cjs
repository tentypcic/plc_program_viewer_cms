const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
let browser, server, base;
const prefix = "/plc_program_viewer_cms/";
before(async () => {
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith(prefix)) throw Error("path");
      const relative =
        decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html";
      const file = path.resolve(__dirname, "../dist", relative);
      if (!file.startsWith(path.resolve(__dirname, "../dist") + path.sep))
        throw Error("path");
      const data = await readFile(file);
      const ext = path.extname(file);
      res.setHeader(
        "Content-Type",
        {
          ".js": "text/javascript",
          ".mjs": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".pdf": "application/pdf",
          ".png": "image/png",
          ".html": "text/html",
        }[ext] || "application/octet-stream",
      );
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html");
      res.end(await readFile(path.join(__dirname, "../dist/404.html")));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}${prefix}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  server?.close();
});
const legacy = (title = "Alpha") => ({
  id: "legacy-a",
  slug: "alpha",
  name: title,
  inlineData: JSON.stringify({
    title,
    menuData: [
      {
        title: "Program blocks",
        icon: '<img src=x onerror="window.pwned=1">',
        items: [{ text: "Main [OB1]", link: "pdf/main.pdf" }],
      },
      { title: "PLC tags", items: [] },
      { title: "PLC data types", items: [] },
    ],
  }),
});
async function setup(seed) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  if (seed !== undefined)
    await context.addInitScript((value) => {
      if (!localStorage.getItem("test-seeded")) {
        localStorage.setItem("ppv.projects", JSON.stringify(value));
        localStorage.setItem("test-seeded", "1");
      }
    }, seed);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Dokumentacja pod kontrolą." })
    .waitFor();
  return { context, page, errors };
}
async function create(page, name = "Factory documentation") {
  await page
    .getByRole("button", { name: /Nowy projekt/ })
    .first()
    .click();
  await page.getByLabel("Nazwa", { exact: true }).fill(name);
  await page
    .getByLabel("Opis", { exact: true })
    .fill("Synthetic PLC documentation");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
}
async function editing(page) {
  await page
    .getByRole("button", { name: "◉ Tryb odczytu", exact: true })
    .click();
}
async function addNode(page, kind, name) {
  await page
    .getByRole("button", {
      name: kind === "group" ? "+ Grupa" : "+ Blok",
      exact: true,
    })
    .click();
  await page.getByLabel("Nazwa", { exact: true }).fill(name);
  if (kind === "block")
    await page.getByLabel("Typ bloku", { exact: true }).selectOption("FC");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await page.locator(".node-title-line h2").filter({ hasText: name }).waitFor();
}
async function catalogAction(page, key, index = 0) {
  await page
    .locator(".project-card")
    .nth(index)
    .getByRole("button", { name: "Więcej", exact: true })
    .click();
  await page.getByRole("menuitem", { name: key, exact: true }).click();
}
async function importFile(page, file, mode = "copy") {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "↥ Importuj", exact: true }).click();
  await (await chooser).setFiles(file);
  await page.getByLabel("Sposób importu", { exact: true }).selectOption(mode);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Importuj", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function getProjects(page) {
  return page.evaluate(async () => {
    const req = indexedDB.open("plc-viewer-v2", 1);
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("projects");
    const result = await new Promise((resolve, reject) => {
      const q = tx.objectStore("projects").getAll();
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    db.close();
    return result;
  });
}
test("create, nested groups, typed block, notes and SCL document survive reload and language change", async () => {
  const { context, page, errors } = await setup();
  await create(page);
  await editing(page);
  await addNode(page, "group", "Station > A");
  await addNode(page, "block", "FC_Cycle");
  await page
    .getByRole("button", { name: "+ Dodaj kod / tekst", exact: true })
    .click();
  await page.getByLabel("Nazwa", { exact: true }).fill("Cycle.scl");
  await page
    .getByLabel("Treść", { exact: true })
    .fill("IF #Start THEN\n #Count := #Count + 1;\nEND_IF;");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await page
    .getByRole("button", { name: "TXT Cycle.scl", exact: true })
    .click();
  await page.locator(".code-view").waitFor();
  if (process.env.PLC_QA_SCREENSHOTS)
    await page.screenshot({ path: "/tmp/plc-workspace.png", fullPage: true });
  assert.match(await page.locator(".code-view").innerText(), /END_IF/);
  await page.reload();
  await page.locator(".code-view").waitFor();
  assert.equal(await page.getByRole("tab", { name: "Cycle.scl" }).count(), 1);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page
    .getByRole("button", { name: "◉ Read mode", exact: true })
    .waitFor();
  const stored = await getProjects(page);
  assert.equal(
    stored[0].nodes.find((n) => n.name === "FC_Cycle").blockType,
    "FC",
  );
  assert.equal(errors.length, 0);
  await context.close();
});
test("migration preserves original raw JSON, maps old PID, blocks HTML, renders actual PDF and exports ZIP", async () => {
  const old = [legacy('<img src=x onerror="window.pwned=1">')];
  const { context, page, errors } = await setup(old);
  assert.equal(await page.locator(".project-title img").count(), 0);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.deepEqual(
    JSON.parse(await page.evaluate(() => localStorage.getItem("ppv.projects"))),
    old,
  );
  await page.goto(base + "viewer.html?pid=legacy-a");
  await page.getByRole("treeitem").filter({ hasText: "Main [OB1]" }).click();
  await page.locator("canvas").waitFor();
  await page.waitForFunction(() => document.querySelector("canvas")?.width > 0);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ ZIP", exact: true }).click();
  assert.match((await dl).suggestedFilename(), /\.zip$/);
  assert.equal(errors.length, 0);
  await context.close();
});
test("portable ZIP roundtrip restores local attachments into a fresh browser", async () => {
  const { context, page } = await setup();
  await create(page, "Portable");
  await editing(page);
  await addNode(page, "block", "FC_Text");
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "+ Dodaj pliki", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "Program.scl",
    mimeType: "text/plain",
    buffer: Buffer.from("REGION Test\nEND_REGION"),
  });
  await page.locator(".code-view").waitFor();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ ZIP", exact: true }).click();
  const downloaded = await dl;
  const file = {
    name: downloaded.suggestedFilename(),
    mimeType: "application/zip",
    buffer: await readFile(await downloaded.path()),
  };
  const second = await setup();
  await importFile(second.page, file, "replace");
  await second.page
    .getByRole("button", { name: "Portable", exact: true })
    .click();
  await second.page
    .getByRole("treeitem")
    .filter({ hasText: "FC_Text" })
    .click();
  await second.page.locator(".code-view").waitFor();
  assert.match(
    await second.page.locator(".code-view").innerText(),
    /END_REGION/,
  );
  await second.context.close();
  await context.close();
});
test("duplicate, edit, trash, restore and history work through consistent dialogs", async () => {
  const { context, page } = await setup([legacy()]);
  await catalogAction(page, "Duplikuj");
  await page.locator(".project-card").nth(1).waitFor();
  assert.equal(await page.locator(".project-card").count(), 2);
  if (process.env.PLC_QA_SCREENSHOTS)
    await page.screenshot({ path: "/tmp/plc-catalog.png", fullPage: true });
  await catalogAction(page, "Edytuj");
  await page.getByLabel("Nazwa", { exact: true }).fill("Renamed");
  await page.getByLabel("Opis", { exact: true }).fill("Updated description");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await catalogAction(page, "Historia i przywracanie");
  await page
    .getByRole("button", { name: "Przywróć", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Potwierdź", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await catalogAction(page, "Usuń");
  await page.getByRole("button", { name: "Potwierdź", exact: true }).click();
  await page.getByRole("button", { name: "Kosz", exact: true }).click();
  await page.locator(".project-card").waitFor();
  await catalogAction(page, "Przywróć");
  await page.getByRole("button", { name: "Projekty", exact: true }).click();
  await page.locator(".project-card").nth(1).waitFor();
  assert.equal(await page.locator(".project-card").count(), 2);
  await context.close();
});
test("stale tabs cannot overwrite a project, recovery is available", async () => {
  const { context, page } = await setup([legacy()]);
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  const url = page.url();
  const second = await context.newPage();
  await second.goto(url);
  await second.getByRole("heading", { name: "Alpha", exact: true }).waitFor();
  await editing(page);
  await addNode(page, "block", "First change");
  await editing(second);
  await second.getByRole("button", { name: "+ Blok", exact: true }).click();
  await second.getByLabel("Nazwa", { exact: true }).fill("Stale change");
  await second.getByRole("button", { name: "Zapisz", exact: true }).click();
  await second
    .getByRole("button", { name: "Pobierz niezapisane zmiany", exact: true })
    .waitFor();
  const data = await getProjects(page);
  assert.ok(data[0].nodes.some((n) => n.name === "First change"));
  assert.ok(!data[0].nodes.some((n) => n.name === "Stale change"));
  await context.close();
});
test("invalid import, invalid URL, responsive layout, keyboard search and themes", async () => {
  const { context, page, errors } = await setup([legacy()]);
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await editing(page);
  await page.getByRole("treeitem").filter({ hasText: "Main [OB1]" }).click();
  await page
    .getByRole("button", { name: "+ Dodaj link PDF", exact: true })
    .click();
  await page.getByLabel("Nazwa", { exact: true }).fill("Bad");
  await page
    .getByLabel("Adres dokumentu", { exact: true })
    .fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Only HTTP" }).waitFor();
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.keyboard.press("Control+k");
  assert.equal(
    await page
      .getByRole("searchbox")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.getByRole("searchbox").fill("Main");
  await page.locator(".result").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Zmień motyw", exact: true }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page
    .getByRole("button", { name: "← Wszystkie projekty", exact: true })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "↥ Importuj", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("[null]"),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Importuj", exact: true })
    .click();
  await page.getByRole("status").waitFor();
  assert.equal((await getProjects(page)).length, 1);
  assert.equal(errors.length, 0);
  await context.close();
});
test("local PDF indexes text and ZIP preserves original PDF in another browser", async () => {
  const { context, page } = await setup();
  await create(page, "PDF package");
  await editing(page);
  await addNode(page, "block", "PDF block");
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "+ Dodaj pliki", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "Manual.pdf",
    mimeType: "application/pdf",
    buffer: await readFile(path.join(__dirname, "../pdf/main.pdf")),
  });
  await page.locator("canvas").waitFor();
  await page
    .getByRole("button", { name: "Indeksuj treść PDF", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Treść PDF jest dostępna" })
    .waitFor();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ ZIP", exact: true }).click();
  const downloaded = await dl;
  const file = {
    name: downloaded.suggestedFilename(),
    mimeType: "application/zip",
    buffer: await readFile(await downloaded.path()),
  };
  const other = await setup();
  await importFile(other.page, file, "replace");
  await other.page
    .getByRole("button", { name: "PDF package", exact: true })
    .click();
  await other.page
    .getByRole("treeitem")
    .filter({ hasText: "PDF block" })
    .click();
  await other.page.locator("canvas").waitFor();
  await other.page.waitForFunction(
    () => document.querySelector("canvas")?.width > 0,
  );
  assert.ok((await getProjects(other.page))[0].documents[0].text.length > 0);
  await other.context.close();
  await context.close();
});
test("large tree renders a bounded number of rows and selects global search result", async () => {
  const { randomUUID } = require("node:crypto");
  const project = {
    id: randomUUID(),
    name: "Large synthetic",
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revision: 0,
    pinned: false,
    nodes: [],
    documents: [],
  };
  const rootId = randomUUID();
  const node = (id, name, parentId, kind) => ({
    id,
    name,
    parentId,
    kind,
    blockType: kind === "group" ? "OTHER" : "FC",
    description: "",
    notes: "",
    safety: false,
    alarmCode: "",
    remedy: "",
    sequence: "",
  });
  project.nodes.push(node(rootId, "Program blocks", null, "group"));
  for (let i = 0; i < 12000; i++)
    project.nodes.push(node(randomUUID(), "Block_" + i, rootId, "block"));
  const { context, page } = await setup();
  await importFile(page, {
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "plc-viewer",
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        projects: [project],
      }),
    ),
  });
  await page
    .getByRole("button", { name: "Large synthetic", exact: true })
    .click();
  await page.getByRole("treeitem").first().waitFor();
  assert.ok((await page.getByRole("treeitem").count()) < 100);
  await page.getByRole("searchbox").fill("Block_11999");
  await page.locator(".result").click();
  await page
    .locator(".node-title-line h2")
    .filter({ hasText: "Block_11999" })
    .waitFor();
  await context.close();
});
test("node rename and deletion, structure reset and history recovery preserve saved content", async () => {
  const { context, page } = await setup();
  await create(page, "Recoverable");
  await editing(page);
  await addNode(page, "block", "FC_Before");
  await page
    .locator(".node-title-line")
    .getByRole("button", { name: "Edytuj", exact: true })
    .click();
  await page.getByLabel("Nazwa", { exact: true }).fill("FC_After");
  await page.getByLabel("Opis", { exact: true }).fill("Block description");
  await page
    .getByLabel("Notatki", { exact: true })
    .fill("Notes retained in snapshot");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await page
    .locator(".node-title-line h2")
    .filter({ hasText: "FC_After" })
    .waitFor();
  await page
    .getByRole("treeitem")
    .filter({ hasText: "FC_After" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Usuń", exact: true }).click();
  await page.getByRole("button", { name: "Potwierdź", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.ok(
    !(await getProjects(page))[0].nodes.some((n) => n.name === "FC_After"),
  );
  await page
    .getByRole("button", { name: "← Wszystkie projekty", exact: true })
    .click();
  await catalogAction(page, "Historia i przywracanie");
  await page
    .getByRole("button", { name: "Przywróć", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Potwierdź", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.ok(
    (await getProjects(page))[0].nodes.some(
      (n) => n.name === "FC_After" && n.notes === "Notes retained in snapshot",
    ),
  );
  await page.getByRole("button", { name: "Recoverable", exact: true }).click();
  await editing(page);
  await page
    .locator(".explorer-footer")
    .getByRole("button", { name: "Więcej", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Wyczyść strukturę", exact: true })
    .click();
  await page.getByRole("button", { name: "Potwierdź", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.equal((await getProjects(page))[0].nodes.length, 0);
  await context.close();
});
test("closing a document tab selects its matching block, projects stay isolated", async () => {
  const { context, page } = await setup();
  await create(page, "Tabs");
  await editing(page);
  async function codeBlock(name) {
    await addNode(page, "block", name);
    await page
      .getByRole("button", { name: "+ Dodaj kod / tekst", exact: true })
      .click();
    await page.getByLabel("Nazwa", { exact: true }).fill(name + ".scl");
    await page.getByLabel("Treść", { exact: true }).fill("// " + name);
    await page.getByRole("button", { name: "Zapisz", exact: true }).click();
    await page
      .getByRole("button", { name: "TXT " + name + ".scl", exact: true })
      .click();
    await page.locator(".code-view").waitFor();
  }
  await codeBlock("First");
  await codeBlock("Second");
  assert.equal(await page.getByRole("tab").count(), 2);
  await page
    .getByRole("button", { name: "Zamknij Second.scl", exact: true })
    .click();
  await page
    .locator(".node-title-line h2")
    .filter({ hasText: "First" })
    .waitFor();
  assert.match(await page.locator(".code-view").innerText(), /First/);
  const first = (await getProjects(page))[0];
  await page
    .getByRole("button", { name: "← Wszystkie projekty", exact: true })
    .click();
  await create(page, "Independent");
  await editing(page);
  await addNode(page, "block", "Independent block");
  const data = await getProjects(page);
  assert.equal(
    data.find((p) => p.id === first.id).nodes.length,
    first.nodes.length,
  );
  assert.ok(
    !data
      .find((p) => p.id === first.id)
      .nodes.some((n) => n.name === "Independent block"),
  );
  await context.close();
});
test("GitHub Pages slug redirects preserve the repository root without redirect loops", async () => {
  const { context, page } = await setup([legacy()]);
  await page.goto(base + "alpha/");
  await page.getByRole("heading", { name: "Alpha", exact: true }).waitFor();
  assert.ok(
    page.url().includes("/plc_program_viewer_cms/viewer.html?slug=alpha"),
  );
  await page.goto(base + "nested/unknown/");
  await page
    .getByRole("heading", { name: "Dokumentacja pod kontrolą." })
    .waitFor();
  assert.ok(
    page.url().includes("/plc_program_viewer_cms/viewer.html?slug=unknown"),
  );
  assert.equal((await getProjects(page)).length, 1);
  await context.close();
});


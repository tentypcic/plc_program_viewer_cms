import "./style.css";
import {
  tiaView,
  resolveTiaCall,
  tiaReferences,
  matchingReferences,
  parseTia,
  tiaSymbolIndex,
  importTia,
} from "./tia";
import {
  el,
  button,
  append,
  field,
  selectField,
  modal,
  onError,
  download,
  filename,
} from "./dom";
import { translator, type Lang, type Key } from "./i18n";
import { Repository, docFromFile, type Asset } from "./db";
import {
  newProject,
  newNode,
  clone,
  duplicate,
  descendants,
  removeNode,
  uuid,
  envelope,
  TYPES,
  safeUrl,
  projectSearchIndex,
  type Project,
  type Node as PlcNode,
  type Doc,
} from "./model";
import {
  readImport,
  exportZip,
  copyImport,
  exportTiaZip,
  isTiaSource,
} from "./archive";
import { exportLegacy, importData } from "./legacy";
import { tokenize } from "./analysis/lexer";
import { compareProjects } from "./analysis/compare";
import { diffLines } from "diff";
import { pdfView } from "./pdf";
import { decodeText } from "./text";
const root = document.getElementById("app")!;
const repo = new Repository();
let projects: Project[] = [];
let current: Project | undefined;
let selected: string | null = null;
let activeDoc: string | null = null;
let tabs: string[] = [];
let expanded = new Set<string>();
let query = "";
let edit = false;
let trash = false;
let pending: Project | undefined;
let pendingAssets: Asset[] = [];
let pdfDispose: (() => void) | undefined;
let contentEpoch = 0;
let busy = false;
function setting(key: string, value?: unknown) {
  try {
    if (value !== undefined)
      localStorage.setItem("ppv.ui." + key, JSON.stringify(value));
    else return JSON.parse(localStorage.getItem("ppv.ui." + key) || "null");
  } catch {
    return null;
  }
}
let lang: Lang = setting("lang") === "en" ? "en" : "pl";
let t = translator(lang);
let theme = setting("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.theme = theme;
function notify(message: string, error = false) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = el("div", "toast");
    toast.id = "toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.className = "toast show" + (error ? " error" : "");
  clearTimeout((notify as any).timer);
  (notify as any).timer = setTimeout(
    () => toast!.classList.remove("show"),
    6000,
  );
}
onError((e) => {
  console.error(e);
  notify(
    (e as Error).message === "CONFLICT"
      ? t("conflict")
      : t("error") + ": " + ((e as Error).message || e),
    true,
  );
});
function remember() {
  setting("last", {
    projectId: current?.id,
    selected,
    activeDoc,
    tabs,
    expanded: [...expanded],
  });
}
function stats(p: Project) {
  const blocks = p.nodes.filter((n) => n.kind === "block").length;
  const files = p.documents.length;
  const noun = (n: number, one: string, few: string, many: string) =>
    (({ one, few, many, other: many }) as Record<string, string>)[
      new Intl.PluralRules(lang).select(n)
    ];
  return lang === "pl"
    ? `${blocks} ${noun(blocks, "blok", "bloki", "bloków")} · ${files} ${noun(files, "dokument", "dokumenty", "dokumentów")}`
    : `${blocks} ${blocks === 1 ? "block" : "blocks"} · ${files} ${files === 1 ? "document" : "documents"}`;
}
function authorCredit() {
  const footer = el("footer", "app-credit");
  const link = el("a", "", "tentypcic");
  link.href = "https://github.com/tentypcic";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  footer.append(
    document.createTextNode("Created by "),
    link,
    document.createTextNode(" · PLC Viewer"),
  );
  return footer;
}
function label(n: PlcNode) {
  return (
    (
      {
        "Program blocks": lang === "pl" ? "Bloki programu" : "Program blocks",
        "PLC tags": lang === "pl" ? "Zmienne PLC" : "PLC tags",
        "PLC data types": lang === "pl" ? "Typy danych PLC" : "PLC data types",
      } as Record<string, string>
    )[n.name] || n.name
  );
}
async function refresh() {
  projects = await repo.list();
  if (current) current = projects.find((p) => p.id === current!.id);
  render();
}
async function commit(next: Project, assets: Asset[] = []) {
  try {
    await repo.save(next, next.revision || null, assets);
    pending = undefined;
    pendingAssets = [];
    current = await repo.get(next.id);
    projects = await repo.list();
    tabs = tabs.filter((id) => current!.documents.some((d) => d.id === id));
    if (activeDoc && !tabs.includes(activeDoc)) activeDoc = tabs.at(-1) || null;
    if (selected && !current!.nodes.some((n) => n.id === selected))
      selected = null;
    if (
      activeDoc &&
      current!.documents.find((d) => d.id === activeDoc)?.nodeId !== selected
    )
      activeDoc = null;
    render();
    notify(t("saved"));
  } catch (e) {
    pending = next;
    pendingAssets = assets;
    render();
    throw e;
  }
}
function pick(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = el("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files || [])]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}
function confirmAction(message: string, action: () => Promise<void>) {
  const content = el("div", "dialog-body", message);
  const actions = el("div", "dialog-actions");
  const d = modal(t("confirm"), content, actions);
  append(
    actions,
    button(t("cancel"), () => d.close(), "button"),
    button(
      t("confirm"),
      async () => {
        await action();
        d.close();
      },
      "button danger",
    ),
  );
}
function formDialog(
  title: string,
  fields: HTMLElement[],
  onSave: () => Promise<void>,
) {
  const form = el("form", "dialog-body");
  form.append(...fields);
  const actions = el("div", "dialog-actions");
  const cancel = button(t("cancel"), () => d.close());
  const save = el("button", "button primary", t("save"));
  save.type = "submit";
  append(actions, cancel, save);
  form.append(actions);
  const d = modal(title, form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    save.disabled = true;
    try {
      await onSave();
      d.close();
    } catch (err) {
      notify(
        (err as Error).message === "CONFLICT"
          ? t("conflict")
          : t("error") + ": " + (err as Error).message,
        true,
      );
    } finally {
      save.disabled = false;
    }
  };
  return d;
}
async function openProject(id: string, nodeId?: string) {
  if (pending) {
    notify(t("unsaved"), true);
    return;
  }
  projects = await repo.list();
  current = projects.find((p) => p.id === id);
  if (!current) throw Error(t("selectProject"));
  selected = nodeId || null;
  activeDoc = null;
  tabs = [];
  expanded = new Set(
    current.nodes.filter((n) => n.parentId === null).map((n) => n.id),
  );
  edit = false;
  trash = false;
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("pid", current.id);
  history.replaceState(null, "", url);
  remember();
  render();
}
async function openExample() {
  if (pending) {
    notify(t("unsaved"), true);
    return;
  }
  const id = "3bf70ac3-a88d-4bf3-9461-2255fe67f9e6";
  let project = await repo.get(id);
  let example = project;
  if (!example) {
    const files = import.meta.glob<string>("../demo/**/*.xml", {
      query: "?raw",
      import: "default",
    });
    const entries = await Promise.all(
      Object.entries(files).map(async ([path, load]) => [
        path.slice("../demo/".length),
        await load(),
      ]),
    );
    example = importTia(Object.fromEntries(entries), "Conveyor Sorting Line");
    example.id = id;
    example.description =
      "Synthetic TIA Portal example · LAD, block interfaces and cross-references.";
  }
  if (!project || project.deletedAt) {
    delete example.deletedAt;
    try {
      await repo.save(example, project?.revision ?? null);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "CONFLICT") throw error;
    }
    project = await repo.get(id);
  }
  if (!project || project.deletedAt) throw Error(t("selectProject"));
  await openProject(id);
  const main = project.documents.find((doc) => doc.name === "Main.xml");
  if (main) {
    const conveyor = project.nodes.find(
      (node) => node.kind === "group" && node.name === "Conveyor",
    );
    if (conveyor) expanded.add(conveyor.id);
    openDoc(main.id);
  }
}
function back() {
  if (pending) {
    notify(t("unsaved"), true);
    return;
  }
  current = undefined;
  selected = null;
  activeDoc = null;
  tabs = [];
  pending = undefined;
  history.replaceState(null, "", new URL("./index.html", location.href));
  remember();
  render();
}
function projectForm(p?: Project) {
  const inCatalog = !current;
  const name = field(t("name"), "text", p?.name || "");
  name.input.required = true;
  name.input.maxLength = 1000;
  const description = field(t("description"), "textarea", p?.description || "");
  formDialog(
    p ? t("edit") : t("newProject"),
    [name.wrap, description.wrap],
    async () => {
      const next = p ? clone(p) : newProject(name.input.value.trim());
      next.name = name.input.value.trim();
      next.description = description.input.value;
      await commit(next);
      if (!p) await openProject(next.id);
      else if (inCatalog) {
        current = undefined;
        render();
      }
    },
  );
}
function nodeForm(kind: PlcNode["kind"], node?: PlcNode) {
  if (!current) return;
  const p = clone(current);
  const name = field(t("name"), "text", node?.name || "");
  name.input.required = true;
  const description = field(
    t("description"),
    "textarea",
    node?.description || "",
  );
  const forbidden = node ? descendants(p, node.id) : new Set<string>();
  const options = [
    { value: "", label: t("root") },
    ...p.nodes
      .filter((n) => n.kind === "group" && !forbidden.has(n.id))
      .map((n) => ({ value: n.id, label: pathName(p, n.id) })),
  ];
  const parent = selectField(
    t("parent"),
    options,
    node?.parentId ||
      p.nodes.find((n) => n.id === selected && n.kind === "group")?.id ||
      p.nodes.find((n) => n.parentId === null)?.id ||
      "",
  );
  const type = selectField(
    t("type"),
    TYPES.map((value) => ({ value, label: value })),
    node?.blockType || "OTHER",
  );
  const safety = field(t("safety"), "checkbox");
  (safety.input as HTMLInputElement).checked = node?.safety || false;
  const notes = field(t("notes"), "textarea", node?.notes || "");
  const alarm = field(t("alarm"), "text", node?.alarmCode || "");
  const remedy = field(t("remedy"), "textarea", node?.remedy || "");
  const sequence = field(t("sequence"), "textarea", node?.sequence || "");
  const fields = [
    name.wrap,
    description.wrap,
    parent.wrap,
    ...(kind === "block" ? [type.wrap, safety.wrap] : []),
    ...(node ? [notes.wrap, alarm.wrap, remedy.wrap, sequence.wrap] : []),
  ];
  formDialog(
    node ? t("edit") : kind === "block" ? t("addBlock") : t("addGroup"),
    fields,
    async () => {
      const next = node
        ? p.nodes.find((n) => n.id === node.id)!
        : newNode(name.input.value.trim(), parent.input.value || null, kind);
      Object.assign(next, {
        name: name.input.value.trim(),
        description: description.input.value,
        parentId: parent.input.value || null,
        blockType: type.input.value,
        safety: (safety.input as HTMLInputElement).checked,
        ...(node
          ? {
              notes: notes.input.value,
              alarmCode: alarm.input.value,
              remedy: remedy.input.value,
              sequence: sequence.input.value,
            }
          : {}),
      });
      if (!node) p.nodes.push(next);
      selected = next.id;
      if (next.parentId) expanded.add(next.parentId);
      await commit(p);
    },
  );
}
function pathName(p: Project, id: string) {
  let n = p.nodes.find((n) => n.id === id);
  const parts: string[] = [];
  while (n) {
    parts.unshift(label(n));
    n = p.nodes.find((x) => x.id === n!.parentId);
  }
  return parts.join(" / ");
}
async function exportProject(
  p: Project,
  format: "json" | "sources" | "backup" = "json",
) {
  if (format === "sources")
    download(filename(p.name) + "-sources.zip", exportTiaZip(p));
  else if (format === "backup")
    download(filename(p.name) + "-backup.zip", await exportZip([p], repo));
  else {
    download(
      filename(p.name) + ".json",
      JSON.stringify(envelope([p]), null, 2),
    );
    notify(
      lang === "pl"
        ? "JSON zawiera strukturę i tekst. Lokalne pliki PDF zapisuj w ZIP."
        : "JSON contains structure and text. Use ZIP for local PDFs.",
    );
  }
}
async function duplicateProject(p: Project) {
  const next = duplicate(
    p,
    lang === "pl" ? p.name + " (kopia)" : p.name + " (copy)",
  );
  const assets = await repo.assets(p.id);
  const remapped = assets.flatMap((a) => {
    const i = p.documents.findIndex((d) => d.id === a.id);
    return i < 0
      ? []
      : [{ ...a, id: next.documents[i].id, projectId: next.id }];
  });
  await repo.save(next, null, remapped);
  projects = await repo.list();
  render();
}
let dismissMenu: (() => void) | undefined;
function menu(
  title: string,
  items: { key: Key; action: () => void | Promise<void>; danger?: boolean }[],
  event: MouseEvent,
) {
  dismissMenu?.();
  const m = el("div", "context-menu");
  m.id = "context-menu";
  m.setAttribute("role", "menu");
  m.setAttribute("aria-label", title);
  const listeners = new AbortController();
  const close = () => {
    listeners.abort();
    m.remove();
    dismissMenu = undefined;
  };
  dismissMenu = close;
  for (const item of items) {
    const b = button(
      t(item.key),
      async () => {
        close();
        await item.action();
      },
      "menu-item" + (item.danger ? " danger-text" : ""),
    );
    b.setAttribute("role", "menuitem");
    m.append(b);
  }
  document.body.append(m);
  const trigger = (event.target as Element)?.closest("button, [role=treeitem]");
  const anchor =
    event.type === "click" && event.detail === 0
      ? trigger?.getBoundingClientRect()
      : undefined;
  const x = anchor?.left ?? event.clientX;
  const y = anchor?.bottom ?? event.clientY;
  const above = (anchor?.top ?? y) - m.offsetHeight - 6;
  const top =
    y + 6 + m.offsetHeight > innerHeight - 8 && above >= 8 ? above : y + 6;
  m.style.left = Math.max(8, Math.min(x, innerWidth - m.offsetWidth - 8)) + "px";
  m.style.top = Math.max(8, Math.min(top, innerHeight - m.offsetHeight - 8)) + "px";
  (m.firstElementChild as HTMLElement)?.focus({ preventScroll: true });
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!m.contains(e.target as Node)) close();
    },
    { signal: listeners.signal },
  );
  m.onkeydown = (e) => {
    const buttons = [...m.querySelectorAll("button")];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      buttons[
        (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
      ].focus();
    }
    if (e.key === "Escape") {
      close();
      if (trigger instanceof HTMLElement)
        trigger.focus({ preventScroll: true });
    }
  };
}
function projectActions(p: Project) {
  return [
    { key: "edit" as Key, action: () => projectForm(p) },
    {
      key: "pin" as Key,
      action: async () => {
        const next = clone(p);
        next.pinned = !next.pinned;
        await repo.save(next, p.revision);
        await refresh();
      },
    },
    {
      key: "link" as Key,
      action: async () => {
        const url = new URL("viewer.html", location.href);
        url.searchParams.set("pid", p.id);
        try {
          await navigator.clipboard.writeText(url.href);
          notify(t("copied"));
        } catch {
          const value = field(t("link"), "text", url.href);
          value.input.readOnly = true;
          modal(t("link"), value.wrap);
        }
      },
    },
    { key: "duplicate" as Key, action: () => duplicateProject(p) },
    { key: "export" as Key, action: () => exportProject(p) },
    ...(p.documents.some(isTiaSource)
      ? [{ key: "exportZip" as Key, action: () => exportProject(p, "sources") }]
      : []),
    { key: "backup" as Key, action: () => exportProject(p, "backup") },
    {
      key: "legacy" as Key,
      action: () => {
        if (
          p.documents.some((d) => !d.url) ||
          p.nodes.some((n) => n.parentId === null && n.kind === "block")
        )
          throw Error(
            lang === "pl"
              ? "Starszy format obsługuje tylko linki PDF i bloki w grupach. Użyj ZIP."
              : "Legacy format supports only linked PDFs and blocks inside groups. Use ZIP.",
          );
        download(
          filename(p.name) + "-legacy.json",
          JSON.stringify(exportLegacy(p), null, 2),
        );
      },
    },
    { key: "history" as Key, action: () => historyDialog(p) },
    {
      key: "delete" as Key,
      danger: true,
      action: () =>
        confirmAction(t("confirmDelete"), async () => {
          const next = clone(p);
          next.deletedAt = new Date().toISOString();
          await repo.save(next, p.revision);
          if (current?.id === p.id) back();
          await refresh();
        }),
    },
  ];
}
function nodeActions(n: PlcNode) {
  return [
    { key: "edit" as Key, action: () => nodeForm(n.kind, n) },
    {
      key: "delete" as Key,
      danger: true,
      action: () =>
        confirmAction(t("confirmDelete"), async () => {
          const next = clone(current!);
          removeNode(next, n.id);
          selected = null;
          await commit(next);
        }),
    },
  ];
}
async function importFile() {
  const [file] = await pick(".json,.zip");
  if (!file) return;
  const content = el("div", "dialog-body");
  content.append(el("p", "muted", t("importHint")));
  const mode = selectField(
    t("importMode"),
    [
      { value: "copy", label: t("copyImport") },
      { value: "replace", label: t("replaceImport") },
    ],
    "copy",
  );
  const errorMessage = el("p", "dialog-error");
  errorMessage.setAttribute("role", "alert");
  errorMessage.tabIndex = -1;
  errorMessage.hidden = true;
  content.append(mode.wrap, errorMessage);
  const actions = el("div", "dialog-actions");
  const d = modal(t("import") + " · " + file.name, content, actions);
  append(
    actions,
    button(t("cancel"), () => d.close()),
    button(
      t("import"),
      async () => {
        if (busy) return;
        busy = true;
        errorMessage.hidden = true;
        errorMessage.textContent = "";
        try {
          const parsed = await readImport(file);
          const data =
            mode.input.value === "copy"
              ? copyImport(parsed.projects, parsed.assets)
              : parsed;
          await repo.verifyDocuments(data.projects, data.assets);
          const existing = await repo.list();
          await repo.writeMany(
            data.projects.map((project) => ({
              project,
              expected:
                existing.find((p) => p.id === project.id)?.revision ?? null,
            })),
            data.assets,
          );
          d.close();
          await refresh();
          notify(t("importSuccess"));
        } catch (error) {
          errorMessage.textContent =
            t("error") + ": " +
            (error instanceof Error ? error.message : String(error));
          errorMessage.hidden = false;
          errorMessage.focus();
        } finally {
          busy = false;
        }
      },
      "button primary",
    ),
  );
}
async function historyDialog(p: Project) {
  const body = el("div", "dialog-body");
  const history = await repo.history(p.id);
  if (!history.length) body.append(el("p", "muted", t("noHistory")));
  for (const entry of history) {
    const row = el("div", "history-row");
    append(
      row,
      el(
        "div",
        "",
        `${t("version")} ${entry.project.revision} · ${new Date(entry.at).toLocaleString(lang)}`,
      ),
      button(
        t("compare"),
        () => compareDialog(p, entry.project),
        "button small",
      ),
      button(
        t("restore"),
        () =>
          confirmAction(t("restoreVersion"), async () => {
            const latest = await repo.get(p.id);
            if (!latest) throw Error("Missing project");
            const restored = clone(entry.project);
            delete restored.deletedAt;
            restored.revision = latest.revision;
            await repo.verifyDocuments([restored], []);
            await repo.save(restored, latest.revision);
            d.close();
            await refresh();
          }),
        "button small",
      ),
    );
    body.append(row);
  }
  const d = modal(t("history"), body);
}
function compareDialog(before: Project, after: Project) {
  const body = el("div", "dialog-body");
  const changes = compareProjects(before, after);
  body.append(
    el(
      "p",
      "muted",
      `${before.name} (r${before.revision}) → ${after.name} (r${after.revision}). UUID.`,
    ),
  );
  if (!changes.length) body.append(el("p", "", t("same")));
  for (const c of changes) {
    const row = el("div", "change " + c.kind);
    row.append(
      el("strong", "", t(c.kind) + " · " + c.name),
      el("span", "muted", c.detail),
    );
    body.append(row);
  }
  modal(t("compare"), body);
}
async function compareImport() {
  const [file] = await pick(".json");
  if (!file || !current) return;
  const other = (await readImport(file)).projects[0];
  if (other) compareDialog(current, other);
}
function vciGuide() {
  const body = el("div", "dialog-body vci-guide");
  const steps = el("ol");
  for (const key of ["vciWorkspace", "vciFormat", "vciExport", "vciImport"] as const)
    steps.append(el("li", "", t(key)));
  const screenshot = el("img");
  screenshot.src = new URL(
    "../docs/screenshots/tia-vci-workspace.png",
    import.meta.url,
  ).href;
  screenshot.alt = t("vciScreenshot");
  const source = el("a", "", t("vciSource"));
  source.href =
    "https://docs.tia.siemens.cloud/r/en-us/v20/using-tia-portal-version-control-interface/user-interface-of-the-version-control-interface/overview-of-the-workspace-editor";
  source.target = "_blank";
  source.rel = "noopener";
  body.append(steps, screenshot, source);
  modal(t("vciTitle"), body);
}
function help() {
  const body = el("div", "dialog-body");
  body.append(
    el("p", "prose", t("helpBody")),
    el("p", "muted", t("remoteWarning")),
    el("p", "muted", t("codeHelp")),
    button(t("vciGuide"), () => {
      d.close();
      vciGuide();
    }),
    button(t("legacyBackup"), async () => {
      const backup = await repo.meta<{
        raw: string | null;
        standalone: string | null;
      }>("legacy-backup");
      if (!backup?.raw && !backup?.standalone) {
        notify(t("noLegacy"));
        return;
      }
      download(
        "plc-viewer-before-migration.json",
        backup.raw || backup.standalone!,
      );
    }),
    button(t("example"), async () => {
      d.close();
      await openExample();
    }),
  );
  const d = modal(t("helpTitle"), body);
}
function render() {
  pdfDispose?.();
  pdfDispose = undefined;
  contentEpoch++;
  document.documentElement.lang = lang;
  document.title = current ? current.name + " · PLC Viewer" : "PLC Viewer";
  root.replaceChildren();
  const shell = el("div", "shell" + (current ? " workspace-shell" : ""));
  const rail = el("aside", "rail");
  append(
    rail,
    button("P", () => back(), "brand", "PLC Viewer"),
    button(
      "▦",
      () => {
        trash = false;
        back();
      },
      "rail-button" + (!current && !trash ? " active" : ""),
      t("catalog"),
    ),
    button(
      "♲",
      () => {
        current = undefined;
        trash = true;
        render();
      },
      "rail-button" + (trash ? " active" : ""),
      t("trash"),
    ),
    el("div", "rail-spacer"),
    button(
      "◐",
      () => {
        theme = theme === "dark" ? "light" : "dark";
        setting("theme", theme);
        document.documentElement.dataset.theme = theme;
      },
      "rail-button",
      t("theme"),
    ),
    button(
      lang.toUpperCase(),
      () => {
        lang = lang === "pl" ? "en" : "pl";
        setting("lang", lang);
        t = translator(lang);
        render();
      },
      "rail-button",
      lang === "pl" ? "English" : "Polski",
    ),
    button("?", help, "rail-button", t("help")),
  );
  const body = el("div", "body");
  const header = el("header", "topbar");
  const identity = el("div", "identity");
  append(
    identity,
    el("strong", "", "PLC Viewer"),
    el(
      "span",
      "muted breadcrumb",
      current ? " / " + current.name : " / " + t(trash ? "trash" : "catalog"),
    ),
  );
  const searchWrap = el("div", "search-wrap");
  const search = el("input", "search");
  search.id = "global-search";
  search.type = "search";
  search.maxLength = 500;
  search.placeholder = t("search");
  search.setAttribute("aria-label", t("search"));
  search.value = query;
  let timer: ReturnType<typeof setTimeout>;
  search.oninput = () => {
    query = search.value;
    clearTimeout(timer);
    timer = setTimeout(renderSearch, 140);
  };
  searchWrap.append(
    el("span", "search-icon", "⌕"),
    search,
    el("kbd", "", "⌘ K"),
  );
  append(header, identity, searchWrap, el("span", "local-badge", t("local")));
  body.append(header);
  if (pending) {
    const warning = el("div", "warning");
    append(
      warning,
      el("span", "", t("unsaved")),
      button(
        t("recovery"),
        async () =>
          download(
            "unsaved-project.zip",
            await exportZip([pending!], {
              asset: async (id: string) =>
                pendingAssets.find((a) => a.id === id)?.blob || repo.asset(id),
            }),
          ),
        "button small",
      ),
      button(
        t("reload"),
        () =>
          confirmAction(t("confirmReload"), async () => {
            pending = undefined;
            pendingAssets = [];
            await refresh();
          }),
        "button small",
      ),
    );
    body.append(warning);
  }
  const main = el("main", current ? "workspace" : "catalog");
  body.append(main);
  append(shell, rail, body);
  root.append(shell);
  if (current) renderWorkspace(main);
  else {
    renderCatalog(main);
    body.append(authorCredit());
  }
  if (pending) {
    rail.inert = true;
    header.inert = true;
    main.inert = true;
  }
  renderSearch();
  remember();
}
function renderCatalog(main: HTMLElement) {
  const heading = el("div", "page-heading");
  const title = el("div");
  append(
    title,
    el("div", "eyebrow", trash ? t("trash") : "WORKSPACE / PLC"),
    el("h1", "", trash ? t("trash") : t("headline")),
    el("p", "muted", t("intro")),
  );
  const tools = el("div", "toolbar");
  if (trash) {
    tools.append(
      button(
        t("emptyTrash"),
        () =>
          confirmAction(t("confirmPurge"), async () => {
            await repo.purgeMany(projects.filter((p) => p.deletedAt));
            await refresh();
          }),
        "button danger",
      ),
    );
  } else
    append(
      tools,
      button(t("example"), openExample),
      button(t("vciGuide"), vciGuide),
      button("↥ " + t("import"), importFile),
      button("↓ " + t("backup"), async () =>
        download("plc-viewer-backup.zip", await exportZip(projects, repo)),
      ),
      button("+ " + t("newProject"), () => projectForm(), "button primary"),
    );
  append(heading, title, tools);
  main.append(heading);
  const list = projects
    .filter((p) => (trash ? !!p.deletedAt : !p.deletedAt))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const bar = el("div", "section-heading");
  append(
    bar,
    el("h2", "", `${t(trash ? "trash" : "catalog")} (${list.length})`),
    el("span", "muted", trash ? "" : t("saved")),
  );
  main.append(bar);
  const cards = el("div", "project-grid");
  cards.id = "project-grid";
  main.append(cards);
  if (!list.length) {
    const empty = el("div", "empty-state");
    append(
      empty,
      el("div", "empty-icon", "▤"),
      el("h2", "", t("empty")),
      el("p", "muted", t("createHint")),
      ...(trash
        ? []
        : [
            button(
              "+ " + t("newProject"),
              () => projectForm(),
              "button primary",
            ),
          ]),
    );
    cards.append(empty);
  }
  for (const p of list) {
    const card = el("article", "project-card");
    card.dataset.project = p.id;
    const top = el("div", "card-top");
    append(
      top,
      el("span", "project-symbol", "PLC"),
      button("•••", eMenu, "icon-button", t("more")),
    );
    function eMenu(event: MouseEvent) {
      menu(
        p.name,
        trash
          ? [
              {
                key: "restore",
                action: async () => {
                  const next = clone(p);
                  delete next.deletedAt;
                  await repo.save(next, p.revision);
                  await refresh();
                },
              },
              {
                key: "purge",
                danger: true,
                action: () =>
                  confirmAction(t("confirmPurge"), async () => {
                    await repo.purge(p.id, p.revision);
                    await refresh();
                  }),
              },
            ]
          : projectActions(p),
        event,
      );
    }
    append(
      card,
      top,
      button(
        (p.pinned ? "⌑ " : "") + p.name,
        () => openProject(p.id),
        "project-title",
      ),
      el("p", "project-description", p.description || "—"),
      el("div", "card-stats", stats(p)),
      el(
        "div",
        "card-footer",
        `${t("updated")} ${new Date(p.updatedAt).toLocaleDateString(lang)} · r${p.revision}`,
      ),
    );
    card.oncontextmenu = (e) => {
      e.preventDefault();
      eMenu(e);
    };
    cards.append(card);
  }
}
const treePositions = new Map<string, number>();
const TREE_ROW_HEIGHT = 28;
const searchCache = new Map<
  string,
  { revision: number; index: Map<string, string> }
>();
function renderSearch() {
  document.getElementById("search-results")?.remove();
  const q = query.trim().toLocaleLowerCase();
  if (!q) return;
  const panel = el("div", "search-results");
  panel.id = "search-results";
  panel.setAttribute("aria-label", t("search"));
  let count = 0;
  for (const p of projects.filter((p) => !p.deletedAt)) {
    if ([p.name, p.description].join(" ").toLocaleLowerCase().includes(q)) {
      panel.append(
        button(
          p.name + " · " + t("project"),
          async () => {
            query = "";
            await openProject(p.id);
          },
          "result",
        ),
      );
      count++;
    }
    let cached = searchCache.get(p.id);
    if (!cached || cached.revision !== p.revision) {
      cached = { revision: p.revision, index: projectSearchIndex(p) };
      searchCache.set(p.id, cached);
    }
    for (const n of p.nodes) {
      if (count >= 100) break;
      if (cached.index.get(n.id)?.includes(q)) {
        const result = button(
          label(n),
          async () => {
            query = "";
            await openProject(p.id, n.id);
            const doc = current?.documents.find((d) => d.nodeId === n.id);
            if (doc) openDoc(doc.id);
          },
          "result",
        );
        result.append(el("small", "muted", p.name + " / " + pathName(p, n.id)));
        panel.append(result);
        count++;
      }
    }
    if (count >= 100) break;
  }
  if (!count) panel.append(el("p", "muted", t("noResults")));
  panel.append(
    button(
      t("resetFilters"),
      () => {
        query = "";
        (document.getElementById("global-search") as HTMLInputElement).value =
          "";
        panel.remove();
      },
      "button small",
    ),
  );
  document.querySelector(".search-wrap")!.append(panel);
}
function renderWorkspace(main: HTMLElement) {
  const p = current!;
  const aside = el("aside", "explorer");
  aside.style.width = (setting("width") || 300) + "px";
  const explorerHead = el("div", "explorer-head");
  append(
    explorerHead,
    button("← " + t("back"), back, "text-button"),
    el("h2", "", p.name),
  );
  aside.append(explorerHead);
  const mode = button(
    (edit ? "✎ " : "◉ ") + t(edit ? "editMode" : "read"),
    () => {
      edit = !edit;
      render();
    },
    "mode-button" + (edit ? " editing" : ""),
  );
  mode.setAttribute("aria-pressed", String(edit));
  const treeTools = el("div", "tree-tools");
  append(
    treeTools,
    button(
      "⊞",
      () => {
        expanded = new Set(
          p.nodes.filter((n) => n.kind === "group").map((n) => n.id),
        );
        render();
      },
      "icon-button",
      t("expand"),
    ),
    button(
      "⊟",
      () => {
        expanded.clear();
        render();
      },
      "icon-button",
      t("collapse"),
    ),
  );
  if (edit)
    append(
      treeTools,
      button("+ " + t("group"), () => nodeForm("group"), "button small"),
      button("+ " + t("block"), () => nodeForm("block"), "button small"),
    );
  treeTools.append(mode);
  aside.append(treeTools);
  const tree = el("div", "tree-scroll");
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-label", p.name);
  const flat: { n: PlcNode; level: number }[] = [];
  const map = new Map<string | null, PlcNode[]>();
  for (const n of p.nodes) {
    const list = map.get(n.parentId) || [];
    list.push(n);
    map.set(n.parentId, list);
  }
  const priorities = { OB: 1, FC: 2, FB: 3, DB: 4, UDT: 5, TAGS: 6, OTHER: 7 };
  for (const [parent, values] of map)
    values.sort(
      (a, b) =>
        (parent === null
          ? (["Program blocks", "PLC tags", "PLC data types"].indexOf(a.name) +
              1 || 100) -
            (["Program blocks", "PLC tags", "PLC data types"].indexOf(b.name) +
              1 || 100)
          : 0) ||
        Number(a.kind === "group") - Number(b.kind === "group") ||
        priorities[a.blockType] - priorities[b.blockType] ||
        a.name.localeCompare(b.name, lang, { numeric: true }),
    );
  function visit(parent: string | null, level: number) {
    for (const n of map.get(parent) || []) {
      flat.push({ n, level });
      if (expanded.has(n.id)) visit(n.id, level + 1);
    }
  }
  visit(null, 1);
  let start = -1;
  function windowRows() {
    const next = Math.max(0, Math.floor(tree.scrollTop / TREE_ROW_HEIGHT) - 8);
    if (next === start) return;
    start = next;
    const end = Math.min(
      flat.length,
      start + Math.ceil((tree.clientHeight || 600) / TREE_ROW_HEIGHT) + 20,
    );
    tree.replaceChildren();
    const top = el("div");
    top.style.height = start * TREE_ROW_HEIGHT + "px";
    tree.append(top);
    for (let i = start; i < end; i++) {
      const { n, level } = flat[i];
      const row = el(
        "div",
        "tree-row" +
          (n.kind === "group" ? " tree-group" : "") +
          (n.parentId === null ? " tree-root" : "") +
          (selected === n.id ? " selected" : ""),
      );
      row.style.paddingLeft = (level - 1) * 16 + 10 + "px";
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-level", String(level));
      row.setAttribute("aria-selected", String(selected === n.id));
      row.tabIndex = 0;
      row.dataset.node = n.id;
      if (n.kind === "group") {
        row.setAttribute("aria-expanded", String(expanded.has(n.id)));
        row.append(
          button(
            expanded.has(n.id) ? "▾" : "▸",
            () => toggle(n),
            "tree-toggle",
            t(expanded.has(n.id) ? "collapse" : "expand"),
          ),
        );
      } else row.append(el("span", "tree-toggle", ""));
      append(
        row,
        el(
          "span",
          "node-icon " +
            (n.kind === "group"
              ? "folder" + (expanded.has(n.id) ? " opened" : "")
              : n.blockType.toLowerCase()) +
            (n.safety ? " safety" : ""),
          "",
        ),
        el("span", "node-name", label(n)),
      );
      row.title = pathName(p, n.id);
      row.onclick = (e) => {
        if ((e.target as HTMLElement).closest("button") || e.detail > 1) return;
        if (n.kind === "group") toggle(n);
        else chooseNode(n);
      };
      row.onkeydown = (e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        if (["ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
        if (e.key === "Enter") {
          e.preventDefault();
          if (n.kind === "group") toggle(n);
          else chooseNode(n);
        }
        if (e.key === "ArrowRight" && n.kind === "group") {
          if (!expanded.has(n.id)) toggle(n);
        }
        if (e.key === "ArrowLeft") {
          if (expanded.has(n.id)) toggle(n);
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const target = Math.max(
            0,
            Math.min(flat.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)),
          );
          tree.scrollTop = Math.max(0, (target - 4) * TREE_ROW_HEIGHT);
          start = -1;
          windowRows();
          tree
            .querySelector<HTMLElement>(`[data-node="${flat[target].n.id}"]`)
            ?.focus();
        }
      };
      if (edit)
        row.oncontextmenu = (e) => {
          e.preventDefault();
          selected = n.id;
          menu(n.name, nodeActions(n), e);
        };
      tree.append(row);
    }
    const bottom = el("div");
    bottom.style.height = (flat.length - end) * TREE_ROW_HEIGHT + "px";
    tree.append(bottom);
  }
  function toggle(n: PlcNode) {
    expanded.has(n.id) ? expanded.delete(n.id) : expanded.add(n.id);
    const focused =
      document.activeElement?.closest<HTMLElement>("[data-node]")?.dataset.node;
    const scroll = tree.scrollTop;
    flat.length = 0;
    visit(null, 1);
    remember();
    start = -1;
    tree.scrollTop = Math.min(
      scroll,
      Math.max(0, flat.length * TREE_ROW_HEIGHT - tree.clientHeight),
    );
    windowRows();
    if (focused)
      tree
        .querySelector<HTMLElement>(`[data-node="${focused}"]`)
        ?.focus({ preventScroll: true });
  }
  tree.onscroll = () => {
    treePositions.set(p.id, tree.scrollTop);
    windowRows();
  };
  aside.append(tree);
  const footer = el("div", "explorer-footer");
  const hasSources = p.documents.some(isTiaSource);
  append(
    footer,
    button("↓ JSON", () => exportProject(p), "button small"),
    button(
      "↓ " + (hasSources ? "XML/SCL ZIP" : t("backup")),
      () => exportProject(p, hasSources ? "sources" : "backup"),
      "button small",
    ),
    button(
      "•••",
      (event) =>
        menu(p.name, [
          ...projectActions(p).filter(
            (a) =>
              edit || ["export", "exportZip", "backup", "history"].includes(a.key),
          ),
          { key: "compare", action: compareImport },
          ...(edit
            ? [
                {
                  key: "reset" as Key,
                  danger: true,
                  action: () =>
                    confirmAction(t("confirmReset"), async () => {
                      const next = clone(p);
                      next.nodes = [];
                      next.documents = [];
                      selected = null;
                      await commit(next);
                    }),
                },
              ]
            : []),
        ], event),
      "icon-button",
      t("more"),
    ),
  );
  aside.append(footer);
  const separator = el("div", "separator");
  separator.setAttribute("role", "separator");
  separator.setAttribute("aria-label", t("parent"));
  separator.setAttribute("aria-orientation", "vertical");
  separator.tabIndex = 0;
  separator.setAttribute("aria-valuemin", "220");
  separator.setAttribute("aria-valuemax", "520");
  separator.setAttribute(
    "aria-valuenow",
    String(aside.offsetWidth || setting("width") || 300),
  );
  function width(value: number) {
    const w = Math.max(220, Math.min(520, value));
    aside.style.width = w + "px";
    setting("width", w);
    separator.setAttribute("aria-valuenow", String(w));
  }
  separator.onpointerdown = (e) => {
    separator.setPointerCapture(e.pointerId);
    separator.onpointermove = (ev) =>
      width(ev.clientX - aside.getBoundingClientRect().left);
    separator.onpointerup = () => (separator.onpointermove = null);
  };
  separator.onkeydown = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      width(aside.offsetWidth + (e.key === "ArrowLeft" ? -20 : 20));
    }
  };
  const center = el("section", "document-area");
  const tabbar = el("div", "tabs");
  tabbar.setAttribute("role", "tablist");
  tabbar.setAttribute("aria-label", t("openTabs"));
  for (const id of tabs) {
    const doc = p.documents.find((d) => d.id === id);
    if (!doc) continue;
    const tab = el("div", "tab" + (activeDoc === id ? " active" : ""));
    const open = button(doc.name, () => openDoc(id), "tab-label");
    open.setAttribute("role", "tab");
    open.setAttribute("aria-selected", String(activeDoc === id));
    append(
      tab,
      open,
      button(
        "×",
        () => {
          tabs = tabs.filter((x) => x !== id);
          if (activeDoc === id) {
            activeDoc = tabs.at(-1) || null;
            if (activeDoc)
              selected =
                p.documents.find((d) => d.id === activeDoc)?.nodeId || selected;
          }
          render();
        },
        "tab-close",
        t("close") + " " + doc.name,
      ),
    );
    tabbar.append(tab);
  }
  const tabsBar = el("div", "tabs-bar");
  const closeOthers = button(
    t("closeOtherTabs"),
    () => {
      if (!activeDoc) return;
      tabs = [activeDoc];
      selected =
        p.documents.find((doc) => doc.id === activeDoc)?.nodeId || selected;
      render();
      root
        .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.focus();
    },
    "tab-keep-current",
    t("closeOtherTabsHint"),
  );
  closeOthers.disabled = !activeDoc || tabs.length < 2;
  tabsBar.append(tabbar, closeOthers);
  center.append(tabsBar);
  const viewer = el("div", "viewer");
  center.append(viewer);
  const node = p.nodes.find((n) => n.id === selected);
  const doc = p.documents.find((d) => d.id === activeDoc);
  const heading = el("div", "viewer-heading");
  viewer.append(heading);
  if (node) renderNodeHeader(viewer, heading, node, doc);
  const content = el("div", "document-content");
  content.id = "document-content";
  viewer.append(content);
  if (doc) {
    void renderDocument(content, heading, doc, ++contentEpoch).catch((e) => {
      content.replaceChildren(
        el("p", "error-note", t("pdfError")),
        el("p", "muted", (e as Error).message),
      );
    });
  } else {
    const empty = el("div", "empty-document");
    append(
      empty,
      el("div", "empty-icon", "▤"),
      el("h2", "", node ? label(node) : t("noDoc")),
      el("p", "muted", node?.description || t("noDocHint")),
    );
    if (node?.notes)
      append(empty, el("h3", "", t("notes")), el("p", "prose", node.notes));
    content.append(empty);
  }
  const status = el("div", "statusbar");
  append(
    status,
    el("span", "", edit ? t("editMode") : t("read")),
    el("span", "", t("version") + " " + p.revision),
    authorCredit(),
    el("span", "", t("saved")),
  );
  center.append(status);
  append(main, aside, separator, center);
  requestAnimationFrame(() => {
    const index = flat.findIndex((row) => row.n.id === selected);
    tree.scrollTop = treePositions.get(p.id) || 0;
    if (
      index >= 0 &&
      (index * TREE_ROW_HEIGHT < tree.scrollTop ||
        (index + 1) * TREE_ROW_HEIGHT > tree.scrollTop + tree.clientHeight)
    )
      tree.scrollTop = Math.max(0, (index - 3) * TREE_ROW_HEIGHT);
    windowRows();
  });
}
function chooseNode(n: PlcNode) {
  selected = n.id;
  const doc = current!.documents.find((d) => d.nodeId === n.id);
  if (doc) openDoc(doc.id);
  else {
    activeDoc = null;
    render();
  }
}
function openDoc(id: string) {
  const doc = current?.documents.find((d) => d.id === id);
  if (!doc) return;
  selected = doc.nodeId;
  activeDoc = id;
  if (!tabs.includes(id)) tabs.push(id);
  let node = current!.nodes.find((n) => n.id === selected);
  while (node?.parentId) {
    expanded.add(node.parentId);
    node = current!.nodes.find((n) => n.id === node!.parentId);
  }
  render();
}
function crossReference(node: PlcNode, operand?: string) {
  const p = current!;
  const index = tiaReferences(p);
  const doc = p.documents.find(
    (d) => d.nodeId === node.id && /\.xml$/i.test(d.name) && d.text,
  );
  let initial = node.name.replace(/\s*\[[^\]]+\]$/, "");
  if (operand !== undefined) initial = operand;
  else if (doc?.text) {
    try {
      initial = parseTia(doc.text).name;
    } catch {}
  }
  const body = el("div", "dialog-body");
  const search = field(
    lang === "pl" ? "Blok lub zmienna" : "Block or variable",
    "search",
    initial,
  );
  search.input.placeholder = "FC_Program / Data_block.Start / #Start";
  const results = el("div", "xref-results");
  const hint = el(
    "p",
    "muted",
    lang === "pl"
      ? "Odwołania w zaimportowanych sieciach XML. R: odczyt, W: zapis, ?: nierozpoznane. Zmienne #lokalne są wyszukiwane w bieżącym bloku. Podaj pełną nazwę; nazwa DB obejmuje też jego pola."
      : "References in imported XML networks. R: read, W: write, ?: unknown. #Locals are scoped to this block. Enter a full name; DB names include their members.",
  );
  body.append(search.wrap, hint, results);
  const actions = el("div", "dialog-actions");
  const dialog = modal("Cross-reference", body, actions);
  const onBackdrop = (event: MouseEvent) => {
    if (event.target !== dialog) return false;
    const { left, top, right, bottom } = dialog.getBoundingClientRect();
    return (
      event.clientX < left ||
      event.clientX >= right ||
      event.clientY < top ||
      event.clientY >= bottom
    );
  };
  let startedOnBackdrop = false;
  dialog.addEventListener("pointerdown", (event) => {
    startedOnBackdrop = onBackdrop(event);
  });
  dialog.addEventListener("click", (event) => {
    if (startedOnBackdrop && onBackdrop(event)) dialog.close();
    startedOnBackdrop = false;
  });
  actions.append(button(t("close"), () => dialog.close()));
  const show = () => {
    results.replaceChildren();
    const matches = matchingReferences(
      index.references,
      search.input.value,
      node.id,
    );
    results.append(
      el(
        "p",
        "muted",
        `${matches.length} ${lang === "pl" ? "odwołań" : "references"} · XML`,
      ),
    );
    for (const r of matches.slice(0, 500)) {
      results.append(
        button(
          `${r.symbol} · ${r.usage} · ${r.block} · ${lang === "pl" ? "Sieć" : "Network"} ${r.network}`,
          () => {
            dialog.close();
            openDoc(r.docId);
            requestAnimationFrame(() => {
              const target = document.querySelector<HTMLDetailsElement>(
                `.tia-view [data-network="${r.network}"]`,
              );
              if (target) {
                target.open = true;
                target.classList.add("xref-target");
                target.scrollIntoView({ block: "center" });
              }
            });
          },
          "xref-result",
        ),
      );
    }
    if (!matches.length)
      results.append(
        el(
          "p",
          "muted",
          lang === "pl"
            ? "Brak odwołań w dostępnych sieciach XML."
            : "No references in available XML networks.",
        ),
      );
    if (matches.length > 500)
      results.append(
        el(
          "p",
          "muted",
          lang === "pl"
            ? "Wyświetlono pierwsze 500 wyników."
            : "Showing first 500 results.",
        ),
      );
    if (index.skipped)
      results.append(
        el(
          "p",
          "muted",
          `${lang === "pl" ? "Pominięte pliki XML" : "Skipped XML files"}: ${index.skipped}`,
        ),
      );
  };
  search.input.oninput = show;
  show();
  search.input.select();
  search.input.focus();
}
function renderNodeHeader(
  host: HTMLElement,
  heading: HTMLElement,
  n: PlcNode,
  doc?: Doc,
) {
  const header = el("div", "node-header");
  const bar = el("div", "node-toolbar");
  const line = el("div", "node-title-line");
  append(
    line,
    el("span", "type-badge", n.kind === "group" ? t("group") : n.blockType),
    el("h2", "", label(n)),
    ...(edit
      ? [button(t("edit"), () => nodeForm(n.kind, n), "button small")]
      : []),
  );
  bar.append(line);
  const actions = doc
    ? renderDocumentToolbar(doc)
    : el("div", "document-toolbar");
  if (n.kind === "block")
    actions.append(
      button("Cross-reference", () => crossReference(n), "button small"),
    );
  if (actions.childElementCount) bar.append(actions);
  heading.append(bar);
  if (n.description) header.append(el("p", "muted", n.description));
  const docs = el("div", "doc-list");
  const nodeDocs = current!.documents.filter((d) => d.nodeId === n.id);
  for (const d of edit || nodeDocs.length > 1 ? nodeDocs : []) {
    docs.append(
      button(
        (d.mime === "application/pdf"
          ? "PDF "
          : /\.xml$/i.test(d.name)
            ? "XML "
            : "TXT ") + d.name,
        () => openDoc(d.id),
        "doc-chip" + (activeDoc === d.id ? " active" : ""),
      ),
    );
  }
  if (edit)
    append(
      docs,
      button("+ " + t("attach"), () => attach(n), "button small"),
      button("+ " + t("addUrl"), () => urlForm(n), "button small"),
      button("+ " + t("addText"), () => textForm(n), "button small"),
    );
  if (docs.childElementCount) header.append(docs);
  if (n.alarmCode || n.remedy || n.sequence) {
    const details = el("details", "diagnostics");
    details.append(el("summary", "", t("diagnostics")));
    for (const [key, value] of [
      ["alarm", n.alarmCode],
      ["remedy", n.remedy],
      ["sequence", n.sequence],
    ] as [Key, string][])
      if (value)
        append(details, el("strong", "", t(key)), el("p", "prose", value));
    header.append(details);
  }
  if (header.childElementCount) host.append(header);
}
async function attach(n: PlcNode) {
  const files = await pick(".pdf,.scl,.txt,.csv,.xml,.awl,.st,.md,.vbs", true);
  if (!files.length || !current) return;
  const next = clone(current);
  const assets: Asset[] = [];
  for (const file of files) {
    const doc = docFromFile(file, n.id);
    if (doc.mime !== "application/pdf") {
      if (file.size > 2 * 1024 * 1024) throw Error(t("textLimit"));
      doc.text = await decodeText(file);
      doc.size = new TextEncoder().encode(doc.text).length;
    } else assets.push({ id: doc.id, projectId: next.id, blob: file });
    next.documents.push(doc);
  }
  await commit(next, assets);
  openDoc(next.documents.at(-1)!.id);
}
function urlForm(n: PlcNode, doc?: Doc) {
  const name = field(t("name"), "text", doc?.name || "");
  name.input.required = true;
  const url = field(t("url"), "text", doc?.url || "");
  url.input.required = true;
  formDialog(t("addUrl"), [name.wrap, url.wrap], async () => {
    const next = clone(current!);
    const value = safeUrl(url.input.value.trim());
    if (doc)
      Object.assign(next.documents.find((d) => d.id === doc.id)!, {
        name: name.input.value,
        url: value,
      });
    else
      next.documents.push({
        id: uuid(),
        nodeId: n.id,
        name: name.input.value,
        mime: "application/pdf",
        url: value,
        size: 0,
      });
    await commit(next);
  });
}
function textForm(n: PlcNode, doc?: Doc) {
  const name = field(t("name"), "text", doc?.name || "Code.scl");
  name.input.required = true;
  const text = field(t("content"), "textarea", doc?.text || "");
  text.input.classList.add("code-input");
  formDialog(t("addText"), [name.wrap, text.wrap], async () => {
    const next = clone(current!);
    if (new TextEncoder().encode(text.input.value).length > 2 * 1024 * 1024)
      throw Error(t("textLimit"));
    const value = {
      name: name.input.value,
      text: text.input.value,
      size: new TextEncoder().encode(text.input.value).length,
    };
    if (doc) Object.assign(next.documents.find((d) => d.id === doc.id)!, value);
    else
      next.documents.push({
        id: uuid(),
        nodeId: n.id,
        mime: "text/plain",
        ...value,
      });
    await commit(next);
  });
}
function renderDocumentToolbar(doc: Doc) {
  const p = current!;
  const toolbar = el("div", "document-toolbar");
  append(
    toolbar,
    el("span", "muted document-name", doc.name),
    el(
      "span",
      "muted document-size",
      doc.url ? "URL" : Math.ceil(doc.size / 1024) + " KiB",
    ),
    button(
      t("download"),
      async () => {
        if (doc.url)
          window.open(
            new URL(safeUrl(doc.url), location.href).href,
            "_blank",
            "noopener,noreferrer",
          );
        else
          download(
            doc.name,
            doc.mime !== "application/pdf" && doc.text !== undefined
              ? new Blob([doc.text], { type: "text/plain" })
              : (await repo.asset(doc.id))!,
          );
      },
      "button small",
    ),
  );
  if (doc.url) {
    const a = el("a", "button small", t("external"));
    a.href = safeUrl(doc.url);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    toolbar.append(a);
  }
  if (edit && doc.mime !== "application/pdf" && doc.text !== undefined)
    toolbar.append(
      button(t("compareCode"), () => compareText(doc), "button small"),
    );
  if (edit)
    append(
      toolbar,
      button(
        t("edit"),
        () =>
          doc.mime !== "application/pdf" && doc.text !== undefined
            ? textForm(p.nodes.find((n) => n.id === doc.nodeId)!, doc)
            : doc.url
              ? urlForm(p.nodes.find((n) => n.id === doc.nodeId)!, doc)
              : renameDocument(doc),
        "button small",
      ),
      button(
        t("delete"),
        () =>
          confirmAction(t("confirmDelete"), async () => {
            const next = clone(current!);
            next.documents = next.documents.filter((d) => d.id !== doc.id);
            tabs = tabs.filter((id) => id !== doc.id);
            activeDoc = null;
            await commit(next);
          }),
        "button small danger-text",
      ),
    );
  return toolbar;
}
async function renderDocument(
  host: HTMLElement,
  heading: HTMLElement,
  doc: Doc,
  epoch: number,
) {
  const p = current!;
  const content = el("div", "document-preview");
  host.append(content);
  if (doc.mime === "application/pdf") {
    content.append(el("p", "muted", t("loading")));
    const source = doc.url
      ? new URL(safeUrl(doc.url), location.href).href
      : new Uint8Array(await (await repo.asset(doc.id))!.arrayBuffer());
    if (epoch !== contentEpoch) return;
    const dispose = await pdfView(content, source, t, async (text) => {
      const next = clone(current!);
      const d = next.documents.find((d) => d.id === doc.id);
      if (!d) return;
      d.text = text;
      await commit(next);
      notify(t("pdfIndexed"));
    });
    if (epoch !== contentEpoch) dispose();
    else pdfDispose = dispose;
  } else {
    const pre = el("pre", "code-view");
    const code = el("code");
    const text = doc.text ?? (await (await repo.asset(doc.id))!.text());
    if (epoch !== contentEpoch) return;
    if (
      /\.xml$/i.test(doc.name) &&
      /<SW\.(Blocks|Types|Tags|TechnologicalObjects)\./.test(text)
    ) {
      try {
        const view = tiaView(
          text,
          lang,
          (name, type) => {
            const target = resolveTiaCall(p, name, type);
            return target ? () => openDoc(target.id) : undefined;
          },
          tiaSymbolIndex(p),
          (operand) => {
            const node = p.nodes.find((n) => n.id === doc.nodeId);
            if (node) crossReference(node, operand);
          },
        );
        const controls = view.querySelector(".tia-network-tools");
        if (controls) heading.append(controls);
        heading.classList.add("tia-viewer-heading");
        content.append(view);
        return;
      } catch (error) {
        content.append(el("p", "muted", String(error)));
      }
    }
    if (/\.(scl|st)$/i.test(doc.name) && text.length <= 150000) {
      for (const token of tokenize(text))
        code.append(el("span", "token-" + token.kind, token.text));
    } else code.textContent = text;
    pre.append(code);
    content.append(pre);
  }
}
function renameDocument(doc: Doc) {
  const name = field(t("name"), "text", doc.name);
  name.input.required = true;
  formDialog(t("rename"), [name.wrap], async () => {
    const next = clone(current!);
    next.documents.find((d) => d.id === doc.id)!.name = name.input.value;
    await commit(next);
  });
}
async function compareText(doc: Doc) {
  const [file] = await pick(".txt,.scl,.st,.vbs,.xml,.csv,.awl");
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) throw Error(t("textLimit"));
  const before = doc.text || "";
  const after = await decodeText(file);
  const body = el("div", "dialog-body");
  const pre = el("pre", "diff-view");
  const changes = diffLines(before, after, {
    timeout: 1000,
    maxEditLength: 20000,
  });
  if (!changes)
    throw Error(
      lang === "pl"
        ? "Porównanie przekracza limit czasu. Użyj mniejszych plików."
        : "Comparison exceeds time limit. Use smaller files.",
    );
  for (const part of changes) {
    const span = el(
      "span",
      part.added ? "added" : part.removed ? "removed" : "",
      part.value,
    );
    pre.append(span);
  }
  body.append(el("p", "muted", doc.name + " → " + file.name), pre);
  modal(t("compareCode"), body);
}
window.addEventListener("beforeunload", (e) => {
  if (pending) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    document.getElementById("global-search")?.focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (current)
      void exportProject(pending || current).catch((err) =>
        notify(String(err), true),
      );
  }
  if (e.key === "Escape") {
    document.getElementById("context-menu")?.remove();
    document.getElementById("search-results")?.remove();
  }
});
async function boot() {
  try {
    await repo.open();
    await repo.migrate(localStorage);
    projects = await repo.list();
    if (repo.channel)
      repo.channel.onmessage = async () => {
        projects = await repo.list();
        if (current) {
          const changed = projects.find((p) => p.id === current!.id);
          if (changed?.revision !== current.revision)
            notify(t("conflict"), true);
        } else render();
      };
    const params = new URLSearchParams(location.search);
    const pid = params.get("pid");
    const slug = params.get("slug");
    if (params.get("demo") === "1") {
      if (params.get("lang") === "en") {
        lang = "en";
        t = translator(lang);
      }
      await openExample();
      return;
    }
    if (!pid && !slug && params.has("project")) {
      const token = params.get("project")!;
      let data: unknown;
      if (token.startsWith("ls:")) {
        const raw = sessionStorage.getItem(token.slice(3));
        if (!raw) throw Error("Legacy session no longer exists");
        data = JSON.parse(raw);
      } else if (
        token.startsWith("b64:") ||
        token.startsWith("data:application/json;base64,")
      ) {
        const raw = atob(
          token.startsWith("b64:") ? token.slice(4) : token.split(",")[1],
        );
        data = JSON.parse(
          new TextDecoder().decode(
            Uint8Array.from(raw, (c) => c.charCodeAt(0)),
          ),
        );
      } else {
        safeUrl(token);
        const response = await fetch(token, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw Error(String(response.status));
        const raw = await response.text();
        if (raw.length > 8 * 1024 * 1024)
          throw Error("Legacy JSON exceeds 8 MiB");
        data = JSON.parse(raw);
      }
      const imported = importData(data);
      await repo.writeMany(
        imported.map((project) => ({ project, expected: null })),
      );
      if (imported[0]) {
        await openProject(imported[0].id);
        return;
      }
    }
    const previous = setting("last");
    const requested = pid
      ? projects.find((p) => p.id === pid || p.legacyId === pid)
      : slug
        ? projects.find((p) => p.slug === slug)
        : projects.find((p) => p.id === previous?.projectId && !p.deletedAt);
    if (requested?.deletedAt) {
      trash = true;
    }
    if ((pid || slug) && !requested) notify(t("selectProject"), true);
    if (requested && !requested.deletedAt) {
      current = requested;
      selected =
        previous?.projectId === requested.id ? previous.selected : null;
      tabs =
        previous?.projectId === requested.id
          ? (Array.isArray(previous.tabs) ? previous.tabs : []).filter(
              (id: string) => requested.documents.some((d) => d.id === id),
            )
          : [];
      activeDoc = tabs.includes(previous?.activeDoc)
        ? previous.activeDoc
        : null;
      expanded = new Set(
        previous?.projectId === requested.id && Array.isArray(previous.expanded)
          ? previous.expanded
          : requested.nodes.filter((n) => n.parentId === null).map((n) => n.id),
      );
    }
    render();
  } catch (e) {
    root.replaceChildren();
    const panel = el("main", "fatal");
    panel.append(
      el("h1", "", "PLC Viewer"),
      el("p", "", t("storageError")),
      el("pre", "", (e as Error).message),
      button(t("legacyBackup"), () => {
        const raw = localStorage.getItem("ppv.projects");
        if (raw) download("plc-viewer-recovery.json", raw);
      }),
      button(t("reload"), () => location.reload()),
    );
    root.append(panel);
  }
}
void boot();

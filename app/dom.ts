export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
) {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
export function button(
  label: string,
  action: (event: MouseEvent) => unknown,
  className = "button",
  title = label,
) {
  const b = el("button", className, label);
  b.type = "button";
  b.title = title;
  b.setAttribute("aria-label", title);
  b.addEventListener("click", (event) => {
    Promise.resolve().then(() => action(event)).catch(showError);
  });
  return b;
}
let errorHandler = (e: unknown) => console.error(e);
export function onError(handler: (e: unknown) => void) {
  errorHandler = handler;
}
export function showError(e: unknown) {
  errorHandler(e);
}
export const append = (
  parent: HTMLElement,
  ...items: (Node | string | undefined | null)[]
) => {
  for (const item of items) if (item != null) parent.append(item);
  return parent;
};
export function field(label: string, type = "text", value = "") {
  const wrap = el("label", "field");
  wrap.append(el("span", "", label));
  const input = type === "textarea" ? el("textarea") : el("input");
  if (input instanceof HTMLInputElement) input.type = type;
  input.value = value;
  input.setAttribute("aria-label", label);
  wrap.append(input);
  return { wrap, input };
}
export function selectField(
  label: string,
  options: { value: string; label: string }[],
  value: string,
) {
  const wrap = el("label", "field");
  wrap.append(el("span", "", label));
  const input = el("select");
  for (const o of options) input.add(new Option(o.label, o.value));
  input.value = value;
  input.setAttribute("aria-label", label);
  wrap.append(input);
  return { wrap, input };
}
export function modal(
  title: string,
  content: HTMLElement,
  actions?: HTMLElement,
) {
  const dialog = el("dialog", "dialog");
  const head = el("div", "dialog-head");
  head.append(
    el("h2", "", title),
    button(
      "×",
      () => dialog.close(),
      "icon-button",
      document.documentElement.lang === "pl" ? "Zamknij" : "Close",
    ),
  );
  dialog.append(head, content);
  if (actions) dialog.append(actions);
  document.body.append(dialog);
  // Native dialog restores focus; a delayed manual restore could steal Ctrl+K focus.
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  queueMicrotask(() =>
    dialog.querySelector<HTMLInputElement>("input, textarea, select")?.focus(),
  );
  return dialog;
}
export function download(
  name: string,
  data: Blob | string,
  type = "application/json",
) {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const filename = (name: string) =>
  name.replace(/[^\p{L}\p{N}_.-]/gu, "_").slice(0, 100) || "project";


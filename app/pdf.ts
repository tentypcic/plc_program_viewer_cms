import { el, button, append } from "./dom";
import type { translator } from "./i18n";
export async function pdfView(
  host: HTMLElement,
  data: Uint8Array | string,
  t: ReturnType<typeof translator>,
  onIndex: (text: string) => Promise<void>,
) {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
    .default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  let disposed = false,
    page = 1,
    scale = 1.2;
  let task: any = null;
  let renderEpoch = 0;
  const toolbar = el("div", "pdf-toolbar");
  const label = el("span");
  const viewport = el("div", "pdf-canvas");
  const canvas = el("canvas");
  viewport.append(canvas);
  host.replaceChildren(toolbar, viewport);
  const loading = pdfjs.getDocument(
    typeof data === "string"
      ? { url: data, isEvalSupported: false }
      : { data, isEvalSupported: false },
  );
  const pdf = await loading.promise;
  async function draw() {
    const epoch = ++renderEpoch;
    task?.cancel();
    try {
      const p = await pdf.getPage(page);
      if (disposed || epoch !== renderEpoch) return;
      const view = p.getViewport({ scale });
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = view.width * ratio;
      canvas.height = view.height * ratio;
      canvas.style.width = view.width + "px";
      canvas.style.height = view.height + "px";
      label.textContent = `${t("page")} ${page} / ${pdf.numPages}`;
      task = p.render({
        canvasContext: canvas.getContext("2d")!,
        viewport: view,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await task.promise;
    } catch (e) {
      if ((e as Error).name !== "RenderingCancelledException" && !disposed)
        throw e;
    }
  }
  const go = el("input");
  go.type = "number";
  go.min = "1";
  go.max = String(pdf.numPages);
  go.value = "1";
  go.setAttribute("aria-label", t("page"));
  go.onchange = () => {
    page = Math.max(1, Math.min(pdf.numPages, Number(go.value) || 1));
    go.value = String(page);
    void draw();
  };
  append(
    toolbar,
    button(
      "‹",
      async () => {
        page = Math.max(1, page - 1);
        go.value = String(page);
        await draw();
      },
      "icon-button",
      t("page") + " −",
    ),
    label,
    go,
    button(
      "›",
      async () => {
        page = Math.min(pdf.numPages, page + 1);
        go.value = String(page);
        await draw();
      },
      "icon-button",
      t("page") + " +",
    ),
    button(
      "−",
      async () => {
        scale = Math.max(0.3, scale - 0.2);
        await draw();
      },
      "icon-button",
      t("zoom") + " −",
    ),
    button(
      "+",
      async () => {
        scale = Math.min(3, scale + 0.2);
        await draw();
      },
      "icon-button",
      t("zoom") + " +",
    ),
  );
  const index = button(
    t("pdfIndex"),
    async () => {
      index.disabled = true;
      try {
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          if (disposed) return;
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text +=
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" ") + "\n";
          if (text.length > 2000000)
            throw Error("PDF text exceeds 2 million characters");
        }
        await onIndex(text);
      } finally {
        index.disabled = false;
      }
    },
    "button small",
  );
  toolbar.append(index);
  await draw();
  return () => {
    disposed = true;
    task?.cancel();
    void pdf.destroy();
  };
}

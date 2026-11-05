import { chromium } from "playwright";
import { createServer } from "vite";
import assert from "node:assert/strict";
const server = await createServer({ server: { port: 0 } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  const result = await page.evaluate(async () => {
    const { tiaView } = await import("/app/tia.ts");
    const pin = (id, name) => `<NameCon UId="${id}" Name="${name}"/>`;
    let wireId = 100;
    const wire = (con) => `<Wire UId="${wireId++}">${con}</Wire>`;
    const access = (id, name) =>
      `<Access Scope="LocalVariable" UId="${id}"><Symbol><Component Name="${name}"/></Symbol></Access>`;
    const names = [
      "Machine.Axis.Status.ReadyForSynchronousMovement",
      "Machine.Axis.Status.DriveFaultNeedsAcknowledgement",
      "OperatorPanel.Request.ResetAllDriveFaults",
      "Machine.Axis.Command.PositionSetpoint",
      "Sequence.EdgeMemory[2]",
    ];
    const call = (id, name, params) =>
      `<Call UId="${id}"><CallInfo Name="${name}" BlockType="FB">${params.map(([name, section]) => `<Parameter Name="${name}" Section="${section}"/>`).join("")}</CallInfo></Call>`;
    const network = (parts, wires) =>
      `<SW.Blocks.CompileUnit><AttributeList><NetworkSource><FlgNet><Parts>${names.map((n, i) => access(i + 1, n)).join("")}${parts}</Parts><Wires>${wires}</Wires></FlgNet></NetworkSource></AttributeList></SW.Blocks.CompileUnit>`;
    const first = network(
      call(20, "DrivePreparation", [
        ["Reset", "Input"],
        ["Position", "Input"],
        ["Ready", "Output"],
      ]) +
        '<Part Name="PContact" UId="21"/><Part Name="Contact" UId="22"/><Part Name="O" UId="23"/>' +
        call(24, "DriveExecution", [
          ["Synchronize", "Input"],
          ["Error", "Input"],
          ["Feedback", "Output"],
        ]),
      wire("<Powerrail/>" + pin(20, "en") + pin(21, "in") + pin(22, "in")) +
        wire(pin(20, "eno") + pin(24, "en")) +
        wire('<IdentCon UId="3"/>' + pin(20, "Reset")) +
        wire('<IdentCon UId="4"/>' + pin(20, "Position")) +
        wire('<IdentCon UId="1"/>' + pin(21, "operand")) +
        wire('<IdentCon UId="5"/>' + pin(21, "bit")) +
        wire('<IdentCon UId="2"/>' + pin(22, "operand")) +
        wire(pin(21, "out") + pin(23, "in1")) +
        wire(pin(22, "out") + pin(23, "in2")) +
        wire(pin(23, "out") + pin(24, "Error")) +
        wire('<IdentCon UId="4"/>' + pin(24, "Synchronize")),
    );
    const second = network(
      '<Part Name="Contact" UId="30"/><Part Name="SCoil" UId="31"/><Part Name="RCoil" UId="32"/>',
      wire("<Powerrail/>" + pin(30, "in")) +
        wire('<IdentCon UId="1"/>' + pin(30, "operand")) +
        wire(pin(30, "out") + pin(31, "in") + pin(32, "in")) +
        wire('<IdentCon UId="2"/>' + pin(31, "operand")) +
        wire('<IdentCon UId="4"/>' + pin(32, "operand")),
    );
    const third = network(
      '<Part Name="Eq" UId="40"><TemplateValue Name="SrcType" Type="Type">UInt</TemplateValue></Part>' +
        '<Part Name="TON" UId="41"/><Part Name="Move" UId="42"/>' +
        '<Part Name="Contact" UId="43"/><Part Name="Move" UId="44"/><Part Name="Move" UId="45"/>',
      wire("<Powerrail/>" + pin(40, "pre") + pin(43, "in")) +
        wire('<IdentCon UId="1"/>' + pin(40, "in1")) +
        wire('<IdentCon UId="2"/>' + pin(40, "in2")) +
        wire(pin(40, "out") + pin(41, "IN")) +
        wire(pin(41, "Q") + pin(42, "en")) +
        wire('<IdentCon UId="3"/>' + pin(43, "operand")) +
        wire(pin(43, "out") + pin(44, "en") + pin(45, "en")) +
        wire('<IdentCon UId="4"/>' + pin(44, "in")) +
        wire('<IdentCon UId="1"/>' + pin(45, "in")),
    );
    const operators = {
      Eq: "==",
      Ne: "<>",
      Lt: "<",
      Le: "<=",
      Gt: ">",
      Ge: ">=",
    };
    const comparisons = Object.keys(operators).map((kind) =>
      third.replace('Name="Eq"', `Name="${kind}"`),
    );
    const xml = `<Document><SW.Blocks.FC><AttributeList><Name>LayoutSample</Name></AttributeList><ObjectList>${first}${second}${comparisons.join("")}</ObjectList></SW.Blocks.FC></Document>`;
    let networks = 0;
    for (const theme of ["light", "dark"]) {
      document.documentElement.dataset.theme = theme;
      const v = tiaView(xml);
      document.body.replaceChildren(v);
      for (const svg of v.querySelectorAll("svg")) {
        networks++;
        if (svg.querySelector("[data-route-unresolved]"))
          throw Error("Unrouted signal");
        const bbox = (e) => {
          const b = e.getBBox(),
            m = e.transform.baseVal.consolidate()?.matrix;
          return {
            x: b.x + (m?.e || 0),
            y: b.y + (m?.f || 0),
            width: b.width,
            height: b.height,
          };
        };
        const contact = svg.querySelector('[data-part="21"]');
        const comparison = svg.querySelector('[data-part="40"]');
        if (comparison) {
          const captions = [
            ...svg.querySelectorAll('text[data-owner="40"]'),
          ].map((e) => e.firstChild?.textContent);
          if (
            !captions.includes(operators[comparison.dataset.kind]) ||
            !captions.includes("UInt") ||
            captions.includes("PRE")
          )
            throw Error("Comparison is not rendered as a typed contact");
          const rungY = (uid) =>
            +svg.querySelector(`[data-part="${uid}"]`).dataset.layoutY;
          if (rungY(40) !== rungY(41) || rungY(41) !== rungY(42))
            throw Error("Comparison, TON and MOVE must share a rung");
        }
        if (contact) {
          const x = +contact.dataset.layoutX,
            y = +contact.dataset.layoutY + 44;
          const routes = [...svg.querySelectorAll("[data-route]")].map((e) =>
            JSON.parse(e.getAttribute("data-route")),
          );
          if (
            !routes.some((p) =>
              [p[0], p.at(-1)].some(
                (pt) => Math.abs(pt.x - x) < 0.1 && Math.abs(pt.y - y) < 0.1,
              ),
            )
          )
            throw Error("Pulse contact input misses its symbol");
        }
        const texts = [...svg.querySelectorAll("text")];
        for (let i = 0; i < texts.length; i++) {
          const a = bbox(texts[i]);
          if (
            a.x < 0 ||
            a.y < 0 ||
            a.x + a.width > +svg.getAttribute("width") ||
            a.y + a.height > +svg.getAttribute("height")
          )
            throw Error("Clipped text");
          for (let j = i + 1; j < texts.length; j++) {
            const b = bbox(texts[j]);
            if (
              a.x + 1 < b.x + b.width &&
              b.x + 1 < a.x + a.width &&
              a.y + 1 < b.y + b.height &&
              b.y + 1 < a.y + a.height
            )
              throw Error("Overlapping text");
          }
        }
        const obstacles = [...svg.querySelectorAll("text,rect")]
          .filter(
            (e) =>
              e.tagName === "text" ||
              e.classList.contains("tia-symbol-hit") ||
              e.getAttribute("fill")?.startsWith("var(--tia-box"),
          )
          .map(bbox);
        const stubs = [...svg.querySelectorAll(".tia-operand-stub")].map(bbox);
        for (const path of svg.querySelectorAll("[data-route]")) {
          const points = JSON.parse(path.getAttribute("data-route"));
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1],
              b = points[i];
            if (
              a.x === b.x &&
              stubs.some(
                (r) =>
                  a.x > r.x - 4 &&
                  a.x < r.x + r.width + 4 &&
                  Math.min(a.y, b.y) <= r.y &&
                  Math.max(a.y, b.y) >= r.y,
              )
            )
              throw Error("Branch bus runs too close to an operand stub");
          }
          for (let i = 1; i < points.length; i++)
            for (const r of obstacles) {
              const a = points[i - 1],
                b = points[i];
              const hit =
                a.x === b.x
                  ? a.x > r.x + 1 &&
                    a.x < r.x + r.width - 1 &&
                    Math.max(a.y, b.y) > r.y + 1 &&
                    Math.min(a.y, b.y) < r.y + r.height - 1
                  : a.y > r.y + 1 &&
                    a.y < r.y + r.height - 1 &&
                    Math.max(a.x, b.x) > r.x + 1 &&
                    Math.min(a.x, b.x) < r.x + r.width - 1;
              if (hit)
                throw Error("Wire enters a label, contact or instruction");
            }
        }
      }
    }
    return networks;
  });
  assert.equal(result, 16);
  console.log(
    "TIA layout: mixed FB chains, long operands, pulse/OR branches and coil fan-out passed in both themes",
  );
} finally {
  await browser.close();
  await server.close();
}

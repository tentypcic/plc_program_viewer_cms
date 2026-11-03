import test from "node:test";
import assert from "node:assert/strict";
import {
  diagramRouter,
  type DiagramPoint,
  type DiagramObstacle,
} from "../app/tia-routing";
const segments = (p: DiagramPoint[]) =>
  p.slice(1).map((end, i) => ({ start: p[i], end }));
const intersects = (a: DiagramPoint, b: DiagramPoint, r: DiagramObstacle) =>
  a.x === b.x
    ? a.x > r.x + 0.05 &&
      a.x < r.x + r.width - 0.05 &&
      Math.max(a.y, b.y) > r.y + 0.05 &&
      Math.min(a.y, b.y) < r.y + r.height - 0.05
    : a.y > r.y + 0.05 &&
      a.y < r.y + r.height - 0.05 &&
      Math.max(a.x, b.x) > r.x + 0.05 &&
      Math.min(a.x, b.x) < r.x + r.width - 0.05;
test("diagram routes around staggered instruction and label obstacles", () => {
  const obstacles = [
    { x: 30, y: 10, width: 40, height: 130 },
    { x: 100, y: 80, width: 40, height: 130 },
    { x: 165, y: 5, width: 20, height: 140 },
  ];
  const start = { x: 10, y: 60 },
    end = { x: 210, y: 140 };
  const path = diagramRouter(obstacles, [start, end])(start, end);
  assert.deepEqual(path[0], start);
  assert.deepEqual(path.at(-1), end);
  assert.ok(path.length > 3);
  for (const s of segments(path)) {
    assert.ok(s.start.x === s.end.x || s.start.y === s.end.y);
    for (const r of obstacles)
      assert.equal(intersects(s.start, s.end, r), false);
  }
});
test("unrelated signal wires do not share a parallel track", () => {
  const start = { x: 10, y: 80 },
    end = { x: 210, y: 80 };
  const route = diagramRouter([], [start, end]);
  const first = route(start, end),
    second = route(start, end, segments(first));
  assert.ok(second.some((p) => p.y !== 80));
  for (const s of segments(second)) {
    if (s.start.y === 80 && s.end.y === 80) {
      const shared =
        Math.min(210, Math.max(s.start.x, s.end.x)) -
        Math.max(10, Math.min(s.start.x, s.end.x));
      assert.ok(shared <= 0);
    }
  }
});
test("floating SVG box edges remain reachable but a buried terminal is refused", () => {
  const obstacle = { x: 100, y: 20, width: 221.10000610351562, height: 100 };
  const start = { x: 321.1, y: 60 },
    end = { x: 500, y: 60 };
  const route = diagramRouter([obstacle], [start, end, { x: 200, y: 60 }]);
  assert.ok(route(start, end).length);
  assert.deepEqual(route({ x: 200, y: 60 }, end), []);
});

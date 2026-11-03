export type DiagramPoint = { x: number; y: number };
export type DiagramSegment = { start: DiagramPoint; end: DiagramPoint };
export type DiagramObstacle = DiagramPoint & { width: number; height: number };

/** Orthogonal visibility routing. Touching a pin/body edge is allowed, entering
 * the interior of a label or an instruction is not. Coordinates stay in SVG units. */
export function diagramRouter(
  obstacles: DiagramObstacle[],
  terminals: DiagramPoint[],
) {
  const clear = (a: DiagramPoint, b: DiagramPoint) =>
    !obstacles.some((r) =>
      a.x === b.x
        ? a.x > r.x + 0.05 &&
          a.x < r.x + r.width - 0.05 &&
          Math.max(a.y, b.y) > r.y + 0.05 &&
          Math.min(a.y, b.y) < r.y + r.height - 0.05
        : a.y > r.y + 0.05 &&
          a.y < r.y + r.height - 0.05 &&
          Math.max(a.x, b.x) > r.x + 0.05 &&
          Math.min(a.x, b.x) < r.x + r.width - 0.05,
    );
  const compact = (points: DiagramPoint[]) =>
    points
      .filter(
        (p, i) => !(i && p.x === points[i - 1].x && p.y === points[i - 1].y),
      )
      .filter(
        (p, i, a) =>
          !i ||
          i === a.length - 1 ||
          !(
            (a[i - 1].x === p.x && p.x === a[i + 1].x) ||
            (a[i - 1].y === p.y && p.y === a[i + 1].y)
          ),
      );
  const xs = [
    ...new Set([
      ...terminals.flatMap((p) => [p.x, Math.max(8, p.x - 12), p.x + 12]),
      8,
      ...obstacles.flatMap((r) => [r.x - 6, r.x + r.width + 6]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      ...terminals.flatMap((p) => [p.y, Math.max(4, p.y - 12), p.y + 12]),
      4,
      ...obstacles.flatMap((r) => [Math.max(4, r.y - 6), r.y + r.height + 6]),
    ]),
  ].sort((a, b) => a - b);
  const visibility = new Map<string, boolean>();
  return (
    start: DiagramPoint,
    end: DiagramPoint,
    occupied: DiagramSegment[] = [],
  ): DiagramPoint[] => {
    const penalty = (a: DiagramPoint, b: DiagramPoint) =>
      occupied.reduce((cost, s) => {
        const c = s.start,
          d = s.end,
          h = a.y === b.y,
          otherH = c.y === d.y;
        if (h === otherH) {
          if (Math.abs((h ? a.y : a.x) - (h ? c.y : c.x)) > 6) return cost;
          const overlap =
            Math.min(
              Math.max(h ? a.x : a.y, h ? b.x : b.y),
              Math.max(h ? c.x : c.y, h ? d.x : d.y),
            ) -
            Math.max(
              Math.min(h ? a.x : a.y, h ? b.x : b.y),
              Math.min(h ? c.x : c.y, h ? d.x : d.y),
            );
          return cost + (overlap > 0.1 ? overlap * 100 + 100 : 0);
        }
        const x = h ? c.x : a.x,
          y = h ? a.y : c.y;
        return (
          cost +
          (x >= Math.min(a.x, b.x) &&
          x <= Math.max(a.x, b.x) &&
          y >= Math.min(a.y, b.y) &&
          y <= Math.max(a.y, b.y) &&
          x >= Math.min(c.x, d.x) &&
          x <= Math.max(c.x, d.x) &&
          y >= Math.min(c.y, d.y) &&
          y <= Math.max(c.y, d.y)
            ? 20
            : 0)
        );
      }, 0);
    if (start.x === end.x && start.y === end.y) return [start, end];
    const candidates: DiagramPoint[][] = [];
    if (start.x === end.x || start.y === end.y) candidates.push([start, end]);
    const mids = [(start.x + end.x) / 2, start.x + 12, end.x - 12];
    for (const x of mids)
      candidates.push([start, { x, y: start.y }, { x, y: end.y }, end]);
    for (const y of [start.y, end.y])
      candidates.push([start, { x: start.x, y }, { x: end.x, y }, end]);
    const valid = candidates
      .map(compact)
      .filter((p) => p.every((v, i) => !i || clear(p[i - 1], v)));
    const distance = (p: DiagramPoint[]) =>
      p.reduce(
        (n, v, i) =>
          n +
          (i
            ? Math.abs(v.x - p[i - 1].x) +
              Math.abs(v.y - p[i - 1].y) +
              penalty(p[i - 1], v)
            : 0),
        p.length * 16,
      );
    const bestCandidate = valid.sort((a, b) => distance(a) - distance(b))[0];
    if (
      bestCandidate &&
      bestCandidate.every((v, i) => !i || !penalty(bestCandidate[i - 1], v))
    )
      return bestCandidate;
    // A* on the compressed obstacle grid, rather than guessing a midpoint bend.
    const nx = xs.length,
      goal = ys.indexOf(end.y) * nx + xs.indexOf(end.x),
      first = ys.indexOf(start.y) * nx + xs.indexOf(start.x);
    const point = (n: number) => ({ x: xs[n % nx], y: ys[Math.floor(n / nx)] });
    const heap: { n: number; g: number; f: number }[] = [];
    const push = (v: (typeof heap)[number]) => {
      heap.push(v);
      let i = heap.length - 1;
      while (i) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= v.f) break;
        heap[i] = heap[p];
        i = p;
      }
      heap[i] = v;
    };
    const pop = () => {
      const top = heap[0],
        last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let c = i * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++;
          if (last.f <= heap[c].f) break;
          heap[i] = heap[c];
          i = c;
        }
        heap[i] = last;
      }
      return top;
    };
    const best = new Map<number, number>([[first * 3, 0]]),
      previous = new Map<number, number>();
    push({ n: first * 3, g: 0, f: 0 });
    while (heap.length) {
      const current = pop();
      if (current.g !== best.get(current.n)) continue;
      const node = Math.floor(current.n / 3),
        direction = current.n % 3;
      if (node === goal) {
        const path = [point(goal)];
        let n = current.n;
        while (previous.has(n)) {
          n = previous.get(n)!;
          path.push(point(Math.floor(n / 3)));
        }
        return compact(path.reverse());
      }
      const x = node % nx,
        y = Math.floor(node / nx),
        a = point(node);
      for (const n of [
        x ? node - 1 : -1,
        x < nx - 1 ? node + 1 : -1,
        y ? node - nx : -1,
        y < ys.length - 1 ? node + nx : -1,
      ]) {
        if (n < 0) continue;
        const b = point(n),
          key = Math.min(n, node) + ":" + Math.max(n, node);
        let visible = visibility.get(key);
        if (visible === undefined) {
          visible = clear(a, b);
          visibility.set(key, visible);
        }
        if (!visible) continue;
        const g =
          current.g +
          Math.abs(a.x - b.x) +
          Math.abs(a.y - b.y) +
          penalty(a, b) +
          (direction && direction !== (a.x === b.x ? 2 : 1) ? 18 : 0);
        const next = n * 3 + (a.x === b.x ? 2 : 1);
        if (g >= (best.get(next) ?? Infinity)) continue;
        best.set(next, g);
        previous.set(next, current.n);
        push({
          n: next,
          g,
          f: g + Math.abs(b.x - end.x) + Math.abs(b.y - end.y),
        });
      }
    }
    return [];
  };
}

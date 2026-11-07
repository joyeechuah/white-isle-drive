// Traffic: cars on the island's roads keep their distance from each other (at junctions, in queues and where new
// ones appear), take turns where roads meet, and never wait for good, even behind a parked car.
const { test, expect } = require("./support/game");

test.describe("traffic", () => {
  test("traffic cars never drive into each other, and none waits for good", async ({ game }) => {
    test.setTimeout(600_000);
    await game.open();
    await game.driveOut();
    // parked in a lane, so cars also queue behind the car and pull round it
    await game.park();
    const r = await game.eval(() => {
      const T = __T,
        dur = new Map(),
        stop = new Map(),
        out = { overlaps: 0, brushes: 0, longestOverlap: 0, longestStop: 0 };
      for (let i = 0; i < 21600; i++) {
        T.driveUpdate(1 / 60);
        for (const t of T.TRAFFIC) {
          if (!t.e) continue;
          const s = t.v < 0.5 ? (stop.get(t) || 0) + 1 / 60 : 0;
          stop.set(t, s);
          out.longestStop = Math.max(out.longestStop, s);
        }
        if (i % 6) continue;
        const L = T.TRAFFIC.filter((t) => t.e && t.c.G.visible),
          now = new Set();
        for (let a = 0; a < L.length; a++)
          for (let b = a + 1; b < L.length; b++) {
            // closer than 2.4 m between centres: the bodies (about 4.4 m by 1.9 m) are inside each other
            if (Math.hypot(L[a].wx - L[b].wx, L[a].wz - L[b].wz) >= 2.4) continue;
            const k = T.TRAFFIC.indexOf(L[a]) + "-" + T.TRAFFIC.indexOf(L[b]),
              d = (dur.get(k) || 0) + 0.1;
            now.add(k);
            dur.set(k, d);
            // half a second or more counts; two cars in opposite lanes brushing for a moment at a sharp corner
            // (their lanes meet at an angle there) is only recorded
            if (Math.abs(d - 0.5) < 1e-6) out.overlaps++;
            out.longestOverlap = Math.max(out.longestOverlap, +d.toFixed(1));
          }
        for (const [k, d] of dur)
          if (!now.has(k)) {
            if (d < 0.5) out.brushes++;
            dur.delete(k);
          }
      }
      out.longestStop = Math.round(out.longestStop);
      return out;
    });
    test.info().annotations.push({ type: "6 minutes of traffic", description: JSON.stringify(r) });
    expect(r.overlaps, "times two traffic cars stayed inside each other for half a second or more").toBe(0);
    // turn-taking at junctions must not leave cars stuck, and the queue behind a parked car clears
    expect(r.longestStop, "seconds the longest-stopped traffic car waited").toBeLessThan(60);
  });
});

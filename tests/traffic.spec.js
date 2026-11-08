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

  test("in town, the streets around you don't fill up with cars; a car waits at a junction for you", async ({ game }) => {
    test.setTimeout(300_000);
    await game.open();
    await game.driveOut();
    await game.park();
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        es = T.EDGES.filter((e) => e.type === "town" && e.len > 60);
      let cars = 0,
        n = 0;
      for (let k = 0; k < 6; k++) {
        const e = es[(k * 7) % es.length],
          q = T.edgePos(e, e.len / 2);
        P.x = q.x;
        P.z = q.z;
        P.vx = P.vz = 0;
        for (let i = 0; i < 1800; i++) {
          T.updateTraffic(1 / 30);
          if (i < 900 || i % 30) continue;
          n++;
          for (const t of T.TRAFFIC) if (t.e && t.e.type === "town" && Math.hypot(t.wx - P.x, t.wz - P.z) < 150) cars++;
        }
      }
      // town over its target: one car about 100 m straight ahead of the camera and seven behind. The ones behind may be
      // moved elsewhere; the one in view stays (it used to be moved too, being more than 80 m off)
      const cf = new THREE.Vector3();
      T.camera.getWorldDirection(cf);
      // a place in town with a town street about 100 m straight ahead and several behind
      let front = null,
        back = [];
      for (const e0 of es) {
        const q0 = T.edgePos(e0, e0.len / 2);
        const spots = [];
        for (const e of es) for (let s0 = 5; s0 < e.len - 5; s0 += 10) {
          const q = T.edgePos(e, s0), dx = q.x - q0.x, dz = q.z - q0.z, d = Math.hypot(dx, dz);
          if (d < 150 && d > 1) spots.push({ e, s: s0, d, dot: (dx * cf.x + dz * cf.z) / d });
        }
        front = spots.find((p) => p.d > 85 && p.d < 130 && p.dot > 0.85);
        back = spots.filter((p) => p.d > 30 && p.dot < -0.3).filter((p, i) => i % 3 === 0).slice(0, 7);
        if (front && back.length >= 5) {
          P.x = q0.x;
          P.z = q0.z;
          break;
        }
      }
      for (const t of T.TRAFFIC) {
        t.e = null;
        t.wx = t.wz = 1e6;
      }
      const place = (t, p) => {
        t.e = p.e; t.s = p.s; t.dir = 1; t.lane = 0; t.off = t.offCur = 2.4; t.v = t.base = 0; t.stopT = 99;
        const q = T.edgePos(p.e, p.s); t.wx = q.x; t.wz = q.z;
      };
      // the one in view comes last in the list, after the town's target is already reached
      const A = T.TRAFFIC[back.length];
      back.forEach((p, i) => place(T.TRAFFIC[i], p));
      if (front) place(A, front);
      const ax = A.wx, az = A.wz;
      for (let i = 0; i < 45; i++) T.updateTraffic(1 / 30);
      const inView = { found: !!front && back.length >= 5, stayed: !!A.e && Math.hypot(A.wx - ax, A.wz - az) < 20, behindLeft: back.length - T.TRAFFIC.slice(0, back.length).filter((t) => t.e && t.e.type === "town" && Math.hypot(t.wx - P.x, t.wz - P.z) < 200).length };
      // a traffic car 10 m short of a junction you're driving into at 40 km/h
      const jn = T.NODES.find((nd) => nd.adj.length > 2 && nd.adj.some((a) => a.e.type === "town" && a.e.len > 60)),
        a = jn.adj.find((a) => a.e.type === "town" && a.e.len > 60),
        o = jn.adj.find((b) => b !== a),
        t = T.TRAFFIC[0];
      for (const c of T.TRAFFIC) {
        c.e = null;
        c.wx = c.wz = 1e6;
      }
      t.e = a.e;
      t.dir = a.end === "a" ? -1 : 1;
      t.s = t.dir > 0 ? a.e.len - 10 : 10;
      t.lane = 0;
      t.off = t.offCur = T.RT[a.e.type].lanes[0] * (T.save.side === "R" ? 1 : -1);
      t.base = t.v = 8;
      t.stopT = 0;
      jn.res = null;
      const q = T.edgePos(o.e, o.end === "a" ? 25 : o.e.len - 25),
        ux = jn.x - q.x,
        uz = jn.z - q.z,
        l = Math.hypot(ux, uz);
      let minV = 99;
      for (let i = 0; i < 30; i++) {
        P.x = q.x;
        P.z = q.z;
        P.vx = (ux / l) * 11;
        P.vz = (uz / l) * 11;
        T.updateTraffic(1 / 30);
        if (t.e === a.e) minV = Math.min(minV, t.v);
      }
      return { carsNear: +(cars / n).toFixed(1), waits: minV < 1, stillThere: t.e === a.e, inView };
    });
    test.info().annotations.push({ type: "town traffic", description: JSON.stringify(r) });
    // there used to be about 6.5 cars on the town streets within 150 m of you, against 3 to 5 on open roads
    expect(r.carsNear).toBeLessThan(4);
    expect(r.inView.found, "a town spot ahead and some behind").toBe(true);
    expect(r.inView.stayed, "the town car in front of the camera stays").toBe(true);
    expect(r.inView.behindLeft, "spare town cars behind were moved elsewhere").toBeGreaterThan(0);
    expect(r.stillThere, "the car waits on its road instead of driving into the junction").toBe(true);
    expect(r.waits, "the car stops for you").toBe(true);
  });
});

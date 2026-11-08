// Driving: the car responds to the controls, the sea puts you back on the road, travel and menus leave the car in
// a sane state. Simulation steps run inside the page (game.steps), so results don't depend on the machine's speed.
const { test, expect } = require("./support/game");

test.describe("driving", () => {
  test.beforeEach(async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    // driving assist keeps the car in its lane; these tests want the raw controls
    await game.eval(() => {
      __T.save.assist = false;
    });
  });

  test("accelerating, braking to a stop; the brake held keeps it stopped, a fresh press reverses", async ({ game }) => {
    const go = await game.steps(240, { w: true });
    expect(go.fwd, "km/h forward after 4 s on the throttle").toBeGreaterThan(50);
    // one unbroken hold (the page's own frames between calls would count as letting go): it stops in about 2 s
    // and then stays where it stopped (it used to carry on into reverse, up to 40 km/h)
    const held = await game.steps(360, { s: true });
    expect(Math.abs(held.fwd), "km/h after holding the brake for 6 s").toBeLessThan(0.5);
    // let go and press again: now it backs up, no faster than 29 km/h
    await game.steps(10, {});
    const back = await game.steps(240, { s: true });
    expect(back.fwd, "km/h after a fresh press at a standstill").toBeLessThan(-15);
    expect(back.fwd).toBeGreaterThan(-29.5);
    // and the throttle takes it straight back forwards
    const fwd = await game.steps(90, { w: true });
    expect(fwd.fwd, "km/h 1.5 s after pressing W while reversing").toBeGreaterThan(10);
  });

  test("the brake builds up: a quick press slows the car a little, holding it stops it; the same at any frame rate", async ({ game }) => {
    const run = (n, fr) =>
      game.eval(
        ([n, fr]) => {
          const T = __T,
            P = T.P;
          T.resetToRoad(false);
          const f = { x: Math.sin(P.h), z: Math.cos(P.h) };
          P.vx = f.x * 27.8;
          P.vz = f.z * 27.8;
          P.brkT = 0;
          P.brkHold = false;
          T.keys.s = true;
          let t = 0,
            i = 0;
          for (; t < n && P.vx * f.x + P.vz * f.z > 0.5; i++) {
            const dt = fr[i % fr.length];
            T.driveUpdate(dt);
            t += dt;
          }
          T.keys.s = false;
          return { kph: (P.vx * f.x + P.vz * f.z) * 3.6, s: +t.toFixed(3) };
        },
        [n, fr],
      );
    await game.park();
    const tap = await run(0.2, [1 / 60]);
    const holds = [];
    for (const fr of [[1 / 60], [1 / 30], [1 / 60, 1 / 25, 1 / 40]]) {
      await game.park();
      holds.push(await run(10, fr));
    }
    test.info().annotations.push({ type: "braking from 100 km/h", description: JSON.stringify({ tap, holds }) });
    // a 0.2 s press: about 4 km/h off (it took 19 km/h off when the brake bit fully at once)
    expect(100 - tap.kph, "km/h lost to a 0.2 s press").toBeLessThan(8);
    expect(100 - tap.kph).toBeGreaterThan(3);
    // held: stopped in about 2.4 s (Nov 2026: was 1.5 s, which threw speed away into bends), at 60, 30 or uneven fps
    for (const h of holds) {
      expect(h.kph, "km/h left (stopped is under 2)").toBeLessThan(2);
      expect(h.s).toBeGreaterThan(2);
      expect(h.s).toBeLessThan(2.8);
      expect(Math.abs(h.s - holds[0].s)).toBeLessThan(0.12);
    }
  });

  test("pulling away: from braking down to 5 km/h, W reaches 40 km/h promptly in every class", async ({ game }) => {
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = {};
      for (const id of ["golf", "mustang", "gtr"]) {
        T.attachCar(id);
        T.resetToRoad(false);
        const f = { x: Math.sin(P.h), z: Math.cos(P.h) },
          fwd = () => P.vx * f.x + P.vz * f.z;
        P.vx = f.x * 20;
        P.vz = f.z * 20;
        P.thr = P.brkT = 0;
        P.brkHold = false;
        while (fwd() > 1.4) {
          T.keys.s = true;
          T.driveUpdate(1 / 60);
        }
        T.keys.s = false;
        let t = 0,
          first = null;
        while (fwd() * 3.6 < 40 && t < 5) {
          T.keys.w = true;
          T.driveUpdate(1 / 60);
          t += 1 / 60;
          if (first === null && fwd() > 1.6) first = t;
        }
        T.keys.w = false;
        out[id] = { to40: +t.toFixed(2), moving: first };
      }
      return out;
    });
    test.info().annotations.push({ type: "5 to 40 km/h after braking (s)", description: JSON.stringify(r) });
    for (const id in r) {
      // the throttle bites within a tenth of a second at a crawl, and nothing has to undo a reverse first
      expect(r[id].moving, id + ": s until it picks up").toBeLessThan(0.15);
      expect(r[id].to40, id + ": s to 40 km/h").toBeLessThan(1.6);
    }
    // each car keeps its own pace
    expect(r.gtr.to40).toBeLessThan(r.golf.to40);
  });

  test("holding only W, the corner assist slows for bends gently: never more than 8 m/s² over a second", async ({ game }) => {
    test.setTimeout(300_000);
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = {};
      for (const t of T.TRAFFIC) {
        t.e = null;
        t.c.G.visible = false;
        t.wx = t.wz = 1e6;
      }
      T.save.assist = true;
      T.save.auto = false;
      const S = T.save.side === "R" ? 1 : -1;
      for (const id of ["golf", "gtr"]) {
        T.attachCar(id);
        let peak = 0,
          drops = 0,
          runs = 0;
        for (const e of T.EDGES.filter((e) => e.type !== "drive" && e.len > 500))
          for (const dirS of [1, -1]) {
            const lane = T.RT[e.type].lanes[0],
              q = T.edgePos(e, dirS > 0 ? 35 : e.len - 35),
              ux = q.dx * dirS,
              uz = q.dz * dirS;
            P.x = q.x - uz * lane * S;
            P.z = q.z + ux * lane * S;
            P.h = Math.atan2(ux, uz);
            P.vx = P.vz = P.vy = 0;
            P.r = P.steer = P.steerS = P.thr = P.brkT = P.holdT = P.holdDir = 0;
            P.laneT = null;
            P.air = false;
            for (const k in T.keys) T.keys[k] = false;
            const sp = [];
            for (let i = 0; i < 1200; i++) {
              T.keys.w = true;
              T.driveUpdate(1 / 60);
              const nr = T.nearestRoad(P.x, P.z, 20);
              if (!nr || nr.e !== e) break;
              sp.push(Math.hypot(P.vx, P.vz));
            }
            runs++;
            for (let i = 60; i < sp.length; i++) peak = Math.max(peak, sp[i - 60] - sp[i]);
            // 50 km/h or more gone within 4 s
            for (let i = 0; i + 240 < sp.length; i += 30)
              if (sp[i] - Math.min(...sp.slice(i, i + 240)) > 50 / 3.6) {
                drops++;
                i += 210;
              }
          }
        out[id] = { peak: +peak.toFixed(2), drops, runs };
      }
      T.keys.w = false;
      return out;
    });
    test.info().annotations.push({ type: "speed shed for bends with W held", description: JSON.stringify(r) });
    // before (Nov 2026 video): it eased off late and braked at up to 9 m/s²; over these roads it dropped 50 km/h in
    // under 4 s 20 times in the GT-R and 11 in the Golf (now 12 and 5)
    for (const id in r) expect(r[id].peak, id + ": most speed lost in a second, m/s").toBeLessThan(8);
    expect(r.gtr.drops).toBeLessThan(16);
    expect(r.golf.drops).toBeLessThan(9);
  });

  test("holding only W through bends at speed, the assist keeps the GT-R in its lane, on either side of the road", async ({
    game,
  }) => {
    test.setTimeout(300_000);
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        bends = [],
        runs = [];
      for (const t of T.TRAFFIC) {
        t.e = null;
        t.c.G.visible = false;
        t.wx = t.wz = 1e6;
      }
      T.save.assist = true;
      T.save.auto = false;
      T.attachCar("gtr");
      for (const side of ["L", "R"]) {
        T.save.side = side;
        const S = side === "R" ? 1 : -1;
        // every long road, both ways, from rest 35 m from one end, 20 s of W only
        for (const e of T.EDGES.filter((e) => e.type !== "drive" && e.len > 500))
          for (const dirS of [1, -1]) {
            const lane = T.RT[e.type].lanes[0],
              q = T.edgePos(e, dirS > 0 ? 35 : e.len - 35),
              ux = q.dx * dirS,
              uz = q.dz * dirS;
            P.x = q.x - uz * lane * S;
            P.z = q.z + ux * lane * S;
            P.h = Math.atan2(ux, uz);
            P.vx = P.vz = P.vy = 0;
            P.r = P.steer = P.steerS = P.thr = P.brkT = P.holdT = P.holdDir = 0;
            P.laneT = null;
            P.air = false;
            for (const k in T.keys) T.keys[k] = false;
            // the lane it starts in is the one to hold, measured across the road (+ = right of the way it drives)
            let worst = 0,
              across = 0;
            for (let i = 0; i < 1200; i++) {
              T.keys.w = true;
              T.driveUpdate(1 / 60);
              const nr = T.nearestRoad(P.x, P.z, 20);
              if (!nr || nr.e !== e) break;
              if (T.junctionAt(P.x, P.z)) continue;
              const dir = Math.sin(P.h) * nr.dx + Math.cos(P.h) * nr.dz >= 0 ? 1 : -1,
                a = nr.side * dir,
                off = a - S * lane;
              worst = Math.max(worst, Math.abs(off));
              // the car's centre over the centre line, into the other side's lane
              if (a * S < 0) across += 1 / 60;
              if (i % 6) continue;
              const k1 = T.edgePos(e, nr.s),
                k2 = T.edgePos(e, nr.s + 12 * dir),
                bend = Math.atan2(k1.dx * k2.dz - k1.dz * k2.dx, k1.dx * k2.dx + k1.dz * k2.dz) * dir;
              // metres off the lane centre towards the outside of the bend
              if (Math.abs(bend) >= 0.03) bends.push(bend > 0 ? off : -off);
            }
            runs.push({
              side,
              edge: T.EDGES.indexOf(e),
              dirS,
              worst: +worst.toFixed(2),
              across: +across.toFixed(2),
            });
          }
      }
      T.keys.w = false;
      bends.sort((a, b) => a - b);
      const at = (f) => +bends[Math.floor(bends.length * f)].toFixed(2);
      return {
        n: bends.length,
        p50: at(0.5),
        p90: at(0.9),
        p99: at(0.99),
        runs,
      };
    });
    const worst = r.runs.reduce((a, b) => (b.worst > a.worst ? b : a));
    test.info().annotations.push({
      type: "metres wide of the lane in bends (GT-R, W only)",
      description: JSON.stringify({
        n: r.n,
        p50: r.p50,
        p90: r.p90,
        p99: r.p99,
        worst,
      }),
    });
    expect(r.runs.length).toBeGreaterThanOrEqual(24);
    expect(r.n).toBeGreaterThan(600);
    // it used to run up to about a metre wide (90% of the time within 0.75 m)
    expect(r.p90).toBeLessThan(0.5);
    expect(r.p99).toBeLessThan(0.8);
    // out of the tightest hairpin it used to power across the centre line (2 m off, for 0.45 s)
    expect(r.runs.filter((x) => x.across > 0)).toEqual([]);
    expect(worst.worst).toBeLessThan(1.1);
  });

  test("steering left and right turn the car opposite ways, and only when it moves", async ({ game }) => {
    const still = await game.steps(60, { a: true });
    const h0 = await game.eval(() => __T.P.h);
    expect(Math.abs(still.h - h0)).toBeLessThan(0.01);
    const turn = async (k) => {
      await game.park();
      await game.eval(() => {
        __T.save.assist = false;
      });
      await game.steps(120, { w: true });
      const a = await game.eval(() => __T.P.h);
      const b = await game.steps(45, { w: true, [k]: true });
      return Math.atan2(Math.sin(b.h - a), Math.cos(b.h - a));
    };
    const left = await turn("a");
    const right = await turn("d");
    expect(Math.abs(left), "heading change steering left").toBeGreaterThan(0.15);
    expect(Math.abs(right), "heading change steering right").toBeGreaterThan(0.15);
    expect(Math.sign(left)).toBe(-Math.sign(right));
  });

  test("the handbrake slows the car faster than lifting off", async ({ game }) => {
    const coast = async (held) => {
      await game.park();
      await game.eval(() => {
        __T.save.assist = false;
      });
      await game.steps(240, { w: true });
      return (await game.steps(60, held)).kph;
    };
    const lift = await coast({});
    const hand = await coast({ " ": true });
    expect(hand, "km/h one second after pulling the handbrake").toBeLessThan(lift - 10);
  });

  test("every visit to the sea puts the car back on the road after 0.6 s", async ({ game }) => {
    for (let visit = 1; visit <= 2; visit++) {
      const t = await game.eval(() => {
        const T = __T,
          P = T.P;
        P.x = 0;
        P.z = 1070;
        P.vx = P.vz = 0;
        let i = 0;
        for (; i < 600 && T.state === "DRIVE"; i++) T.driveUpdate(1 / 60);
        return { seconds: i / 60, state: T.state };
      });
      expect(t.state, `visit ${visit}`).toBe("FADE");
      expect(t.seconds, `visit ${visit}: seconds in the water`).toBeGreaterThan(0.55);
      expect(t.seconds, `visit ${visit}: seconds in the water`).toBeLessThan(0.75);
      await game.waitState("DRIVE");
      // the car's water flag is refreshed at the start of its next physics step, before anything reads it
      await game.steps(1, {});
      const after = await game.eval(() => {
        const nr = __T.nearestRoad(__T.P.x, __T.P.z, 10);
        return { water: __T.P.water, onRoad: !!nr && nr.d < 3, kph: Math.hypot(__T.P.vx, __T.P.vz) * 3.6 };
      });
      expect(after, `visit ${visit}`).toEqual({ water: false, onRoad: true, kph: expect.any(Number) });
      expect(after.kph).toBeLessThan(1);
    }
  });

  test("R puts the car back on the nearest road, facing along it", async ({ game }) => {
    await game.eval(() => {
      const P = __T.P;
      P.x += 40;
      P.z += 40;
    });
    await game.key("r");
    await game.waitState("FADE");
    await game.waitState("DRIVE");
    const r = await game.eval(() => {
      const T = __T,
        nr = T.nearestRoad(T.P.x, T.P.z, 10);
      return { d: nr ? nr.d : 99, along: nr ? Math.abs(Math.sin(T.P.h) * nr.dx + Math.cos(T.P.h) * nr.dz) : 0 };
    });
    expect(r.d).toBeLessThan(3);
    expect(r.along).toBeGreaterThan(0.9);
  });

  test("after map travel the car is on the road at the destination, stopped", async ({ game }) => {
    // no traffic: a car passing could nudge the stopped car off its spot, which says nothing about where travel put it
    await game.eval(() => {
      for (const t of __T.TRAFFIC) {
        t.e = null;
        t.c.G.visible = false;
        t.wx = t.wz = 1e6;
        t.lost = false;
      }
    });
    await game.eval(() => __T.openMap());
    await game.waitState("MAP");
    const E = await game.eval(() => {
      const T = __T,
        E = T.EVENTS[2];
      T.fastTravel({ act: "event", E });
      return { x: E.x, z: E.z };
    });
    await game.waitState("DRIVE");
    const r = await game.eval(() => {
      const T = __T,
        nr = T.nearestRoad(T.P.x, T.P.z, 10);
      return { x: T.P.x, z: T.P.z, d: nr ? nr.d : 99, kph: Math.hypot(T.P.vx, T.P.vz) * 3.6, air: T.P.air };
    });
    expect(Math.hypot(r.x - E.x, r.z - E.z), "metres from the event").toBeLessThan(80);
    expect(r.d).toBeLessThan(3);
    expect(r.kph).toBeLessThan(1);
    expect(r.air).toBeFalsy();
  });

  test("keys held while a menu is open don't move the car", async ({ game, page }) => {
    const where = () => game.eval(() => [__T.P.x, __T.P.z]);
    for (const [open, close, st] of [
      ["Escape", "Escape", "PAUSE"],
      ["m", "Escape", "MAP"],
    ]) {
      await game.key(open);
      await game.waitState(st);
      const a = await where();
      await page.keyboard.down("w");
      await page.keyboard.down("ArrowLeft");
      await game.frames(20);
      const b = await where();
      await page.keyboard.up("w");
      await page.keyboard.up("ArrowLeft");
      expect(Math.hypot(b[0] - a[0], b[1] - a[1]), `metres moved with ${st} open`).toBeLessThan(0.01);
      await game.key(close);
      await game.waitState("DRIVE");
    }
    // nothing is left held down afterwards
    expect(await game.eval(() => Object.entries(__T.keys).filter(([, v]) => v).map(([k]) => k))).toEqual([]);
  });

  test("a real key press drives the car through the browser's input", async ({ game, page }) => {
    const a = await game.eval(() => [__T.P.x, __T.P.z]);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(() => Math.hypot(__T.P.vx, __T.P.vz) * 3.6 > 15, null, { timeout: 60_000, polling: 100 });
    await page.keyboard.up("ArrowUp");
    const b = await game.eval(() => [__T.P.x, __T.P.z]);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThan(1);
  });

  test("with driving assist, a short steering press at 100 km/h ends in the middle of a lane, never on the divider", async ({ game }) => {
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = [];
      for (const t of T.TRAFFIC) {
        t.e = null;
        t.c.G.visible = false;
        t.wx = 1e6;
        t.wz = 1e6;
      }
      // the straightest long stretch of two-way road with a lane each way
      let road = null,
        best = 9;
      for (const e of T.EDGES) {
        if (e.type === "drive" || e.type === "highway" || e.len < 320) continue;
        const a = T.edgePos(e, 10),
          b = T.edgePos(e, 300),
          t = Math.abs(Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz));
        if (t < best) {
          best = t;
          road = e;
        }
      }
      const across = () => {
        const nr = T.nearestRoad(P.x, P.z, 20);
        return nr.side * (Math.sin(P.h) * nr.dx + Math.cos(P.h) * nr.dz >= 0 ? 1 : -1);
      };
      T.save.assist = true;
      T.attachCar("gtr");
      // presses of 0.1 s to 0.4 s towards the divider, from the middle of the right-hand lane
      for (const n of [6, 12, 18, 24]) {
        const q = T.edgePos(road, 5);
        P.x = q.x - q.dz * 1.9;
        P.z = q.z + q.dx * 1.9;
        P.h = Math.atan2(q.dx, q.dz);
        P.vx = P.vz = 0;
        P.r = P.steer = P.steerS = P.thr = 0;
        P.laneT = null;
        for (let i = 0; i < 900 && Math.hypot(P.vx, P.vz) * 3.6 < 100; i++) {
          T.keys.w = true;
          T.driveUpdate(1 / 60);
        }
        const start = across(),
          key = start > 0 ? "a" : "d";
        for (let i = 0; i < 240; i++) {
          T.keys.w = Math.hypot(P.vx, P.vz) * 3.6 < 100;
          T.keys[key] = i < n;
          T.driveUpdate(1 / 60);
        }
        T.keys.w = T.keys.a = T.keys.d = false;
        out.push({ ms: Math.round((n * 1000) / 60), start: +start.toFixed(2), end: +across().toFixed(2) });
      }
      return out;
    });
    test.info().annotations.push({ type: "lane after a press (0 = the divider)", description: JSON.stringify(r) });
    for (const x of r) {
      // lane centres on these roads are 1.8 to 1.9 m either side of the centre line; the car settles near one,
      // a little to the outside on a bend, and never on the divider (before this fix a 0.3 s press left it 0.4 m off)
      expect(Math.abs(x.end), `${x.ms} ms press: metres from the divider at the end`).toBeGreaterThan(1.2);
      expect(Math.abs(x.end), `${x.ms} ms press: metres from the divider at the end`).toBeLessThan(3);
    }
  });

  test("speed radars: driving past one counts; being put down on its far side (reset, travel) doesn't", async ({ game }) => {
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        R = T.RADARS[0],
        put = (al, v) => {
          P.x = R.x + R.dx * al;
          P.z = R.z + R.dz * al;
          P.h = Math.atan2(R.dx, R.dz);
          P.vx = R.dx * v;
          P.vz = R.dz * v;
          P.r = P.steer = P.steerS = 0;
        };
      for (const t of T.TRAFFIC) {
        t.e = null;
        t.wx = t.wz = 1e6;
      }
      T.save.radar = {};
      // a real drive past at about 90 km/h
      put(-12, 25);
      for (let i = 0; i < 60; i++) {
        T.keys.w = true;
        T.driveUpdate(1 / 60);
      }
      T.keys.w = false;
      const driven = T.save.radar[R.id] || 0;
      // standing 10 m before it, then put down 10 m past it at 108 km/h: no crossing happened
      T.save.radar = {};
      put(-10, 0);
      T.driveUpdate(1 / 60);
      put(10, 30);
      T.driveUpdate(1 / 60);
      return { driven, jumped: T.save.radar[R.id] || 0 };
    });
    expect(r.driven).toBeGreaterThan(60);
    // it used to count as a pass at 108 km/h
    expect(r.jumped).toBe(0);
  });
});

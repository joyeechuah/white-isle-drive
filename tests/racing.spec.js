// Races and time trials: a full run pays its reward once, checkpoints count only in order and only when driven
// through, the finish line can't be skipped beside its posts, and quitting or restarting starts clean.
const { test, expect } = require("./support/game");

async function ready(game) {
  await game.open();
  await game.driveOut();
  // landmarks already found and speed radar records out of reach, so only the event can pay credits
  await game.eval(() => {
    const T = __T;
    for (const L of T.LANDMARKS) T.save.found[L.id] = 1;
    T.save.passBonus = true;
    for (const r of T.RADARS) T.save.radar[r.id] = 999;
  });
  await game.park();
}

// start an event through its intro screen, as a player does, and wait for the countdown to begin
async function start(game, page, i) {
  await game.eval((i) => __T.openIntro(__T.EVENTS[i]), i);
  await game.waitState("INTRO");
  await page.locator("#iGo").click();
  await page.waitForFunction(() => __T.ev && __T.state === "DRIVE", null, { timeout: 30_000 });
}

const toasts = (game) => game.eval(() => [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent));

test.describe("races and time trials", () => {
  test("a time trial driven start to finish pays the reward for its medal, once, and keeps the record", async ({ game, page }) => {
    await ready(game);
    const cr0 = await game.eval(() => __T.save.cr);
    await start(game, page, 0);
    const run = await game.eventBot(20000);
    expect(run.state).toBe("RESULT");
    const r = await game.eval(() => {
      const T = __T,
        E = T.EVENTS[0];
      return { title: document.getElementById("rTitle").textContent, rewards: E.rewards, rec: T.save.rec[E.id], cr: T.save.cr, ev: T.ev };
    });
    const medal = ["GOLD", "SILVER", "BRONZE", "NO MEDAL"].indexOf(r.title);
    expect(medal).toBeGreaterThanOrEqual(0);
    expect(r.cr - cr0).toBe(r.rewards[medal] || 0);
    expect(r.rec).toBeGreaterThan(10);
    expect(r.ev).toBeNull();
    await page.locator("#rOk").click();
    await game.waitState("DRIVE");
    // nothing more is paid once the result is closed
    await game.steps(120, {});
    expect(await game.eval(() => __T.save.cr)).toBe(r.cr);
    expect((await game.readSave()).rec.cubells).toBe(r.rec);
  });

  test("a race lines up three rivals who drive the route, and the result names your position", async ({ game, page }) => {
    await ready(game);
    await start(game, page, 1);
    await game.steps(200, {}); // the countdown
    await game.eventBot(900);
    const ai = await game.eval(() => __T.ev.ai.map((a) => Math.round(a.s)));
    expect(ai).toHaveLength(3);
    for (const s of ai) expect(s, "metres driven by a rival").toBeGreaterThan(100);
    const run = await game.eventBot(20000);
    expect(run.state).toBe("RESULT");
    await expect(page.locator("#rTitle")).toHaveText(/^(1ST|2ND|3RD|4TH) PLACE$/);
  });

  test("checkpoints count only in order: skipping one doesn't advance and says to drive back", async ({ game, page }) => {
    await ready(game);
    await start(game, page, 0);
    await game.steps(200, {}); // the countdown
    const skip = await game.eval(() => {
      const T = __T,
        ev = T.ev,
        cps = ev.E.cps,
        p = T.edgePos(ev.R, cps[1] + 10);
      // jump past gates 1 and 2 (a jump is not a crossing)
      T.P.x = p.x;
      T.P.z = p.z;
      T.P.h = Math.atan2(p.dx, p.dz);
      ev.px = null;
      for (let i = 0; i < 90; i++) T.driveUpdate(1 / 60);
      return { cp: ev.cp, s: ev.s, firstGate: cps[0], len: ev.R.len };
    });
    expect(skip.cp).toBe(0);
    expect(skip.s, "progress stops at the next gate").toBeLessThanOrEqual(skip.firstGate + 2);
    expect((await toasts(game)).join(" ")).toContain("MISSED CHECKPOINT");
    // driving back through the first gate counts it
    await game.eval(() => {
      const T = __T,
        ev = T.ev,
        p = T.edgePos(ev.R, ev.E.cps[0] - 15);
      T.P.x = p.x;
      T.P.z = p.z;
      T.P.h = Math.atan2(p.dx, p.dz);
      T.P.vx = T.P.vz = 0;
      ev.px = null;
      ev.hint = 0;
    });
    const back = await game.eventBot(600, 1);
    expect(back.cp).toBe(1);
  });

  test("race progress never runs past the route, wherever the car is", async ({ game }) => {
    await ready(game);
    const r = await game.eval(() => {
      const T = __T,
        out = [];
      for (const E of T.EVENTS) {
        const R = E.route;
        for (let k = 0; k < 40; k++) {
          const p = T.edgePos(R, (R.len * k) / 39);
          for (const off of [0, 30, 120]) {
            const maxS = E.cps[k % E.cps.length] + 30;
            const f = T.trackRouteFull(R, p.x + off, p.z - off, maxS);
            if (f && (f.s > maxS + 1e-6 || f.s > R.len + 1e-6 || !(f.s >= 0))) out.push({ id: E.id, s: f.s, maxS, len: R.len });
          }
        }
      }
      return out;
    });
    expect(r).toEqual([]);
  });

  test("driving past the finish line beside its posts doesn't finish, and says to drive through it", async ({ game, page }) => {
    await ready(game);
    await start(game, page, 2);
    // no traffic: a car in the way would stop it short of the 25 m it has to drive past the line, saying nothing about
    // the finish (it failed once that way)
    await game.eval(() => {
      for (const t of __T.TRAFFIC) {
        t.e = null;
        t.c.G.visible = false;
        t.wx = t.wz = 1e6;
        t.lost = false;
      }
    });
    await game.steps(200, {});
    const last = await game.eval(() => __T.ev.E.cps.length - 1);
    const reach = await game.eventBot(20000, last);
    expect(reach.cp).toBe(last);
    const r = await game.eval(() => {
      const T = __T,
        ev = T.ev,
        g = ev.gate,
        P = T.P;
      T.save.assist = false;
      // 30 m before the line, outside the right-hand post, driving straight on past it
      const off = g.hw + 4;
      P.x = g.x - g.dx * 30 - g.dz * off;
      P.z = g.z - g.dz * 30 + g.dx * off;
      P.h = Math.atan2(g.dx, g.dz);
      P.vx = g.dx * 15;
      P.vz = g.dz * 15;
      // straight wheels: the autopilot may have left the steering turned
      P.r = P.steer = P.steerS = 0;
      ev.px = null;
      for (let i = 0; i < 360 && T.state === "DRIVE"; i++) {
        T.keys.w = true;
        T.driveUpdate(1 / 60);
      }
      T.keys.w = false;
      return { state: T.state, ev: !!T.ev, past: (P.x - g.x) * g.dx + (P.z - g.z) * g.dz };
    });
    expect(r.past, "metres beyond the line").toBeGreaterThan(25);
    expect(r).toMatchObject({ state: "DRIVE", ev: true });
    expect((await toasts(game)).join(" ")).toContain("the finish line");
  });

  test("quitting from the pause menu cancels with no reward; starting again begins afresh", async ({ game, page }) => {
    await ready(game);
    const cr0 = await game.eval(() => __T.save.cr);
    await start(game, page, 1);
    await game.steps(200, {});
    await game.eventBot(600);
    await game.key("Escape");
    await game.waitState("PAUSE");
    await expect(page.locator("#pQuit")).toHaveText("QUIT EVENT");
    await page.locator("#pQuit").click();
    await game.waitState("DRIVE");
    expect(await game.eval(() => ({ ev: __T.ev, cr: __T.save.cr }))).toEqual({ ev: null, cr: cr0 });
    expect((await toasts(game)).join(" ")).toContain("EVENT CANCELLED");
    await start(game, page, 1);
    expect(await game.eval(() => ({ t: __T.ev.t <= -2.5, cp: __T.ev.cp, phase: __T.ev.phase }))).toEqual({ t: true, cp: 0, phase: "count" });
  });

  test("past the finish line the car brakes to a stop before the result, which keeps the time at the line", async ({ game, page }) => {
    await ready(game);
    await start(game, page, 0);
    await game.eval(() => {
      __T.save.auto = true; // auto gas on: the car must still stay put after the result
    });
    const r = await game.eval(() => {
      const T = __T,
        P = T.P;
      // the autopilot drives to the line
      for (let i = 0; i < 20000 && T.ev && !T.ev.fin; i++) {
        const R = T.ev.R,
          la = Math.min(R.len, T.ev.s + 18 + Math.hypot(P.vx, P.vz) * 0.5);
        let lo = 0,
          hi = R.cum.length - 1;
        while (hi - lo > 1) {
          const m = (lo + hi) >> 1;
          if (R.cum[m] <= la) lo = m;
          else hi = m;
        }
        const p = R.pts[hi],
          err = ((Math.atan2(p.x - P.x, p.z - P.z) - P.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        T.keys.a = err > 0.03;
        T.keys.d = err < -0.03;
        T.keys.w = true;
        T.driveUpdate(1 / 60);
      }
      const atLine = { kph: Math.hypot(P.vx, P.vz) * 3.6, t: T.ev.fin.t, banner: document.getElementById("count").textContent };
      // the throttle stays held: past the line it does nothing
      T.driveUpdate(1 / 60);
      atLine.shown = document.getElementById("evTime").textContent;
      let steps = 1,
        same = true;
      while (T.state === "DRIVE" && steps < 600) {
        T.driveUpdate(1 / 60);
        steps++;
        if (T.ev && document.getElementById("evTime").textContent !== atLine.shown) same = false;
      }
      T.keys.a = T.keys.d = T.keys.w = false;
      return { atLine, steps, same, state: T.state, kph: Math.hypot(P.vx, P.vz) * 3.6, rec: T.save.rec.cubells, rows: document.getElementById("rRows").textContent };
    });
    expect(r.atLine.kph, "km/h crossing the line").toBeGreaterThan(60);
    expect(r.atLine.banner).toBe("FINISH");
    expect(r.state).toBe("RESULT");
    expect(r.steps / 60, "seconds from the line to the result").toBeLessThanOrEqual(4.05);
    expect(r.kph, "km/h when the result shows").toBe(0);
    expect(r.same, "the race panel holds the finishing time").toBe(true);
    expect(r.rec).toBe(r.atLine.t);
    expect(r.rows).toContain(r.atLine.shown);
    // closing the result leaves the car where it stopped, even with auto gas on, until a control is touched
    await page.locator("#rOk").click();
    await game.waitState("DRIVE");
    const p0 = await game.eval(() => [__T.P.x, __T.P.z]);
    const after = await game.steps(120, {});
    expect(Math.hypot(after.x - p0[0], after.z - p0[1]), "metres moved in 2 s after OK").toBeLessThan(0.5);
  });

  test("pausing past the finish line offers the result instead of quitting the event", async ({ game, page }) => {
    await ready(game);
    await start(game, page, 2);
    await game.steps(200, {});
    const cr0 = await game.eval(() => __T.save.cr);
    await game.eval(() => {
      const T = __T;
      // a clean run straight to the last gate, then over the line
      T.ev.cp = T.ev.E.cps.length - 1;
      T.ev.gate = T.gateOf(T.ev.R, T.ev.E.cps[T.ev.cp]);
      // over the line at speed, and paused straight away, while the car is still braking
      T.P.vx = Math.sin(T.P.h) * 30;
      T.P.vz = Math.cos(T.P.h) * 30;
      T.finishEvent();
      T.pauseOn();
    });
    await game.waitState("PAUSE");
    await expect(page.locator("#pQuit")).toHaveText("SEE RESULT");
    await page.locator("#pQuit").click();
    await game.waitState("RESULT");
    await expect(page.locator("#rTitle")).toHaveText(/GOLD|SILVER|BRONZE|NO MEDAL/);
    // paid once, at the line
    const paid = await game.eval(() => __T.save.cr);
    await page.locator("#rOk").click();
    await game.waitState("DRIVE");
    await game.steps(60, {});
    expect(await game.eval(() => __T.save.cr)).toBe(paid);
    expect(paid).toBeGreaterThanOrEqual(cr0);
  });

  test("race rivals never drive through each other or jump back", async ({ game }) => {
    test.setTimeout(400_000);
    await ready(game);
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = {};
      for (const E of T.EVENTS) {
        if (E.type !== "race") continue;
        T.startEvent(E);
        let overlap = 0,
          passes = 0,
          jumps = 0;
        const order0 = T.ev.ai.map((a) => a.s);
        for (let i = 0; i < 200; i++) T.driveUpdate(1 / 60);
        for (let i = 0; i < 20000 && T.ev; i++) {
          const R = T.ev.R,
            la = Math.min(R.len, T.ev.s + 18 + Math.hypot(P.vx, P.vz) * 0.5);
          let lo = 0,
            hi = R.cum.length - 1;
          while (hi - lo > 1) {
            const m = (lo + hi) >> 1;
            if (R.cum[m] <= la) lo = m;
            else hi = m;
          }
          const p = R.pts[hi],
            err = ((Math.atan2(p.x - P.x, p.z - P.z) - P.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          T.keys.a = err > 0.03;
          T.keys.d = err < -0.03;
          T.keys.w = true;
          const ai = T.ev.ai,
            before = ai.map((a) => a.s);
          T.driveUpdate(1 / 60);
          if (!T.ev) break;
          // and never jumps back along the road
          for (let a = 0; a < ai.length; a++) if (before[a] - ai[a].s > 0.3) jumps++;
          for (let a = 0; a < ai.length; a++)
            for (let b = a + 1; b < ai.length; b++) {
              // a car length along the route and level across it: one drawn inside the other
              if (Math.abs(ai[a].s - ai[b].s) < 4.6 && Math.abs(ai[a].lat - ai[b].lat) < 1.7) overlap++;
              if (Math.sign(before[a] - before[b]) !== Math.sign(ai[a].s - ai[b].s)) passes++;
            }
        }
        T.keys.a = T.keys.d = T.keys.w = false;
        out[E.id] = { overlap, passes, jumps, order0, state: T.state };
        if (T.state === "RESULT") document.getElementById("rOk").click();
      }
      return out;
    });
    test.info().annotations.push({ type: "rivals in each race", description: JSON.stringify(r) });
    for (const [id, x] of Object.entries(r)) {
      expect(x.overlap, `${id}: frames with one rival inside another`).toBe(0);
      expect(x.jumps, `${id}: times a rival jumped back along the road`).toBe(0);
      expect(x.state, `${id}: the race still finishes`).toBe("RESULT");
    }
  });

  test("the race intro sets the difficulty, which changes the rewards and is remembered; time trials have none", async ({ game, page }) => {
    await ready(game);
    await game.eval(() => __T.openIntro(__T.EVENTS[1]));
    await game.waitState("INTRO");
    const btns = page.locator("#iDiff button");
    await expect(btns).toHaveText(["EASY", "NORMAL", "HARD"]);
    await expect(btns.nth(1)).toHaveAttribute("aria-pressed", "true");
    const rewards = () => page.locator("#iRows .row", { hasText: "Rewards" }).locator("b").textContent();
    const normal = await rewards();
    await btns.nth(2).click();
    await expect(page.locator("#iDiff button").nth(2)).toHaveAttribute("aria-pressed", "true");
    const hard = await rewards();
    const exp = await game.eval(() => __T.raceRewards(__T.EVENTS[1], 2).map((r) => r.toLocaleString("en-US")));
    expect(hard).not.toBe(normal);
    for (const r of exp) expect(hard.replace(/[^0-9 /]/g, "")).toContain(r.replace(/[^0-9]/g, ""));
    // the arrow keys change it too
    await game.key("ArrowLeft");
    await expect(page.locator("#iDiff button").nth(1)).toHaveAttribute("aria-pressed", "true");
    await game.key("ArrowRight");
    expect(await game.eval(() => __T.save.diff)).toBe(2);
    expect((await game.readSave()).diff).toBe(2);
    await page.locator("#iNo").click();
    await game.waitState("DRIVE");
    await game.eval(() => __T.openIntro(__T.EVENTS[0]));
    await game.waitState("INTRO");
    await expect(page.locator("#iDiff")).toBeHidden();
  });

  test("HARD rivals drive faster than EASY ones, and a race pays its reward times the difficulty", async ({ game }) => {
    test.setTimeout(400_000);
    await ready(game);
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = {};
      for (const d of [0, 2]) {
        T.save.diff = d;
        T.startEvent(T.EVENTS[1]);
        // no traffic, so only their pace counts (a rival held up behind a slow car would say nothing about it)
        for (const t of T.TRAFFIC) {
          t.e = null;
          t.c.G.visible = false;
          t.wx = t.wz = 1e6;
          t.lost = false;
        }
        for (let i = 0; i < 200; i++) T.driveUpdate(1 / 60);
        // the player stays at the start, marked far ahead so no rival is held back for leading: the metres they drive
        // from 5 s to 25 s
        T.ev.s = 1e4;
        for (let i = 0; i < 300; i++) T.driveUpdate(1 / 60);
        const s0 = T.ev.ai.reduce((s, a) => s + a.s, 0) / 3;
        for (let i = 0; i < 1200; i++) T.driveUpdate(1 / 60);
        out[d] = T.ev.ai.reduce((s, a) => s + a.s, 0) / 3 - s0;
        // a win at this difficulty
        for (const a of T.ev.ai) a.fin = 0;
        const cr0 = T.save.cr;
        T.finishEvent();
        out["paid" + d] = T.save.cr - cr0;
        out["expect" + d] = T.raceRewards(T.EVENTS[1], d)[0];
        for (let i = 0; i < 400 && T.state === "DRIVE"; i++) T.driveUpdate(1 / 60);
        out["row" + d] = document.getElementById("rRows").textContent;
        document.getElementById("rOk").click();
      }
      return out;
    });
    test.info().annotations.push({ type: "metres driven by rivals from 5 s to 25 s, EASY and HARD", description: JSON.stringify([r[0], r[2]]) });
    expect(r[2], "metres driven by HARD rivals vs EASY").toBeGreaterThan(r[0] * 1.1);
    expect(r.paid0).toBe(r.expect0);
    expect(r.paid2).toBe(r.expect2);
    expect(r.paid2).toBeGreaterThan(r.paid0);
    expect(r.row0).toContain("EASY");
    expect(r.row2).toContain("HARD");
  });

  test("rivals slow behind or pass traffic on the route, never driving through it", async ({ game }) => {
    test.setTimeout(400_000);
    await ready(game);
    const r = await game.eval(() => {
      const T = __T,
        P = T.P;
      T.save.diff = 2;
      T.startEvent(T.EVENTS[3]);
      const R = T.ev.R;
      // four slow traffic cars in the race's direction on the route ahead, in the lane two rivals start in
      const placed = [];
      for (const [k, s] of [200, 420, 640, 900].entries()) {
        const q = T.edgePos(R, s),
          nr = T.nearestRoad(q.x, q.z, 4);
        if (!nr) continue;
        const t = T.TRAFFIC[k],
          dir = q.dx * nr.dx + q.dz * nr.dz > 0 ? 1 : -1;
        t.e = nr.e;
        t.s = nr.s;
        t.dir = dir;
        t.lane = 0;
        t.off = t.offCur = 1.9;
        t.base = t.v = 6;
        t.passT = 0;
        t.waitT = 0;
        t.lost = false;
        placed.push(t);
      }
      for (let i = 0; i < 200; i++) T.driveUpdate(1 / 60);
      let overlap = 0,
        minD = 99;
      // the player waits at the start, so the rivals meet the traffic on their own
      for (let i = 0; i < 4800 && T.ev; i++) {
        T.driveUpdate(1 / 60);
        if (!T.ev) break;
        for (const a of T.ev.ai)
          for (const t of placed) {
            if (!t.e) continue;
            const d = Math.hypot(a.x - t.wx, a.z - t.wz);
            minD = Math.min(minD, d);
            if (d < 2.4) overlap++;
          }
      }
      return { placed: placed.length, overlap, minD, progress: T.ev ? T.ev.ai.map((a) => Math.round(a.s)) : null, len: Math.round(R.len) };
    });
    test.info().annotations.push({ type: "rivals and traffic", description: JSON.stringify(r) });
    expect(r.placed).toBeGreaterThanOrEqual(3);
    expect(r.overlap, "frames with a rival inside a traffic car").toBe(0);
    // they got past it: every rival is beyond the last traffic car placed
    for (const s of r.progress) expect(s).toBeGreaterThan(950);
  });

  test("a rival rolling on past the finish next to traffic doesn't stop the game", async ({ game }) => {
    await ready(game);
    const r = await game.eval(() => {
      const T = __T;
      T.startEvent(T.EVENTS[3]);
      for (let i = 0; i < 200; i++) T.driveUpdate(1 / 60);
      const R = T.ev.R,
        a = T.ev.ai[0],
        end = T.edgePos(R, R.len);
      // the first rival finished and has rolled 64 m on, beyond the route's last point, with a traffic car 30 m behind
      // it (rivals look out for traffic within 60 m)
      a.s = R.len + 64;
      a.fin = 1;
      a.v = 0;
      const t = T.TRAFFIC[0],
        nr = [30, 20, 10, 0].map((k) => T.nearestRoad(end.x + end.dx * k, end.z + end.dz * k, 8)).find((n) => n);
      t.e = nr.e;
      t.s = nr.s;
      t.dir = 1;
      t.lost = false;
      let err = null,
        gap = 1e9;
      try {
        for (let i = 0; i < 120; i++) {
          T.driveUpdate(1 / 60);
          gap = Math.min(gap, Math.hypot(a.x - t.wx, a.z - t.wz));
        }
      } catch (e) {
        err = String(e);
      }
      return { err, ev: !!T.ev, gap: Math.round(gap) };
    });
    expect(r.gap, "metres between the rival and the traffic car").toBeLessThan(60);
    expect(r.err).toBeNull();
    expect(r.ev).toBe(true);
  });

  test("a traffic car with no way on during a race and nowhere to reappear doesn't break the frame", async ({ game }) => {
    await ready(game);
    const r = await game.eval(() => {
      const T = __T,
        P = T.P;
      T.startEvent(T.EVENTS[0]);
      // a car on a road of the race, going the race's way, comes to a junction where every way on runs against the race
      // and turning round would too (there are no dead ends on the island, so the junction is set up that way by hand)
      const R = T.ev.R,
        q = T.edgePos(R, 300),
        nr = T.nearestRoad(q.x, q.z, 3),
        dead = nr.e,
        node = dead.b;
      T.evDirs.set(dead, 1);
      for (const a of node.adj) if (a.e !== dead) T.evDirs.set(a.e, a.end === "a" ? -1 : 1);
      const t = T.TRAFFIC[0];
      t.e = dead;
      t.dir = 1;
      t.s = dead.len - 0.05;
      t.v = 10;
      t.lost = false;
      // and nowhere to reappear: every road is too far from the player, who is put far out at sea
      const x0 = P.x,
        z0 = P.z;
      P.x = P.z = 5e4;
      let err = null;
      try {
        T.updateTraffic(1 / 60);
        T.updateTraffic(1 / 60);
      } catch (e) {
        err = String(e);
      }
      P.x = x0;
      P.z = z0;
      return { err, gone: !t.e, waiting: !!t.lost };
    });
    expect(r.err).toBeNull();
    // it's off the road, and tries again to reappear
    expect([r.gone, r.waiting]).toEqual([true, true]);
  });

  test("no traffic comes the other way along a race or time trial route", async ({ game }) => {
    test.setTimeout(400_000);
    await ready(game);
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = {};
      for (const E of T.EVENTS) {
        T.startEvent(E);
        let against = 0,
          checks = 0,
          same = 0;
        const look = () => {
          const R = T.ev.R;
          for (const t of T.TRAFFIC) {
            if (!t.e || Math.hypot(t.wx - P.x, t.wz - P.z) > 400) continue;
            const f = T.trackRouteFull(R, t.wx, t.wz, R.len);
            if (!f || f.d > 6) continue;
            const q = T.edgePos(R, f.s),
              al = Math.sin(t.yaw) * q.dx + Math.cos(t.yaw) * q.dz;
            checks++;
            if (al < -0.5) against++;
            else if (al > 0.5) same++;
          }
        };
        // the countdown, then the whole event with the autopilot, looking every half second
        for (let i = 0; i < 200; i++) T.driveUpdate(1 / 60);
        look();
        for (let i = 0; i < 20000 && T.ev; i++) {
          const R = T.ev.R,
            la = Math.min(R.len, T.ev.s + 18 + Math.hypot(P.vx, P.vz) * 0.5);
          let lo = 0,
            hi = R.cum.length - 1;
          while (hi - lo > 1) {
            const m = (lo + hi) >> 1;
            if (R.cum[m] <= la) lo = m;
            else hi = m;
          }
          const p = R.pts[hi],
            err = ((Math.atan2(p.x - P.x, p.z - P.z) - P.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          T.keys.a = err > 0.03;
          T.keys.d = err < -0.03;
          T.keys.w = true;
          T.driveUpdate(1 / 60);
          if (i % 30 === 0 && T.ev) look();
        }
        T.keys.a = T.keys.d = T.keys.w = false;
        out[E.id] = { against, same, checks };
        if (T.state === "RESULT") document.getElementById("rOk").click();
      }
      return out;
    });
    test.info().annotations.push({ type: "traffic seen on each route", description: JSON.stringify(r) });
    for (const [id, x] of Object.entries(r)) expect(x.against, `${id}: traffic cars seen driving against the race`).toBe(0);
    // traffic going the same way is still there
    expect(Object.values(r).reduce((a, x) => a + x.same, 0)).toBeGreaterThan(0);
  });
});

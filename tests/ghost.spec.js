// Time trial ghost: a record run is saved and replayed as a see-through car on the next attempt, with the live gap
// to it; it can't be hit, it can be switched off, and a damaged ghost in the save is ignored.
const { test, expect } = require("./support/game");

async function ready(game) {
  await game.open();
  await game.driveOut();
  await game.eval(() => {
    const T = __T;
    for (const L of T.LANDMARKS) T.save.found[L.id] = 1;
    T.save.passBonus = true;
    for (const r of T.RADARS) T.save.radar[r.id] = 999;
  });
  await game.park();
}

// drive the current event with the autopilot at up to maxKph, until it finishes and the result shows
const RUN = (maxKph) => {
  const T = __T,
    P = T.P;
  for (let i = 0; i < 30000 && T.state === "DRIVE"; i++) {
    if (!T.ev) break;
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
    T.keys.w = Math.hypot(P.vx, P.vz) * 3.6 < maxKph;
    T.driveUpdate(1 / 60);
  }
  T.keys.a = T.keys.d = T.keys.w = false;
  return T.state;
};

test.describe("time trial ghost", () => {
  test("a record run is saved as the ghost; a slower run doesn't replace it", async ({ game, page }) => {
    test.setTimeout(300_000);
    await ready(game);
    await game.eval(() => __T.startEvent(__T.EVENTS[0]));
    expect(await game.eval(RUN, 999)).toBe("RESULT");
    const g1 = await game.eval(() => {
      const g = __T.save.ghost.cubells;
      return g && { c: g.c, t: g.t, n: g.d.length, rec: __T.save.rec.cubells, car: __T.curId, last: g.d.slice(-1)[0], len: __T.EVENTS[0].route.len };
    });
    expect(g1, "ghost saved").toBeTruthy();
    expect(g1.c).toBe(g1.car);
    expect(g1.t).toBe(g1.rec);
    // a sample every 0.1 s, 4 numbers each, plus the line
    expect(Math.abs(g1.n / 4 - (g1.t * 10 + 2))).toBeLessThanOrEqual(2);
    expect(g1.last).toBeCloseTo(g1.len, 0);
    expect((await game.readSave()).ghost.cubells.t).toBe(g1.t);
    await page.locator("#rOk").click();
    await game.waitState("DRIVE");
    // the same trial at no more than 90 km/h: slower, so the ghost stays
    await game.eval(() => __T.startEvent(__T.EVENTS[0]));
    expect(await game.eval(RUN, 90)).toBe("RESULT");
    expect(await game.eval(() => __T.save.ghost.cubells.t)).toBe(g1.t);
  });

  test("the next attempt replays the ghost on its recorded path, see-through, with the live gap, and it can't be hit", async ({ game }) => {
    test.setTimeout(300_000);
    await ready(game);
    await game.eval(() => __T.startEvent(__T.EVENTS[0]));
    expect(await game.eval(RUN, 999)).toBe("RESULT");
    await game.eval(() => document.getElementById("rOk").click());
    await game.waitState("DRIVE");
    const r = await game.eval(() => {
      const T = __T,
        P = T.P;
      T.startEvent(T.EVENTS[0]);
      T.driveUpdate(1 / 60);
      const g = T.ev.ghost,
        m = T.GH.m,
        atStart = { visible: m && m.G.visible, box: !document.getElementById("evGhost").classList.contains("hide") };
      let opaque = 0;
      m.G.traverse((o) => {
        if (o.isMesh && !(o.material.transparent && o.material.opacity < 0.5)) opaque++;
      });
      // through the countdown, then 10 s without touching anything: the ghost drives away
      for (let i = 0; i < 180; i++) T.driveUpdate(1 / 60);
      while (T.ev.t < 10) T.driveUpdate(1 / 60);
      const want = T.ghostAt(g, T.ev.t),
        off = Math.hypot(m.G.position.x - want.x, m.G.position.z - want.z),
        rec = { x: g.d[Math.round(T.ev.t * 10) * 4], z: g.d[Math.round(T.ev.t * 10) * 4 + 1] },
        offRec = Math.hypot(m.G.position.x - rec.x, m.G.position.z - rec.z),
        gap = document.getElementById("evGap").textContent;
      // the car is put right where the ghost is: nothing pushes it away
      P.x = m.G.position.x;
      P.z = m.G.position.z;
      P.vx = P.vz = 0;
      const x0 = P.x,
        z0 = P.z;
      T.driveUpdate(1 / 60);
      return { atStart, opaque, off, offRec, gap, pushed: Math.hypot(P.x - x0, P.z - z0) };
    });
    expect(r.atStart).toEqual({ visible: true, box: true });
    expect(r.opaque, "ghost meshes that aren't see-through").toBe(0);
    expect(r.off, "metres from where the recording puts it").toBeLessThan(0.5);
    expect(r.offRec, "metres from the recorded sample").toBeLessThan(3.5);
    // standing at the start while the ghost has driven 10 s: well behind it
    expect(r.gap).toMatch(/^\+\d+\.\d$/);
    expect(r.pushed).toBeLessThan(0.05);
  });

  test("the gap shown is the right number of seconds, behind and ahead", async ({ game }) => {
    await ready(game);
    const r = await game.eval(() => {
      const T = __T,
        R = T.EVENTS[0].route,
        d = [];
      // a ghost that drove the route at exactly 30 m/s: at s metres after s/30 seconds
      for (let k = 0; k * 3 < R.len; k++) {
        const q = T.edgePos(R, k * 3);
        d.push(+q.x.toFixed(1), +q.z.toFixed(1), +Math.atan2(q.dx, q.dz).toFixed(2), k * 3);
      }
      T.save.ghost.cubells = { c: "golf", t: R.len / 30, d };
      T.startEvent(T.EVENTS[0]);
      for (let i = 0; i < 200; i++) T.driveUpdate(1 / 60);
      // standing still at the start (14 m along) for 6 s: the ghost was there at 14/30 s, so the gap is t - 0.47
      while (T.ev.t < 6) T.driveUpdate(1 / 60);
      const behind = { shown: document.getElementById("evGap").textContent, want: T.ev.t - 14 / 30 };
      // progress marked 60 m beyond where the ghost is now: it gets there 2 s from now, so 2 s ahead
      T.ev.s = 30 * T.ev.t + 60;
      T.driveUpdate(1 / 60);
      const ahead = { shown: document.getElementById("evGap").textContent, want: T.ev.t - T.ev.s / 30 };
      return { behind, ahead };
    });
    const num = (t) => parseFloat(t.replace("\u2212", "-"));
    expect(r.behind.shown).toMatch(/^\+\d+\.\d$/);
    expect(Math.abs(num(r.behind.shown) - r.behind.want)).toBeLessThanOrEqual(0.06);
    expect(r.ahead.shown).toMatch(/^\u2212\d+\.\d$/);
    expect(Math.abs(num(r.ahead.shown) - r.ahead.want)).toBeLessThanOrEqual(0.06);
  });

  test("GHOST CAR in the pause menu hides it and is remembered", async ({ game, page }) => {
    await ready(game);
    await game.eval(() => {
      const T = __T,
        R = T.EVENTS[0].route,
        d = [];
      for (let k = 0; k * 3 < R.len; k++) {
        const q = T.edgePos(R, k * 3);
        d.push(+q.x.toFixed(1), +q.z.toFixed(1), +Math.atan2(q.dx, q.dz).toFixed(2), k * 3);
      }
      T.save.ghost.cubells = { c: "golf", t: R.len / 30, d };
      T.startEvent(T.EVENTS[0]);
    });
    await game.frames(3);
    expect(await game.eval(() => __T.GH.m.G.visible)).toBe(true);
    await game.key("Escape");
    await game.waitState("PAUSE");
    await expect(page.locator("#pGhost")).toHaveText("GHOST CAR: ON");
    await page.locator("#pGhost").click();
    await expect(page.locator("#pGhost")).toHaveText("GHOST CAR: OFF");
    await page.locator("#pRes").click();
    await game.waitState("DRIVE");
    await game.frames(3);
    expect(await game.eval(() => ({ m: __T.GH.m.G.visible, box: document.getElementById("evGhost").classList.contains("hide") }))).toEqual({ m: false, box: true });
    expect((await game.readSave()).ghostOn).toBe(false);
  });

  test("a damaged ghost in the save is ignored, a sound one is kept", async ({ game }) => {
    const ok = { c: "golf", t: 30.5, d: [1, 2, 0.5, 0, 3, 4, 0.5, 10] };
    await game.open({
      save: JSON.stringify({
        v: 3,
        ghost: {
          cubells: { c: "golf", t: 30, d: [1, 2, "x", 4, 5, 6, 7, 8] },
          oldtown: { c: "batmobile", t: 30, d: ok.d },
          south: ok,
          bad: { c: "golf", t: -1, d: ok.d },
          odd: { c: "golf", t: 20, d: [1, 2, 3, 4, 5, 6, 7] },
        },
      }),
    });
    expect(await game.eval(() => __T.save.ghost)).toEqual({ south: ok });
    await game.driveOut();
    expect(await game.state()).toBe("DRIVE");
  });
});

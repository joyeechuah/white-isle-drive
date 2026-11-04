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
});

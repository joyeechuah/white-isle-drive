// Contracts: all 9 driven start to finish by an autopilot following the GPS (the Golf, the slowest starter car),
// one payment each, timed couriers that fail cleanly, abandon/restart/home/reload outcomes, nothing overlapping,
// and the clock stopping while the game is paused or in photo mode.
const { test, expect } = require("./support/game");

async function ready(game) {
  await game.open();
  await game.driveOut();
  // traffic out of the way, every landmark already found and every speed radar record out of reach, so nothing
  // else can change a run or the credits it earns
  await game.eval(() => {
    const T = __T;
    for (const r of T.RADARS) T.save.radar[r.id] = 999;
    for (const t of T.TRAFFIC) {
      t.e = null;
      t.c.G.visible = false;
      t.wx = 1e6;
      t.wz = 1e6;
    }
    for (const L of T.LANDMARKS) T.save.found[L.id] = 1;
    T.save.passBonus = true;
    T.attachCar("golf");
  });
  await game.park();
}

// start contract id from the Contracts screen, the way a player does (pause menu, CONTRACTS, START)
async function startFromBoard(game, page, id) {
  await game.key("Escape");
  await game.waitState("PAUSE");
  await page.locator("#pJobs").click();
  await expect(page.locator("#jobs")).toBeVisible();
  const title = await game.eval((id) => __T.JOBS.find((j) => j.id === id).title, id);
  await page.getByRole("button", { name: "Start " + title }).click();
  await game.waitState("DRIVE");
  expect(await game.eval(() => __T.job && __T.job.def.id)).toBe(id);
}

// put the car stopped on the road at the current objective (to set up a check, never to complete one)
const atStop = (game, i) =>
  game.eval((i) => {
    const T = __T,
      t = T.job.def.stops[i];
    T.P.x = t.x;
    T.P.z = t.z;
    T.resetToRoad(false);
    T.P.vx = T.P.vz = 0;
    window.__bot = null;
  }, i);

test.describe("contracts", () => {
  test("9 contracts; every stop is on a road, named for its own town, clear of landmarks and prompts, every leg routable", async ({ game }) => {
    await game.open();
    const J = await game.eval(() => {
      const T = __T,
        hm = T.gW(0, -8),
        pr = [...T.EVENTS.map((E) => [E.x, E.z]), [hm.x, hm.z], [T.DEALER.x, T.DEALER.z]];
      return T.JOBS.map((J) => ({
        id: J.id,
        type: J.type,
        stops: J.stops.map((s) => {
          const nr = T.nearestRoad(s.x, s.z, 30);
          return {
            name: s.name,
            road: nr && nr.e.type,
            off: nr ? nr.d : 99,
            zone: T.zoneAt(s.x, s.z),
            lm: Math.min(...T.LANDMARKS.map((L) => Math.hypot(L.x - s.x, L.z - s.z))),
            pr: Math.min(...pr.map(([x, z]) => Math.hypot(x - s.x, z - s.z))),
          };
        }),
        legs: J.stops.slice(1).map((s, i) => !!T.routeBetween(J.stops[i].x, J.stops[i].z, s.x, s.z)),
      }));
    });
    expect(J).toHaveLength(9);
    expect(new Set(J.map((j) => j.id)).size).toBe(9);
    const byType = { parcel: 0, courier: 0, tour: 0 };
    for (const j of J) byType[j.type]++;
    expect(byType).toEqual({ parcel: 3, courier: 3, tour: 3 });
    const bad = [];
    for (const j of J) {
      for (const s of j.stops)
        if (!s.road || s.road === "drive" || s.off > 1 || s.zone.toLowerCase() !== s.name.toLowerCase() || s.lm < 120 || s.pr < 80) bad.push({ id: j.id, ...s });
      if (!j.legs.every(Boolean)) bad.push({ id: j.id, legs: j.legs });
    }
    expect(bad).toEqual([]);
  });

  test("every contract can be driven start to finish, and pays its reward exactly once", async ({ game }) => {
    test.setTimeout(600_000);
    await ready(game);
    const ids = await game.eval(() => __T.JOBS.map((j) => j.id));
    const results = {};
    for (const id of ids) {
      await game.watchToasts();
      const before = await game.eval((id) => {
        const T = __T,
          J = T.JOBS.find((j) => j.id === id),
          c0 = T.save.cr,
          runs0 = T.save.jobs.runs[id] || 0;
        if (T.job) T.jobEnd("abandoned");
        const started = T.jobStart(J);
        const t = J.stops[0];
        T.P.x = t.x;
        T.P.z = t.z;
        T.resetToRoad(false);
        T.P.vx = T.P.vz = 0;
        window.__bot = null;
        return { started, c0, runs0 };
      }, id);
      const run = await game.routeBot(40000);
      const r = await game.eval(
        ([id, b]) => {
          const T = __T,
            J = T.JOBS.find((j) => j.id === id);
          return { started: b.started, paid: T.save.cr - b.c0, reward: J.reward, active: !!T.job, runs: (T.save.jobs.runs[id] || 0) - b.runs0, gps: T.gps.t, hud: !document.getElementById("jobhud").classList.contains("hide"), saved: T.save.jobActive, limit: J.limit || null };
        },
        [id, before]
      );
      r.seconds = +(run.steps / 60).toFixed(1);
      r.complete = (await game.toastLog()).filter((t) => t.startsWith("CONTRACT COMPLETE")).length;
      results[id] = r;
    }
    for (const [id, r] of Object.entries(results)) {
      expect(r, id).toMatchObject({ started: true, active: false, runs: 1, gps: null, hud: false, saved: null, complete: 1 });
      expect(r.paid, id + ": credits paid").toBe(r.reward);
      if (r.limit) expect(r.seconds, id + ": seconds taken by a careful driver in the Golf").toBeLessThan(r.limit - 8);
    }
    test.info().annotations.push({ type: "contract times (s)", description: Object.entries(results).map(([id, r]) => `${id} ${r.seconds}${r.limit ? "/" + r.limit : ""}`).join(", ") });
    const s = (await game.readSave()).jobs;
    expect([s.parcel, s.courier, s.tour, s.failed, s.abandoned]).toEqual([3, 3, 3, 0, 0]);
  });

  test("after completing, re-entering the end zone or a second completion call pays nothing", async ({ game }) => {
    await ready(game);
    const r = await game.eval(() => {
      const T = __T,
        J = T.JOBS[0];
      T.jobStart(J);
      return J.id;
    });
    await atStop(game, 0);
    await game.routeBot(30000);
    const c1 = await game.eval(() => __T.save.cr);
    const again = await game.eval(() => {
      const T = __T,
        J = T.JOBS[0],
        end = J.stops[J.stops.length - 1];
      const second = T.jobEnd("completed");
      T.P.x = end.x;
      T.P.z = end.z;
      T.resetToRoad(false);
      for (let i = 0; i < 120; i++) T.driveUpdate(1 / 60);
      return { second, job: !!T.job };
    });
    expect(again).toEqual({ second: false, job: false });
    expect(await game.eval(() => __T.save.cr)).toBe(c1);
    expect(r).toBeTruthy();
  });

  test("a courier run that runs out of time fails and pays nothing", async ({ game }) => {
    await ready(game);
    await game.watchToasts();
    const c0 = await game.eval(() => {
      const T = __T;
      T.jobStart(T.JOBS.find((j) => j.type === "courier"));
      return T.save.cr;
    });
    await atStop(game, 0);
    await game.steps(30, {});
    expect(await game.eval(() => __T.job.timing), "the clock starts at the pickup").toBe(true);
    await game.eval(() => {
      __T.job.left = 0.2;
    });
    await game.steps(30, {});
    const r = await game.eval(() => ({ job: !!__T.job, paid: __T.save.cr, failed: __T.save.jobs.failed, gps: __T.gps.t }));
    expect(r).toEqual({ job: false, paid: c0, failed: 1, gps: null });
    expect((await game.toastLog()).some((t) => t.startsWith("CONTRACT FAILED"))).toBe(true);
  });

  test("abandon clears the contract with no payment; RESTART goes back to the pickup with a fresh clock", async ({ game, page }) => {
    await ready(game);
    const courier = await game.eval(() => __T.JOBS.find((j) => j.type === "courier").id);
    await startFromBoard(game, page, courier);
    await atStop(game, 0);
    await game.steps(30, {});
    await game.steps(600, { w: true });
    const mid = await game.eval(() => ({ stop: __T.job.stop, left: __T.job.left }));
    expect(mid.stop).toBe(1);
    // RESTART from the board
    await game.key("Escape");
    await game.waitState("PAUSE");
    await page.locator("#pJobs").click();
    await page.locator("#jbRestart").click();
    await game.waitState("DRIVE");
    const r = await game.eval(() => ({ id: __T.job.def.id, stop: __T.job.stop, timing: __T.job.timing, left: __T.job.left, limit: __T.job.def.limit }));
    expect(r).toEqual({ id: courier, stop: 0, timing: false, left: r.limit, limit: r.limit });
    // ABANDON from the board
    const c0 = await game.eval(() => __T.save.cr);
    await game.key("Escape");
    await game.waitState("PAUSE");
    await page.locator("#pJobs").click();
    await page.locator("#jbAbandon").click();
    const a = await game.eval(() => ({ job: !!__T.job, cr: __T.save.cr, gps: __T.gps.t, hud: !document.getElementById("jobhud").classList.contains("hide"), saved: __T.save.jobActive }));
    expect(a).toEqual({ job: false, cr: c0, gps: null, hud: false, saved: null });
  });

  test("during a contract: no second contract, races wait, test drives and map travel are off", async ({ game, page }) => {
    await ready(game);
    const J0 = await game.eval(() => __T.JOBS[3].id);
    await startFromBoard(game, page, J0);
    const r = await game.eval(() => {
      const T = __T;
      return { second: T.jobStart(T.JOBS[0]), still: T.job.def.id };
    });
    expect(r).toEqual({ second: false, still: J0 });
    // a race prompt says to finish the contract first
    await game.eval(() => {
      const E = __T.EVENTS[0];
      __T.P.x = E.x;
      __T.P.z = E.z;
      __T.resetToRoad(false);
      __T.P.vx = __T.P.vz = 0;
    });
    await game.steps(5, {});
    await game.eval(() => __T.updatePrompt());
    await expect(page.locator("#promptTxt")).toContainText("after your contract");
    await game.key("e");
    await game.frames(5);
    expect(await game.eval(() => ({ ev: !!__T.ev, state: __T.state }))).toEqual({ ev: false, state: "DRIVE" });
    // the dealership: no test drive
    await game.eval(() => __T.openDealer());
    await game.waitState("DEALER");
    await game.eval(() => __T.dPick(__T.CARS.findIndex((c) => !__T.save.owned.includes(c.id))));
    await expect(page.locator("#dTest")).toBeDisabled();
    await expect(page.locator("#dCap")).toContainText("no test drives during a contract");
    await page.locator("#dExit").click();
    await game.waitState("DRIVE");
    // the map: a marker offers no travel and the GPS stays on the contract
    await game.eval(() => __T.openMap());
    await game.waitState("MAP");
    const pop = await game.eval(() => {
      const T = __T,
        E = T.EVENTS[2];
      let best = null,
        bd = 1e18;
      for (let y = 4; y < innerHeight; y += 3)
        for (let x = 4; x < innerWidth; x += 3) {
          const w = T.mapToWorld(x, y),
            d = (w.x - E.x) ** 2 + (w.z - E.z) ** 2;
          if (d < bd) {
            bd = d;
            best = { x, y };
          }
        }
      T.openMapPopup(best.x, best.y);
      const p = document.getElementById("mapPop");
      return { text: p.textContent, buttons: [...p.querySelectorAll("button")].map((b) => b.textContent), gps: T.gps.label };
    });
    expect(pop.buttons).toEqual([]);
    expect(pop.text).toContain("The GPS is following your contract");
    expect(await game.eval(() => __T.job.def.id)).toBe(J0);
  });

  test("pause and photo mode stop the courier clock", async ({ game, page }) => {
    await ready(game);
    await game.eval(() => __T.jobStart(__T.JOBS.find((j) => j.type === "courier")));
    await atStop(game, 0);
    await game.steps(30, {});
    for (const [open, st, close] of [
      ["Escape", "PAUSE", "Escape"],
      ["v", "PHOTO", "Escape"],
    ]) {
      await game.key(open);
      await game.waitState(st);
      const a = await game.eval(() => __T.job.left);
      await game.frames(40);
      const b = await game.eval(() => __T.job.left);
      expect(b, `seconds left after 40 frames in ${st}`).toBe(a);
      await game.key(close);
      await game.waitState("DRIVE");
    }
    // and driving runs it again: one second of game time takes one second off
    const used = await game.eval(() => {
      const T = __T,
        a = T.job.left;
      for (let i = 0; i < 60; i++) T.driveUpdate(1 / 60);
      return a - T.job.left;
    });
    expect(used).toBeCloseTo(1, 3);
  });

  test("the house prompt and GO HOME both say they end the contract, and they do", async ({ game, page }) => {
    await ready(game);
    await game.eval(() => __T.jobStart(__T.JOBS[0]));
    // at the house
    await game.eval(() => {
      const T = __T,
        h = T.gW(0, -8);
      T.P.x = h.x;
      T.P.z = h.z;
      T.P.vx = T.P.vz = 0;
    });
    await game.steps(2, {});
    await game.eval(() => __T.updatePrompt());
    await expect(page.locator("#promptTxt")).toContainText("ends your contract");
    await game.park();
    await game.key("Escape");
    await game.waitState("PAUSE");
    await expect(page.locator("#pHome")).toHaveText("GO HOME · ENDS CONTRACT");
    const c0 = await game.eval(() => __T.save.cr);
    await page.locator("#pHome").click();
    await game.waitState("GARAGE", 30_000);
    expect(await game.eval(() => ({ job: !!__T.job, cr: __T.save.cr, abandoned: __T.save.jobs.abandoned }))).toEqual({ job: false, cr: c0, abandoned: 1 });
    // with no contract, the house prompt doesn't mention one
    await game.driveOut();
    await game.eval(() => {
      const T = __T,
        h = T.gW(0, -8);
      T.P.x = h.x;
      T.P.z = h.z;
      T.P.vx = T.P.vz = 0;
    });
    await game.steps(2, {});
    await game.eval(() => __T.updatePrompt());
    await expect(page.locator("#promptTxt")).not.toContainText("contract");
  });

  test("reloading during a contract cancels it unpaid and says so on the next drive", async ({ game }) => {
    await ready(game);
    const c0 = await game.eval(() => {
      __T.jobStart(__T.JOBS[1]);
      return __T.save.cr;
    });
    expect((await game.readSave()).jobActive).toEqual({ id: await game.eval(() => __T.JOBS[1].id) });
    await game.reload();
    await game.watchToasts();
    await game.driveOut();
    const r = await game.eval(() => ({ job: !!__T.job, cr: __T.save.cr, saved: __T.save.jobActive, abandoned: __T.save.jobs.abandoned }));
    expect(r).toEqual({ job: false, cr: c0, saved: null, abandoned: 1 });
    await expect.poll(async () => (await game.toastLog()).join(" ")).toContain("CONTRACT");
  });
});

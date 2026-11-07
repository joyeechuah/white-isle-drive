// Class championships: seven cups, A1 to A7, three events each, entered in a car of the cup's class. Rounds score
// 10/6/4/3 points, 22 of 30 wins the cup, whose prize is paid once; cup time trials have medal times for the class.
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

// finish the current cup round in first place (race) or with gold (time trial), then show the result
const WIN_ROUND = () => {
  const T = __T,
    ev = T.ev;
  for (let i = 0; i < 200; i++) T.driveUpdate(1 / 60);
  if (ev.E.type === "race") for (const a of ev.ai) a.fin = 0;
  else ev.t = ev.tg.gold - 1;
  T.finishEvent();
  T.showResult();
  return { type: ev.E.type, rows: document.getElementById("rRows").textContent, next: !document.getElementById("rNext").classList.contains("hide") };
};

test.describe("class championships", () => {
  test("the board lists 7 cups; a cup opens once you own a car of its class and is entered in one", async ({ game, page }) => {
    await ready(game);
    await game.key("Escape");
    await game.waitState("PAUSE");
    await page.locator("#pCups").click();
    await expect(page.locator("#cups")).toBeVisible();
    const rows = page.locator("#cpList .jbr");
    await expect(rows).toHaveCount(7);
    // the starter cars: two A1 (driving the Golf), an A2 and two A3; nothing from A4 up
    const btn = (i) => rows.nth(i).locator("button");
    await expect(btn(0)).toBeEnabled();
    await expect(btn(1)).toBeDisabled();
    await expect(rows.nth(1)).toContainText("Drive an A2 car to enter");
    for (const i of [3, 4, 5, 6]) {
      await expect(btn(i)).toBeDisabled();
      await expect(rows.nth(i)).toContainText("Opens once you own an A" + (i + 1) + " car");
    }
    await page.keyboard.press("Escape");
    await expect(page.locator("#cups")).toBeHidden();
    // during a contract no cup starts
    await game.eval(() => __T.jobStart(__T.JOBS[0]));
    await page.locator("#pCups").click();
    await expect(page.locator("#cpNote")).toContainText("contract");
    await expect(btn(0)).toBeDisabled();
  });

  test("three won rounds win the cup and pay its prize once; NEXT ROUND goes on to the next event", async ({ game, page }) => {
    test.setTimeout(300_000);
    await ready(game);
    const cup = await game.eval(() => __T.CUPS[0]);
    const cr0 = await game.eval(() => __T.save.cr);
    let paid = 0;
    await game.eval(() => __T.cupStart("A1"));
    await game.waitState("INTRO");
    await expect(page.locator("#iType")).toHaveText(/^A1 CUP · ROUND 1 OF 3 · /);
    for (let r = 0; r < 3; r++) {
      await page.locator("#iGo").click();
      await page.waitForFunction(() => __T.ev && __T.state === "DRIVE", null, { timeout: 30_000 });
      const ev = await game.eval(() => ({ id: __T.ev.E.id, cls: __T.ev.cup && __T.ev.cup.cls, rivals: __T.ev.ai.map((a) => a.name), diff: __T.ev.diff }));
      expect(ev.id).toBe(cup.ev[r]);
      expect(ev.cls).toBe("A1");
      const res = await game.eval(WIN_ROUND);
      expect(res.rows).toContain("Cup points+10 · " + (r + 1) * 10 + " of " + (r + 1) * 10);
      paid += await game.eval(
        ([id, d]) => {
          const E = __T.EVENTS.find((x) => x.id === id);
          return E.type === "race" ? __T.raceRewards(E, d)[0] : E.rewards[0];
        },
        [ev.id, ev.diff]
      );
      if (r < 2) {
        expect(res.next).toBe(true);
        await page.locator("#rNext").click();
        await game.waitState("INTRO");
        await expect(page.locator("#iType")).toHaveText(new RegExp("^A1 CUP · ROUND " + (r + 2) + " OF 3"));
      } else {
        expect(res.next).toBe(false);
        expect(res.rows).toContain("Cup wonA1 Cup · +" + cup.prize.toLocaleString("en-US"));
      }
    }
    const after = await game.eval(() => ({ cr: __T.save.cr, champ: __T.save.champ.A1 }));
    expect(after.champ).toEqual({ r: 3, pts: [10, 10, 10], won: true });
    expect(after.cr - cr0).toBe(paid + cup.prize);
    expect((await game.readSave()).champ.A1.won).toBe(true);
    await page.locator("#rOk").click();
    await game.waitState("DRIVE");
    // again: it starts afresh, and a second win pays no prize
    const cr1 = await game.eval(() => __T.save.cr);
    await game.eval(() => __T.cupStart("A1"));
    await game.waitState("INTRO");
    await expect(page.locator("#iType")).toHaveText(/ROUND 1 OF 3/);
    let paid2 = 0;
    for (let r = 0; r < 3; r++) {
      await game.eval(() => document.getElementById("iGo").click());
      await page.waitForFunction(() => __T.ev && __T.state === "DRIVE", null, { timeout: 30_000 });
      const ev = await game.eval(() => ({ id: __T.ev.E.id, diff: __T.ev.diff }));
      const res = await game.eval(WIN_ROUND);
      paid2 += await game.eval(
        ([id, d]) => {
          const E = __T.EVENTS.find((x) => x.id === id);
          return E.type === "race" ? __T.raceRewards(E, d)[0] : E.rewards[0];
        },
        [ev.id, ev.diff]
      );
      if (r < 2) {
        await page.locator("#rNext").click();
        await game.waitState("INTRO");
      } else expect(res.rows).toContain("the prize was paid the first time");
    }
    expect((await game.eval(() => __T.save.cr)) - cr1).toBe(paid2);
  });

  test("a cup is won with 22 points, not fewer; quitting a round leaves the cup where it was", async ({ game, page }) => {
    await ready(game);
    // rounds of 6 and 6 points, then quit the third
    const play = (place) =>
      game.eval((place) => {
        const T = __T,
          ev = T.ev;
        for (let i = 0; i < 200; i++) T.driveUpdate(1 / 60);
        if (ev.E.type === "race") ev.ai.forEach((a, k) => (a.fin = k < place ? 0.001 : 0));
        else ev.t = [ev.tg.gold - 1, ev.tg.silver - 0.5, ev.tg.bronze - 0.5, ev.tg.bronze + 5][place];
        T.finishEvent();
        T.showResult();
        return document.getElementById("rRows").textContent;
      }, place);
    await game.eval(() => __T.cupStart("A1"));
    await game.waitState("INTRO");
    for (let r = 0; r < 2; r++) {
      await page.locator("#iGo").click();
      await page.waitForFunction(() => __T.ev && __T.state === "DRIVE", null, { timeout: 30_000 });
      expect(await play(1)).toContain("Cup points+6");
      await page.locator("#rNext").click();
      await game.waitState("INTRO");
    }
    await page.locator("#iGo").click();
    await page.waitForFunction(() => __T.ev && __T.state === "DRIVE", null, { timeout: 30_000 });
    await game.key("Escape");
    await game.waitState("PAUSE");
    await page.locator("#pQuit").click();
    await game.waitState("DRIVE");
    expect(await game.eval(() => __T.save.champ.A1)).toEqual({ r: 2, pts: [6, 6], won: false });
    // the third round again: 6 more is 18, short of 22
    await game.eval(() => __T.cupStart("A1"));
    await game.waitState("INTRO");
    await expect(page.locator("#iType")).toHaveText(/ROUND 3 OF 3/);
    await page.locator("#iGo").click();
    await page.waitForFunction(() => __T.ev && __T.state === "DRIVE", null, { timeout: 30_000 });
    expect(await play(1)).toContain("Cup over18 points, 22 needed to win");
    expect(await game.eval(() => __T.save.champ.A1.won)).toBe(false);
  });

  test("cup time trials have medal times for the class; the autopilot gets a medal in a slow and a fast class", async ({ game }) => {
    test.setTimeout(400_000);
    await ready(game);
    const t = await game.eval(() => {
      const T = __T,
        E = T.EVENTS.find((x) => x.id === "cubells");
      return { A1: T.cupTimes(E, "A1").gold, A3: T.cupTimes(E, "A3").gold, A7: T.cupTimes(E, "A7").gold, usual: E.gold };
    });
    expect(t.A3).toBeCloseTo(t.usual, 6);
    expect(t.A1).toBeGreaterThan(t.A3);
    expect(t.A7).toBeLessThan(t.A3);
    // the autopilot, in a Golf (A1) on the A1 cup's time trial, and in a Chiron (A7) on the A7 cup's
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = {};
      for (const [car, cls] of [
        ["golf", "A1"],
        ["chiron", "A7"],
      ]) {
        if (!T.save.owned.includes(car)) T.save.owned.push(car);
        T.attachCar(car);
        const C = T.CUPS.find((c) => c.cls === cls),
          E = T.EVENTS.find((x) => x.id === C.ev[0]);
        T.startEvent(E, { cls, round: 0 });
        for (let i = 0; i < 30000 && T.ev && !T.ev.fin; i++) {
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
        T.keys.a = T.keys.d = T.keys.w = false;
        out[cls] = { event: E.id, time: T.ev.fin.t, gold: T.ev.tg.gold, bronze: T.ev.tg.bronze, title: T.ev.fin.title };
        T.showResult();
        document.getElementById("rOk").click();
      }
      return out;
    });
    test.info().annotations.push({ type: "autopilot in cup time trials", description: JSON.stringify(r) });
    for (const cls of ["A1", "A7"]) expect(r[cls].title, cls).not.toBe("NO MEDAL");
  });

  test("the garage shows the cups won, and a damaged championship save is cleaned up", async ({ game, page }) => {
    await game.open({
      save: JSON.stringify({ v: 3, champ: { A1: { r: 3, pts: [10, 6, 10], won: true }, A2: { pts: [7, "x", 4] }, A9: { r: 1, pts: [10] }, A3: "yes" } }),
    });
    expect(await game.eval(() => __T.save.champ)).toEqual({ A1: { r: 3, pts: [10, 6, 10], won: true }, A2: { r: 1, pts: [4], won: false } });
    await game.eval(() => __T.goGarage(true));
    await game.waitState("GARAGE");
    await expect(page.locator("#gcups")).toHaveText(" · CUPS WON: A1");
  });
});

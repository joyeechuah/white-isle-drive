// Island Passport: 18 landmarks found by driving to them, each paying once, a one-time bonus for all 18, and
// progress that survives a reload. The car is driven in by an autopilot following the GPS, as a player would.
const { test, expect } = require("./support/game");

// park on a road 200 to 450 m from landmark i, then drive there following the GPS
async function driveTo(game, i) {
  const start = await game.eval((i) => {
    const T = __T,
      L = T.LANDMARKS[i];
    for (const e of T.EDGES) {
      if (e.type === "drive") continue;
      for (let s = 5; s < e.len; s += 20) {
        const q = T.edgePos(e, s),
          d = Math.hypot(q.x - L.x, q.z - L.z);
        if (d > 200 && d < 450 && T.routeBetween(q.x, q.z, L.x, L.z)) return { x: q.x, z: q.z };
      }
    }
    return null;
  }, i);
  expect(start, "a starting point near the landmark").not.toBeNull();
  await game.park(start.x, start.z);
  await game.eval((i) => {
    const L = __T.LANDMARKS[i];
    __T.setGPS(L.x, L.z, "test");
  }, i);
  await game.steps(30, {});
  return game.routeBot(30000, "gps");
}

async function ready(game, save) {
  await game.open({ save });
  await game.driveOut();
  // traffic out of the way, so the autopilot's runs are the same every time, and every speed radar record out of
  // reach, so passing one pays nothing
  await game.eval(() => {
    for (const r of __T.RADARS) __T.save.radar[r.id] = 999;
    for (const t of __T.TRAFFIC) {
      t.e = null;
      t.c.G.visible = false;
      t.wx = 1e6;
      t.wz = 1e6;
    }
  });
}

test.describe("island passport", () => {
  test("18 landmarks with unique ids and names, each on a drivable road and well apart", async ({ game }) => {
    await game.open();
    const r = await game.eval(() => {
      const T = __T,
        L = T.LANDMARKS;
      let minGap = 1e9;
      for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) minGap = Math.min(minGap, Math.hypot(L[a].x - L[b].x, L[a].z - L[b].z));
      return {
        n: L.length,
        ids: new Set(L.map((l) => l.id)).size,
        names: new Set(L.map((l) => l.name)).size,
        offRoad: L.filter((l) => {
          const nr = T.nearestRoad(l.x, l.z, 30);
          return !nr || nr.e.type === "drive" || nr.d > 1;
        }).map((l) => l.id),
        minGap: Math.round(minGap),
        hints: L.every((l) => typeof l.hint === "string" && l.hint.length > 10 && !l.hint.includes(l.name)),
      };
    });
    expect(r).toMatchObject({ n: 18, ids: 18, names: 18, offRoad: [], hints: true });
    expect(r.minGap, "metres between the two closest landmarks").toBeGreaterThanOrEqual(120);
  });

  test("driving to a landmark finds it: one message and 2,500 CR, and going back pays nothing", async ({ game }) => {
    await ready(game);
    await game.watchToasts();
    const cr0 = await game.eval(() => __T.save.cr);
    const id = await game.eval(() => __T.LANDMARKS[4].id);
    await driveTo(game, 4);
    expect(await game.eval((id) => __T.save.found[id], id)).toBe(1);
    expect((await game.eval(() => __T.save.cr)) - cr0).toBe(2500);
    // drive away and back again
    await driveTo(game, 4);
    expect((await game.eval(() => __T.save.cr)) - cr0).toBe(2500);
    const msgs = (await game.toastLog()).filter((t) => t.startsWith("LANDMARK DISCOVERED"));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("1/18");
    expect((await game.readSave()).found[id]).toBe(1);
  });

  test("being put on a landmark (map travel, a reset, the GPS) doesn't count as finding it", async ({ game }) => {
    await ready(game);
    const r = await game.eval(() => {
      const T = __T,
        L = T.LANDMARKS[7];
      T.P.x = L.x;
      T.P.z = L.z;
      T.resetToRoad(false);
      T.P.vx = T.P.vz = 0;
      for (let i = 0; i < 120; i++) T.driveUpdate(1 / 60);
      // and a few metres of creeping about inside the circle
      for (let i = 0; i < 60; i++) {
        T.keys.w = i < 20;
        T.driveUpdate(1 / 60);
      }
      T.keys.w = false;
      return { found: !!T.save.found[L.id], d: Math.hypot(T.P.x - L.x, T.P.z - L.z) };
    });
    expect(r.d, "metres from the landmark").toBeLessThan(26);
    expect(r.found).toBe(false);
  });

  test("the 18th landmark pays the 30,000 CR bonus once; finding one again never pays it twice", async ({ game }) => {
    await ready(game);
    await game.eval(() => {
      const T = __T;
      for (const L of T.LANDMARKS.slice(1)) T.save.found[L.id] = 1;
    });
    await game.watchToasts();
    const cr0 = await game.eval(() => __T.save.cr);
    await driveTo(game, 0);
    expect((await game.eval(() => __T.save.cr)) - cr0).toBe(2500 + 30000);
    expect(await game.eval(() => __T.save.passBonus)).toBe(true);
    expect((await game.toastLog()).filter((t) => t.startsWith("ISLAND PASSPORT COMPLETE"))).toHaveLength(1);
    // the same landmark again, and a landmark forgotten and found again: no second bonus
    const again = await game.eval(() => {
      const T = __T,
        c = T.save.cr,
        a = T.discoverLandmark(T.LANDMARKS[0]);
      delete T.save.found[T.LANDMARKS[3].id];
      const b = T.discoverLandmark(T.LANDMARKS[3]);
      return { a, b, paid: T.save.cr - c };
    });
    expect(again).toEqual({ a: false, b: true, paid: 2500 });
  });

  test("found landmarks, credits and the bonus survive a reload", async ({ game }) => {
    await ready(game);
    await driveTo(game, 2);
    const before = await game.eval(() => ({ cr: __T.save.cr, found: { ...__T.save.found }, bonus: __T.save.passBonus }));
    await game.reload();
    expect(await game.eval(() => ({ cr: __T.save.cr, found: { ...__T.save.found }, bonus: __T.save.passBonus }))).toEqual(before);
    expect(Object.keys(before.found)).toHaveLength(1);
  });

  test("the passport screen names found landmarks only; the rest show a hint and no name", async ({ game, page }) => {
    await ready(game);
    await game.eval(() => {
      __T.save.found[__T.LANDMARKS[5].id] = 1;
    });
    await game.park();
    await game.key("Escape");
    await game.waitState("PAUSE");
    await page.locator("#pPass").click();
    await expect(page.locator("#passport")).toBeVisible();
    await expect(page.locator("#pzCount")).toHaveText("1 of 18 found · 6%");
    const text = await page.locator("#pzList").innerText();
    const names = await game.eval(() => __T.LANDMARKS.map((l) => l.name));
    expect(text).toContain(names[5]);
    for (const [i, n] of names.entries()) if (i !== 5) expect(text, "an unfound landmark's name").not.toContain(n);
    expect((text.match(/Not found yet/g) || []).length).toBe(17);
    // GPS to the found one closes the screen and sets the route
    await page.locator("#pzList button").first().click();
    await expect(page.locator("#passport")).toBeHidden();
    expect(await game.eval(() => __T.gps.label)).toBe(names[5]);
  });
});

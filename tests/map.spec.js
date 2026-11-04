// GPS and the island map: waypoints and routes, mouse and touch zoom and pan (with real touch input through
// Chrome's DevTools protocol), turning a phone while the map is open, and travelling from a marker.
const { test, expect } = require("./support/game");

// a screen point right on a road, away from markers and the map's side panels
const ROAD_PIXEL = () => {
  const T = __T,
    side = ["mapSide", "mapClose", "mapZoom", "mapMe"]
      .map((id) => document.getElementById(id))
      .filter((e) => e && e.offsetParent)
      .map((e) => e.getBoundingClientRect()),
    ms = T.mapMarkers();
  for (let y = 60; y < innerHeight - 60; y += 6)
    for (let x = 60; x < innerWidth - 60; x += 6) {
      if (side.some((b) => x >= b.left - 8 && x <= b.right + 8 && y >= b.top - 8 && y <= b.bottom + 8)) continue;
      const w = T.mapToWorld(x, y),
        nr = T.nearestRoad(w.x, w.z, 12);
      if (!nr || nr.d > 2) continue;
      if (ms.some((m) => Math.hypot(m.x - w.x, m.z - w.z) < 40 / T.MV.s)) continue;
      return { x, y, wx: w.x, wz: w.z };
    }
  return null;
};

// the screen point closest to a world position
const SCREEN_OF = ([wx, wz]) => {
  let best = null,
    bd = 1e18;
  for (let y = 4; y < innerHeight; y += 3)
    for (let x = 4; x < innerWidth; x += 3) {
      const w = __T.mapToWorld(x, y),
        d = (w.x - wx) ** 2 + (w.z - wz) ** 2;
      if (d < bd) {
        bd = d;
        best = { x, y };
      }
    }
  return best;
};

const resetView = (game) =>
  game.eval(() => {
    const MV = __T.MV;
    MV.z = 1;
    MV.cx = 0;
    MV.cz = 0;
    __T.mapZoomAt(1, innerWidth / 2, innerHeight / 2);
  });

test.describe("map on a computer", () => {
  test.beforeEach(async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    await game.key("m");
    await game.waitState("MAP");
  });

  test("a click on a road sets a waypoint and the GPS plans a route to it", async ({ game, page }) => {
    const p = await game.eval(ROAD_PIXEL);
    expect(p).not.toBeNull();
    await page.mouse.click(p.x, p.y);
    const g = await game.eval(() => ({ label: __T.gps.label, t: __T.gps.t, n: __T.gps.route ? __T.gps.route.pts.length : 0, len: __T.gps.route ? __T.gps.route.len : 0 }));
    expect(g.label).toBe("Waypoint");
    expect(Math.hypot(g.t.x - p.wx, g.t.z - p.wz), "metres from the clicked point").toBeLessThan(25);
    expect(g.n).toBeGreaterThan(1);
    const crow = await game.eval((t) => Math.hypot(t.x - __T.P.x, t.z - __T.P.z), g.t);
    expect(g.len).toBeGreaterThanOrEqual(crow * 0.95);
    await game.key("Escape");
    await game.waitState("DRIVE");
    await expect(page.locator("#gpsTxt")).not.toBeEmpty();
  });

  test("routes join any two places on the road network, end to end", async ({ game }) => {
    const bad = await game.eval(() => {
      const T = __T,
        E = T.EDGES.filter((e) => e.type !== "drive" && e.len > 40),
        out = [];
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 25; k++) {
        const a = T.edgePos(E[Math.floor(rnd() * E.length)], 10),
          b = T.edgePos(E[Math.floor(rnd() * E.length)], 10);
        const R = T.routeBetween(a.x, a.z, b.x, b.z);
        if (!R) {
          out.push({ k, why: "no route" });
          continue;
        }
        const s = R.pts[0],
          e = R.pts[R.pts.length - 1],
          crow = Math.hypot(b.x - a.x, b.z - a.z);
        if (Math.hypot(s.x - a.x, s.z - a.z) > 15 || Math.hypot(e.x - b.x, e.z - b.z) > 15 || R.len < crow * 0.98) out.push({ k, len: R.len, crow });
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test("the mouse wheel zooms within limits and a drag pans", async ({ game, page }) => {
    await resetView(game);
    const cx = 640,
      cy = 360;
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -400);
    const zin = await game.eval(() => __T.MV.z);
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 400);
    const zout = await game.eval(() => __T.MV.z);
    expect(zin).toBeCloseTo(10, 5);
    expect(zout).toBeCloseTo(1, 5);
    await page.mouse.wheel(0, -500);
    const c0 = await game.eval(() => [__T.MV.cx, __T.MV.cz]);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 40, { steps: 6 });
    await page.mouse.up();
    const c1 = await game.eval(() => [__T.MV.cx, __T.MV.cz]);
    expect(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), "metres panned").toBeGreaterThan(5);
    expect(await game.eval(() => document.getElementById("mapPop").classList.contains("hide")), "a drag isn't a click").toBe(true);
  });

  test("an event marker opens a popup that travels there", async ({ game, page }) => {
    await resetView(game);
    const E = await game.eval(() => [__T.EVENTS[3].x, __T.EVENTS[3].z]);
    const p = await game.eval(SCREEN_OF, E);
    // the point found is on the marker and not under one of the map's own panels
    const check = await game.eval(
      ([p, E]) => {
        const w = __T.mapToWorld(p.x, p.y),
          hit = document.elementFromPoint(p.x, p.y);
        return { metres: Math.hypot(w.x - E[0], w.z - E[1]), limit: 20 / __T.MV.s, on: hit && hit.id };
      },
      [p, E]
    );
    expect(check.metres).toBeLessThan(check.limit);
    expect(check.on).toBe("mapc");
    await page.mouse.click(p.x, p.y);
    await expect(page.locator("#mapPop")).toBeVisible();
    await page.locator("#mapPop button", { hasText: "TRAVEL THERE" }).click();
    await game.waitState("DRIVE", 30_000);
    const d = await game.eval((E) => Math.hypot(__T.P.x - E[0], __T.P.z - E[1]), E);
    expect(d, "metres from the event").toBeLessThan(80);
  });
});

test.describe("map on a phone", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test.beforeEach(async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    await game.eval(() => __T.openMap());
    await game.waitState("MAP");
  });

  // Chrome's touch emulation releases the points listed in a touchEnd and keeps the rest
  const touchOf = (cdp) => (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });
  const zoom = async (game) => {
    await game.frames(3);
    return game.eval(() => __T.MV.z);
  };

  test("two-finger pinch follows the spread, and a third finger coming and going doesn't jump the zoom", async ({ game, page }) => {
    const touch = touchOf(await page.context().newCDPSession(page));
    await resetView(game);
    await touch("touchStart", [[1, 300, 200]]);
    await touch("touchStart", [[1, 300, 200], [2, 400, 200]]);
    for (const x of [420, 440, 460]) await touch("touchMove", [[1, 300, 200], [2, x, 200]]);
    const za = await zoom(game);
    await touch("touchEnd", [[1, 300, 200]]);
    await touch("touchEnd", []);
    expect(za, "100 px to 160 px").toBeCloseTo(1.6, 1);

    await resetView(game);
    await touch("touchStart", [[1, 300, 200]]);
    await touch("touchStart", [[1, 300, 200], [2, 400, 200]]);
    await touch("touchStart", [[1, 300, 200], [2, 400, 200], [3, 660, 200]]);
    const zb = await zoom(game);
    await touch("touchEnd", [[1, 300, 200]]);
    await touch("touchMove", [[2, 400, 200], [3, 661, 200]]);
    const zc = await zoom(game);
    expect(Math.abs(zc - zb) / zb, "after the first finger lifts, a 1 px move").toBeLessThan(0.01);
    for (const x of [700, 750, 790]) await touch("touchMove", [[2, 400, 200], [3, x, 200]]);
    const zd = await zoom(game);
    await touch("touchEnd", []);
    expect(zd / zc, "the remaining pair: 260 px to 390 px").toBeCloseTo(1.5, 1);
  });

  test("after a cancelled pinch a one-finger drag pans, and a tap on a road sets a waypoint", async ({ game, page }) => {
    const cdp = await page.context().newCDPSession(page);
    const touch = touchOf(cdp);
    await resetView(game);
    await game.eval(() => __T.mapZoomAt(2, innerWidth / 2, innerHeight / 2));
    await touch("touchStart", [[1, 300, 200]]);
    await touch("touchStart", [[1, 300, 200], [2, 400, 200]]);
    await touch("touchMove", [[1, 300, 200], [2, 430, 200]]);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    const c0 = await game.eval(() => [__T.MV.cx, __T.MV.cz]);
    await touch("touchStart", [[4, 300, 150]]);
    for (const d of [20, 40, 60]) await touch("touchMove", [[4, 300 + d, 150]]);
    await touch("touchEnd", []);
    const c1 = await game.eval(() => [__T.MV.cx, __T.MV.cz]);
    expect(c1[0]).not.toBe(c0[0]);
    const z = await game.eval(() => __T.MV.z);
    expect(Number.isFinite(z) && z >= 1 && z <= 10).toBe(true);
    const p = await game.eval(ROAD_PIXEL);
    await touch("touchStart", [[9, p.x, p.y]]);
    await touch("touchEnd", []);
    await expect.poll(() => game.eval(() => __T.gps.label)).toBe("Waypoint");
  });

  test("turning the phone while the map is open refits the map to the new screen", async ({ game, page }) => {
    await game.eval(() => __T.mapZoomAt(3, innerWidth / 2, innerHeight / 2));
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => game.eval(() => innerWidth), { timeout: 30_000 }).toBe(390);
    await game.frames(4);
    const r = await game.eval(() => {
      const c = document.getElementById("mapc"),
        b = c.getBoundingClientRect(),
        MV = __T.MV;
      return { w: Math.round(b.width), h: Math.round(b.height), finite: [MV.z, MV.cx, MV.cz, MV.s].every(Number.isFinite), z: MV.z, state: __T.state };
    });
    expect(r).toMatchObject({ w: 390, h: 844, finite: true, state: "MAP" });
    expect(r.z).toBeGreaterThanOrEqual(1);
    // the map still answers taps where they land
    const p = await game.eval(ROAD_PIXEL);
    expect(p).not.toBeNull();
    const touch = touchOf(await page.context().newCDPSession(page));
    await touch("touchStart", [[1, p.x, p.y]]);
    await touch("touchEnd", []);
    await expect.poll(() => game.eval(() => __T.gps.label)).toBe("Waypoint");
    const t = await game.eval(() => __T.gps.t);
    expect(Math.hypot(t.x - p.wx, t.z - p.wz)).toBeLessThan(25);
  });
});

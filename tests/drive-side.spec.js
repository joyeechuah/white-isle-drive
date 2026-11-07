// Driving side: traffic keeps to the left by default (as in Malaysia), or to the right (as in Spain) from DRIVE ON in
// the pause menu. The car is put in the lane on that side, a race's grid is mirrored, and ONCOMING counts the other side.
const { test, expect } = require("./support/game");

// where each traffic car on the road is, across it: + right of its own direction of travel, - left
const TRAFFIC_SIDES = () => {
  const T = __T,
    out = [];
  for (const t of T.TRAFFIC) {
    if (!t.e) continue;
    const nr = T.nearestRoad(t.wx, t.wz, 8);
    if (!nr || nr.e !== t.e) continue;
    out.push(nr.side * (Math.sin(t.yaw) * nr.dx + Math.cos(t.yaw) * nr.dz >= 0 ? 1 : -1));
  }
  return out;
};
// the car, across the road from the middle, for its own direction
const MY_SIDE = () => {
  const T = __T,
    P = T.P,
    nr = T.nearestRoad(P.x, P.z, 10);
  return nr.side * (Math.sin(P.h) * nr.dx + Math.cos(P.h) * nr.dz >= 0 ? 1 : -1);
};

test.describe("driving side", () => {
  test("traffic keeps to the left by default, and the car is put in the left lane", async ({ game }) => {
    await game.open();
    expect(await game.eval(() => __T.save.side)).toBe("L");
    await game.driveOut();
    await game.park();
    await game.steps(120, {});
    const sides = await game.eval(TRAFFIC_SIDES);
    expect(sides.length).toBeGreaterThan(5);
    expect(sides.filter((x) => x > 0), "traffic cars on the right").toEqual([]);
    expect(await game.eval(MY_SIDE)).toBeLessThan(-1);
  });

  test("DRIVE ON in the pause menu moves traffic to the right at once, and it's saved", async ({ game, page }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    await game.key("Escape");
    await game.waitState("PAUSE");
    await expect(page.locator("#pSide")).toHaveText("DRIVE ON: LEFT");
    await page.locator("#pSide").click();
    await expect(page.locator("#pSide")).toHaveText("DRIVE ON: RIGHT");
    await page.locator("#pRes").click();
    await game.waitState("DRIVE");
    await game.steps(2, {});
    const sides = await game.eval(TRAFFIC_SIDES);
    expect(sides.filter((x) => x < 0), "traffic cars on the left").toEqual([]);
    await game.park();
    expect(await game.eval(MY_SIDE)).toBeGreaterThan(1);
    expect((await game.readSave()).side).toBe("R");
    await game.reload();
    expect(await game.eval(() => __T.save.side)).toBe("R");
  });

  test("a race's grid is mirrored: rivals start in the lane on the driving side", async ({ game }) => {
    await game.open();
    await game.driveOut();
    const lanes = await game.eval(() => {
      const T = __T,
        out = {};
      for (const side of ["L", "R"]) {
        T.save.side = side;
        T.startEvent(T.EVENTS[1]);
        const R = T.ev.R,
          me = T.trackRoute(R, T.P.x, T.P.z, 0).side;
        out[side] = { me: +me.toFixed(2), rivals: T.ev.ai.map((a) => a.lat) };
        T.ev = null;
        T.endEvent && T.endEvent();
      }
      return out;
    });
    expect(lanes.L.rivals).toEqual([-1.9, 1.7, -1.9]);
    expect(lanes.L.me).toBeCloseTo(1.7, 1);
    expect(lanes.R.rivals).toEqual([1.9, -1.7, 1.9]);
    expect(lanes.R.me).toBeCloseTo(-1.7, 1);
  });

  test("ONCOMING points come from driving on the side traffic doesn't use", async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    const pts = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = {};
      T.save.assist = false;
      for (const [k, off] of [
        ["left lane", -1.9],
        ["right lane", 1.9],
      ]) {
        T.streakReset();
        T.resetToRoad(false);
        const nr = T.nearestRoad(P.x, P.z, 10),
          dir = Math.sin(P.h) * nr.dx + Math.cos(P.h) * nr.dz >= 0 ? 1 : -1,
          ux = nr.dx * dir,
          uz = nr.dz * dir;
        P.x = nr.x - uz * off;
        P.z = nr.z + ux * off;
        P.h = Math.atan2(ux, uz);
        P.vx = ux * 25;
        P.vz = uz * 25;
        for (let i = 0; i < 30; i++) {
          T.keys.w = true;
          T.driveUpdate(1 / 60);
        }
        T.keys.w = false;
        out[k] = T.FR.label === "ONCOMING" ? T.FR.pts : 0;
      }
      return out;
    });
    // driving on the left: the right lane is the oncoming one
    expect(pts["left lane"]).toBe(0);
    expect(pts["right lane"]).toBeGreaterThan(0);
  });
});

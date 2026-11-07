// Cameras: the chase view shows the road ahead over the car, and the camera you pick is remembered.
const { test, expect } = require("./support/game");

test.describe("camera", () => {
  test.beforeEach(async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.park();
  });

  test("the chase camera shows the road ahead over the car's roof, along every race route", async ({ game }) => {
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = {};
      for (const t of T.TRAFFIC) {
        t.e = null;
        t.c.G.visible = false;
        t.wx = 1e6;
        t.wz = 1e6;
      }
      for (const car of ["golf", "rrsport", "chiron"]) {
        T.attachCar(car);
        T.camMode = 0;
        let hidden = 0,
          total = 0;
        // every 60 m along each route: the road 12, 20, 30 and 45 m further on, at ground level and at the middle
        // of a car (0.7 m up), counted as hidden when it falls inside the car's outline on screen
        for (const E of T.EVENTS) {
          const R = E.route;
          for (let s0 = 40; s0 < R.len - 60; s0 += 60) {
            const q = T.edgePos(R, s0);
            for (let i = 0; i < 90; i++) {
              P.x = q.x;
              P.z = q.z;
              P.h = Math.atan2(q.dx, q.dz);
              P.vx = P.vz = 0;
              T.driveUpdate(1 / 60);
            }
            const cam = T.camera;
            cam.updateMatrixWorld();
            T.pc.G.updateMatrixWorld(true);
            const bx = new THREE.Box3().setFromObject(T.pc.G);
            // the car's outline on screen, in the camera's -1..1 coordinates (y up)
            let l = 1e9,
              t = -1e9,
              rr = -1e9,
              bb = 1e9;
            for (const x of [bx.min.x, bx.max.x])
              for (const y of [bx.min.y, bx.max.y])
                for (const z of [bx.min.z, bx.max.z]) {
                  const p = new THREE.Vector3(x, y, z).project(cam);
                  l = Math.min(l, p.x);
                  rr = Math.max(rr, p.x);
                  t = Math.max(t, p.y);
                  bb = Math.min(bb, p.y);
                }
            for (const d of [12, 20, 30, 45]) {
              const g = T.edgePos(R, Math.min(R.len, s0 + d)),
                gy = T.groundH(g.x, g.z);
              for (const hy of [0, 0.7]) {
                const p = new THREE.Vector3(g.x, gy + hy, g.z).project(cam);
                total++;
                if (p.x > l && p.x < rr && p.y < t && p.y > bb) hidden++;
              }
            }
          }
        }
        out[car] = +(hidden / total).toFixed(3);
      }
      return out;
    });
    test.info().annotations.push({ type: "share of the road ahead hidden by the car", description: JSON.stringify(r) });
    // with the camera 2 m up aiming 9 m ahead, the car hid 56 to 74% of these points
    for (const [car, share] of Object.entries(r)) expect(share, `${car}: share of the road ahead hidden behind the car`).toBeLessThan(0.45);
  });

  test("the camera you choose is remembered", async ({ game, page }) => {
    await game.key("c");
    await game.key("c");
    expect(await game.eval(() => __T.camMode)).toBe(2);
    await game.reload();
    expect(await game.eval(() => [__T.camMode, __T.save.cam])).toEqual([2, 2]);
    await expect(page.locator("#chCam")).toHaveText("CAM: BUMPER");
  });
});

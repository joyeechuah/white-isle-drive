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

  test("the car doesn't shake on screen at speed when frames come unevenly (as on phones)", async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    const r = await game.eval(() => {
      const T = __T,
        P = T.P;
      for (const t of T.TRAFFIC) {
        t.e = null;
        t.c.G.visible = false;
        t.wx = t.wz = 1e6;
      }
      T.attachCar("gtr");
      // 180 km/h on the longest highway, gas held; where the car is on screen each frame (in pixels of a 720 px tall view)
      const run = (frames) => {
        const e = T.EDGES.filter((e) => e.type === "highway").sort((a, b) => b.len - a.len)[0],
          q = T.edgePos(e, 200);
        P.x = q.x;
        P.z = q.z;
        P.h = Math.atan2(q.dx, q.dz);
        P.vx = q.dx * 50;
        P.vz = q.dz * 50;
        P.r = P.steer = P.steerS = 0;
        P.laneT = null;
        T.snapCam();
        const ys = [];
        for (let i = 0; i < 240; i++) {
          T.keys.w = true;
          T.driveUpdate(frames[i % frames.length]);
          T.camera.updateMatrixWorld();
          if (i > 120) ys.push(T.pc.G.position.clone().project(T.camera).y * 360);
        }
        T.keys.w = false;
        // frame-to-frame jerk: how far each frame's position is from halfway between its neighbours
        let d = 0;
        for (let i = 1; i < ys.length - 1; i++) d += Math.abs(ys[i + 1] - 2 * ys[i] + ys[i - 1]);
        return d / (ys.length - 2);
      };
      return { even: run([1 / 45]), uneven: run([1 / 60, 1 / 30]), phone: run([1 / 60, 1 / 60, 1 / 30, 1 / 40, 1 / 25]) };
    });
    test.info().annotations.push({ type: "car jerk on screen (px per frame)", description: JSON.stringify(r) });
    // it used to be about 1.2 to 1.4 px a frame with uneven frames (the camera's lag behind the car changed with each
    // frame's length), against 0.25 with even ones
    expect(r.uneven).toBeLessThan(0.3);
    expect(r.phone).toBeLessThan(0.3);
  });

  test("through bends with uneven frames the car stays steady on screen, sideways and up and down, and the zoom doesn't twitch", async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    const r = await game.eval(() => {
      const T = __T,
        P = T.P;
      for (const t of T.TRAFFIC) {
        t.e = null;
        t.c.G.visible = false;
        t.wx = t.wz = 1e6;
      }
      T.attachCar("gtr");
      T.save.assist = true;
      const frames = [1 / 60, 1 / 60, 1 / 30, 1 / 40, 1 / 25],
        out = [];
      // gas held for 8 s from 90 km/h on three winding roads; the car's jerk on screen (px of a 1280 x 720 view) and the zoom's
      for (const ei of [17, 15, 1]) {
        const e = T.EDGES[ei],
          q = T.edgePos(e, 30),
          S = T.save.side === "R" ? 1 : -1,
          lane = T.RT[e.type].lanes[0];
        P.x = q.x - q.dz * lane * S;
        P.z = q.z + q.dx * lane * S;
        P.h = Math.atan2(q.dx, q.dz);
        P.vx = q.dx * 25;
        P.vz = q.dz * 25;
        P.r = P.steer = P.steerS = 0;
        P.laneT = null;
        T.snapCam();
        const xs = [],
          ys = [],
          fov = [];
        for (let i = 0; i < 480; i++) {
          T.keys.w = true;
          T.driveUpdate(frames[i % frames.length]);
          T.camera.updateMatrixWorld();
          const v = T.pc.G.position.clone().project(T.camera);
          if (i > 60) {
            xs.push(v.x * 640);
            ys.push(v.y * 360);
            fov.push(T.camera.fov);
          }
        }
        T.keys.w = false;
        const j = (a) => {
          let d = 0;
          for (let i = 1; i < a.length - 1; i++) d += Math.abs(a[i + 1] - 2 * a[i] + a[i - 1]);
          return d / (a.length - 2);
        };
        out.push({ ei, x: j(xs), y: j(ys), fov: j(fov) });
      }
      return out;
    });
    test.info().annotations.push({ type: "jerk in bends (px, degrees)", description: JSON.stringify(r) });
    for (const x of r) {
      // before this fix: 0.23 to 0.36 px sideways and 1.3 to 1.9 px up and down
      expect(x.x, `road ${x.ei}: sideways`).toBeLessThan(0.15);
      expect(x.y, `road ${x.ei}: up and down`).toBeLessThan(0.35);
      expect(x.fov, `road ${x.ei}: zoom`).toBeLessThan(0.05);
    }
  });
});

// Driving: the car responds to the controls, the sea puts you back on the road, travel and menus leave the car in
// a sane state. Simulation steps run inside the page (game.steps), so results don't depend on the machine's speed.
const { test, expect } = require("./support/game");

test.describe("driving", () => {
  test.beforeEach(async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    // driving assist keeps the car in its lane; these tests want the raw controls
    await game.eval(() => {
      __T.save.assist = false;
    });
  });

  test("accelerating, braking to a stop and reversing", async ({ game }) => {
    const go = await game.steps(240, { w: true });
    expect(go.fwd, "km/h forward after 4 s on the throttle").toBeGreaterThan(50);
    let s = go;
    for (let i = 0; i < 20 && s.fwd > 0.5; i++) s = await game.steps(30, { s: true });
    expect(s.fwd, "km/h after braking").toBeLessThan(0.5);
    const back = await game.steps(150, { s: true });
    expect(back.fwd, "km/h after holding the brake at a standstill").toBeLessThan(-3);
  });

  test("steering left and right turn the car opposite ways, and only when it moves", async ({ game }) => {
    const still = await game.steps(60, { a: true });
    const h0 = await game.eval(() => __T.P.h);
    expect(Math.abs(still.h - h0)).toBeLessThan(0.01);
    const turn = async (k) => {
      await game.park();
      await game.eval(() => {
        __T.save.assist = false;
      });
      await game.steps(120, { w: true });
      const a = await game.eval(() => __T.P.h);
      const b = await game.steps(45, { w: true, [k]: true });
      return Math.atan2(Math.sin(b.h - a), Math.cos(b.h - a));
    };
    const left = await turn("a");
    const right = await turn("d");
    expect(Math.abs(left), "heading change steering left").toBeGreaterThan(0.15);
    expect(Math.abs(right), "heading change steering right").toBeGreaterThan(0.15);
    expect(Math.sign(left)).toBe(-Math.sign(right));
  });

  test("the handbrake slows the car faster than lifting off", async ({ game }) => {
    const coast = async (held) => {
      await game.park();
      await game.eval(() => {
        __T.save.assist = false;
      });
      await game.steps(240, { w: true });
      return (await game.steps(60, held)).kph;
    };
    const lift = await coast({});
    const hand = await coast({ " ": true });
    expect(hand, "km/h one second after pulling the handbrake").toBeLessThan(lift - 10);
  });

  test("every visit to the sea puts the car back on the road after 0.6 s", async ({ game }) => {
    for (let visit = 1; visit <= 2; visit++) {
      const t = await game.eval(() => {
        const T = __T,
          P = T.P;
        P.x = 0;
        P.z = 1070;
        P.vx = P.vz = 0;
        let i = 0;
        for (; i < 600 && T.state === "DRIVE"; i++) T.driveUpdate(1 / 60);
        return { seconds: i / 60, state: T.state };
      });
      expect(t.state, `visit ${visit}`).toBe("FADE");
      expect(t.seconds, `visit ${visit}: seconds in the water`).toBeGreaterThan(0.55);
      expect(t.seconds, `visit ${visit}: seconds in the water`).toBeLessThan(0.75);
      await game.waitState("DRIVE");
      // the car's water flag is refreshed at the start of its next physics step, before anything reads it
      await game.steps(1, {});
      const after = await game.eval(() => {
        const nr = __T.nearestRoad(__T.P.x, __T.P.z, 10);
        return { water: __T.P.water, onRoad: !!nr && nr.d < 3, kph: Math.hypot(__T.P.vx, __T.P.vz) * 3.6 };
      });
      expect(after, `visit ${visit}`).toEqual({ water: false, onRoad: true, kph: expect.any(Number) });
      expect(after.kph).toBeLessThan(1);
    }
  });

  test("R puts the car back on the nearest road, facing along it", async ({ game }) => {
    await game.eval(() => {
      const P = __T.P;
      P.x += 40;
      P.z += 40;
    });
    await game.key("r");
    await game.waitState("FADE");
    await game.waitState("DRIVE");
    const r = await game.eval(() => {
      const T = __T,
        nr = T.nearestRoad(T.P.x, T.P.z, 10);
      return { d: nr ? nr.d : 99, along: nr ? Math.abs(Math.sin(T.P.h) * nr.dx + Math.cos(T.P.h) * nr.dz) : 0 };
    });
    expect(r.d).toBeLessThan(3);
    expect(r.along).toBeGreaterThan(0.9);
  });

  test("after map travel the car is on the road at the destination, stopped", async ({ game }) => {
    await game.eval(() => __T.openMap());
    await game.waitState("MAP");
    const E = await game.eval(() => {
      const T = __T,
        E = T.EVENTS[2];
      T.fastTravel({ act: "event", E });
      return { x: E.x, z: E.z };
    });
    await game.waitState("DRIVE");
    const r = await game.eval(() => {
      const T = __T,
        nr = T.nearestRoad(T.P.x, T.P.z, 10);
      return { x: T.P.x, z: T.P.z, d: nr ? nr.d : 99, kph: Math.hypot(T.P.vx, T.P.vz) * 3.6, air: T.P.air };
    });
    expect(Math.hypot(r.x - E.x, r.z - E.z), "metres from the event").toBeLessThan(80);
    expect(r.d).toBeLessThan(3);
    expect(r.kph).toBeLessThan(1);
    expect(r.air).toBeFalsy();
  });

  test("keys held while a menu is open don't move the car", async ({ game, page }) => {
    const where = () => game.eval(() => [__T.P.x, __T.P.z]);
    for (const [open, close, st] of [
      ["Escape", "Escape", "PAUSE"],
      ["m", "Escape", "MAP"],
    ]) {
      await game.key(open);
      await game.waitState(st);
      const a = await where();
      await page.keyboard.down("w");
      await page.keyboard.down("ArrowLeft");
      await game.frames(20);
      const b = await where();
      await page.keyboard.up("w");
      await page.keyboard.up("ArrowLeft");
      expect(Math.hypot(b[0] - a[0], b[1] - a[1]), `metres moved with ${st} open`).toBeLessThan(0.01);
      await game.key(close);
      await game.waitState("DRIVE");
    }
    // nothing is left held down afterwards
    expect(await game.eval(() => Object.entries(__T.keys).filter(([, v]) => v).map(([k]) => k))).toEqual([]);
  });

  test("a real key press drives the car through the browser's input", async ({ game, page }) => {
    const a = await game.eval(() => [__T.P.x, __T.P.z]);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(() => Math.hypot(__T.P.vx, __T.P.vz) * 3.6 > 15, null, { timeout: 60_000, polling: 100 });
    await page.keyboard.up("ArrowUp");
    const b = await game.eval(() => [__T.P.x, __T.P.z]);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThan(1);
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

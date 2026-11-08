// Controls: STEERING sensitivity, a game controller (simulated through the browser's Gamepad API) and tilt-to-steer
// on phones (simulated orientation events). A real controller and a real phone still need a check by hand.
const { test, expect } = require("./support/game");

// a fake standard-layout controller the test can press: window.__pad
const FAKE_PAD = () => {
  const pad = { id: "Test pad", index: 0, connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0], buttons: [] };
  for (let i = 0; i < 17; i++) pad.buttons.push({ pressed: false, touched: false, value: 0 });
  window.__pad = pad;
  window.__press = (i, v = 1) => {
    pad.buttons[i].value = v;
    pad.buttons[i].pressed = v > 0.5;
  };
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad, null, null, null] });
};

// a run at a steady 80 km/h on a straight, with a 0.3 s press of D, and the heading change 1 s later
const TAP = () => {
  const T = __T,
    P = T.P;
  T.save.assist = false;
  T.resetToRoad(false);
  const f = { x: Math.sin(P.h), z: Math.cos(P.h) };
  P.vx = f.x * 22.2;
  P.vz = f.z * 22.2;
  const h0 = P.h;
  T.keys.d = true;
  for (let i = 0; i < 18; i++) T.driveUpdate(1 / 60);
  T.keys.d = false;
  for (let i = 0; i < 42; i++) T.driveUpdate(1 / 60);
  return Math.abs(((P.h - h0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
};

test.describe("controls", () => {
  test("STEERING sensitivity: LOW turns in more slowly than NORMAL, HIGH faster; it's saved", async ({ game, page }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    const turn = {};
    for (const s of [0, 1, 2]) {
      await game.eval((s) => (__T.save.steer = s), s);
      await game.park();
      turn[s] = await game.eval(TAP);
    }
    test.info().annotations.push({ type: "heading change (rad) after a 0.3 s press at 80 km/h", description: JSON.stringify(turn) });
    expect(turn[0]).toBeLessThan(turn[1] * 0.9);
    expect(turn[2]).toBeGreaterThan(turn[1] * 1.1);
    await game.eval(() => (__T.save.steer = 1));
    await game.key("Escape");
    await game.waitState("PAUSE");
    await expect(page.locator("#pSteer")).toHaveText("STEERING: NORMAL");
    await page.locator("#pSteer").click();
    await expect(page.locator("#pSteer")).toHaveText("STEERING: HIGH");
    expect((await game.readSave()).steer).toBe(2);
    // on a computer there's no tilt switch
    await expect(page.locator("#pTilt")).toBeHidden();
  });

  test("a controller drives: triggers as gas and brake (part-way is gentler), the stick steers, buttons pause and open the map", async ({ game, page }) => {
    await page.addInitScript(FAKE_PAD);
    await game.open();
    await game.driveOut();
    await game.park();
    // real frames read the controller once each; the steps below run inside one evaluate, so they read it themselves
    await game.eval(() => (window.__poll = __T.pollPad));
    const full = await game.eval(() => {
      const T = __T,
        P = T.P;
      T.save.assist = false;
      T.resetToRoad(false);
      __press(7, 1);
      for (let i = 0; i < 180; i++) {
        __poll();
        T.driveUpdate(1 / 60);
      }
      __press(7, 0);
      return Math.hypot(P.vx, P.vz) * 3.6;
    });
    await game.park();
    const half = await game.eval(() => {
      const T = __T,
        P = T.P;
      T.resetToRoad(false);
      __press(7, 0.4);
      for (let i = 0; i < 180; i++) {
        __poll();
        T.driveUpdate(1 / 60);
      }
      __press(7, 0);
      return Math.hypot(P.vx, P.vz) * 3.6;
    });
    expect(full, "km/h after 3 s, trigger all the way").toBeGreaterThan(40);
    expect(half, "km/h after 3 s, trigger 40% of the way").toBeLessThan(full * 0.85);
    expect(half).toBeGreaterThan(5);
    // stick right at speed: the car turns right (heading decreases), half the stick turns it less
    const turn = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = {};
      for (const x of [1, 0.4]) {
        T.resetToRoad(false);
        const f = { x: Math.sin(P.h), z: Math.cos(P.h) };
        P.vx = f.x * 20;
        P.vz = f.z * 20;
        const h0 = P.h;
        __pad.axes[0] = x;
        for (let i = 0; i < 30; i++) {
          __poll();
          T.driveUpdate(1 / 60);
        }
        __pad.axes[0] = 0;
        out[x] = ((h0 - P.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      }
      return out;
    });
    expect(turn[1], "radians turned right, full stick").toBeGreaterThan(0.05);
    expect(turn[0.4]).toBeGreaterThan(0);
    expect(turn[0.4]).toBeLessThan(turn[1]);
    // the left trigger brakes
    const braked = await game.eval(() => {
      const T = __T,
        P = T.P;
      T.resetToRoad(false);
      const f = { x: Math.sin(P.h), z: Math.cos(P.h) };
      P.vx = f.x * 20;
      P.vz = f.z * 20;
      __press(6, 1);
      for (let i = 0; i < 30; i++) {
        __poll();
        T.driveUpdate(1 / 60);
      }
      __press(6, 0);
      return Math.hypot(P.vx, P.vz) * 3.6;
    });
    // (the brake builds up from 6 to 13 m/s² over a second, so half a second takes off about 13 km/h)
    expect(braked, "km/h after 0.5 s of full brake from 72").toBeLessThan(63);
    // Start pauses and resumes; View opens and closes the map; Y changes camera (real frames read the pad)
    const tap = async (i) => {
      await game.eval((i) => __press(i, 1), i);
      await game.frames(3);
      await game.eval((i) => __press(i, 0), i);
      await game.frames(3);
    };
    await tap(9);
    await game.waitState("PAUSE");
    // B closes a screen opened from the pause menu first, then the menu
    await page.locator("#pJobs").click();
    await expect(page.locator("#jobs")).toBeVisible();
    await tap(1);
    await expect(page.locator("#jobs")).toBeHidden();
    expect(await game.state()).toBe("PAUSE");
    await tap(9);
    await game.waitState("DRIVE");
    await tap(8);
    await game.waitState("MAP");
    await tap(1);
    await game.waitState("DRIVE");
    // in the dealership, A buys the car shown and X takes it for a test drive
    await game.eval(() => __T.openDealer());
    await game.waitState("DEALER");
    const buy = await game.eval(() => ({ cr: __T.save.cr, owned: __T.save.owned.length, id: __T.CARS[__T.dSel].id, price: __T.CARS[__T.dSel].price }));
    await tap(0);
    expect(await game.eval(() => ({ cr: __T.save.cr, owned: __T.save.owned.length }))).toEqual({ cr: buy.cr - buy.price, owned: buy.owned + 1 });
    await game.eval(() => __T.dPick(__T.CARS.findIndex((c) => !__T.save.owned.includes(c.id))));
    await tap(2);
    await game.waitState("DRIVE");
    expect(await game.eval(() => !!__T.testDrive)).toBe(true);
    await game.eval(() => __T.endTestDrive());
    await game.waitState("DEALER");
    await tap(1);
    await game.waitState("DRIVE");
    const cam0 = await game.eval(() => __T.camMode);
    await tap(3);
    expect(await game.eval(() => __T.camMode)).toBe((cam0 + 1) % 4);
  });
});

test.describe("controller throttle", () => {
  test("a light trigger never gives more throttle than it asks for, from a standstill or easing off", async ({ game, page }) => {
    await page.addInitScript(FAKE_PAD);
    await game.open();
    await game.driveOut();
    await game.park();
    const r = await game.eval(() => {
      const T = __T,
        P = T.P,
        out = {};
      T.save.assist = false;
      T.save.auto = false;
      for (const v of [0.2, 0.5]) {
        T.resetToRoad(false);
        P.vx = P.vz = 0;
        P.thr = 0;
        __press(7, v);
        let most = 0;
        for (let i = 0; i < 120; i++) {
          T.pollPad();
          T.driveUpdate(1 / 60);
          most = Math.max(most, P.thr);
        }
        out[v] = +most.toFixed(4);
      }
      // easing off while moving: down to the new amount, not below or above it
      __press(7, 0.3);
      for (let i = 0; i < 60; i++) {
        T.pollPad();
        T.driveUpdate(1 / 60);
      }
      out.eased = +P.thr.toFixed(4);
      __press(7, 0);
      T.pollPad();
      return out;
    });
    test.info().annotations.push({ type: "most throttle for a light trigger", description: JSON.stringify(r) });
    // it used to build to 87% for a 20% trigger in a second at a crawl
    expect(r[0.2]).toBeLessThanOrEqual(0.2);
    expect(r[0.2]).toBeGreaterThan(0.19);
    expect(r[0.5]).toBeLessThanOrEqual(0.5);
    expect(r.eased).toBeCloseTo(0.3, 3);
  });
});

test.describe("tilt steering", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("is off until switched on in the pause menu; then tilting the phone like a wheel steers, from where it was held", async ({ game, page }) => {
    // the player allows motion access when asked (phones that ask, such as iPhones, need a tap on the switch for it)
    await page.addInitScript(() => {
      if (window.DeviceOrientationEvent) DeviceOrientationEvent.requestPermission = () => Promise.resolve("granted");
    });
    await game.open();
    await game.driveOut();
    await game.park();
    const tilt = (beta, gamma) => game.eval(([b, g]) => window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: 0, beta: b, gamma: g })), [beta, gamma]);
    // held in landscape (screen turned 90 degrees), leaning back a little
    await game.eval(() => Object.defineProperty(screen.orientation, "angle", { configurable: true, get: () => 90 }));
    await tilt(10, -60);
    expect(await game.eval(() => __T.steerIn())).toBe(0);
    await game.key("Escape");
    await game.waitState("PAUSE");
    await expect(page.locator("#pTilt")).toHaveText("TILT STEERING: OFF");
    await page.locator("#pTilt").click();
    await expect(page.locator("#pTilt")).toHaveText("TILT STEERING: ON");
    await page.locator("#pRes").click();
    await game.waitState("DRIVE");
    // where it was held when resumed is straight ahead
    expect(await game.eval(() => __T.steerIn())).toBe(0);
    // turned like a wheel to the right (clockwise, about 15 degrees), then to the left
    const turned = async (b, g) => {
      await tilt(b, g);
      return game.eval(() => __T.steerIn());
    };
    const right = await turned(25, -57),
      left = await turned(-5, -59);
    test.info().annotations.push({ type: "steering from tilt", description: JSON.stringify({ right, left }) });
    expect(right).toBeGreaterThan(0.3);
    expect(left).toBeLessThan(-0.2);
    // the on-screen pads still win
    await game.eval(() => (__T.pad.L = true));
    expect(await game.eval(() => __T.steerIn())).toBe(-1);
    await game.eval(() => (__T.pad.L = false));
    expect((await game.readSave()).tilt).toBe(true);
  });
});

test.describe("controller in menus", () => {
  test("controller B over the map: closes the Island Passport first, then the map", async ({ game, page }) => {
    await page.addInitScript(FAKE_PAD);
    await game.open();
    await game.driveOut();
    await game.park();
    const tap = async (i) => {
      await game.eval((i) => __press(i, 1), i);
      await game.frames(3);
      await game.eval((i) => __press(i, 0), i);
      await game.frames(3);
    };
    await game.eval(() => __T.openMap());
    await game.waitState("MAP");
    await game.eval(() => __T.passportOpen());
    await expect(page.locator("#passport")).toBeVisible();
    await tap(1);
    // it used to close the map and drive on behind the Passport
    await expect(page.locator("#passport")).toBeHidden();
    expect(await game.eval(() => __T.state)).toBe("MAP");
    await tap(1);
    await game.waitState("DRIVE");
  });

  test("controller in the garage: the right stick turns the view and stops SPIN; while customising the D-pad doesn't switch cars, B cancels", async ({ game, page }) => {
    await page.addInitScript(FAKE_PAD);
    await game.open();
    await game.waitState("GARAGE");
    const tap = async (i) => {
      await game.eval((i) => __press(i, 1), i);
      await game.frames(3);
      await game.eval((i) => __press(i, 0), i);
      await game.frames(3);
    };
    await page.locator("#gCust").click();
    await page.locator("#cuSpin").click();
    const y0 = await game.eval(() => __T.GO.yaw);
    await game.eval(() => (__pad.axes[2] = 0.8));
    await game.frames(20);
    await game.eval(() => (__pad.axes[2] = 0));
    const r = await game.eval(() => ({ yaw: __T.GO.yaw, spin: __T.GO.spin, aria: document.getElementById("cuSpin").getAttribute("aria-pressed") }));
    expect(Math.abs(r.yaw - y0), "radians turned by the stick").toBeGreaterThan(0.3);
    expect(r).toMatchObject({ spin: false, aria: "false" });
    const sel = await game.eval(() => __T.gSel);
    await tap(15);
    expect(await game.eval(() => __T.gSel), "D-pad right while customising").toBe(sel);
    await expect(page.locator("#cust")).toBeVisible();
    await tap(1);
    await expect(page.locator("#cust")).toBeHidden();
    expect(await game.eval(() => __T.state)).toBe("GARAGE");
    // the stick turns the view by time, not by frame: one second at 30 fps and at 120 fps turns it the same
    // (it used to turn four times as far at 120)
    const turn = await game.eval(() => {
      const T = __T,
        out = [];
      for (const fps of [30, 120]) {
        T.GO.yaw = T.GO.yawS = 0;
        T.GO.pitch = 0;
        __pad.axes[2] = 1;
        for (let i = 0; i < fps; i++) {
          T.pollPad();
          T.garageCam(1 / fps);
        }
        __pad.axes[2] = 0;
        T.pollPad();
        out.push(-T.GO.yaw);
      }
      return out;
    });
    expect(turn[0], "radians in 1 s at 30 fps").toBeGreaterThan(2);
    expect(Math.abs(turn[1] - turn[0]), "difference between 30 and 120 fps").toBeLessThan(0.01);
    // A applies with the plate field still being typed in: the typed plate is what's saved (it used to be lost)
    await page.locator("#gCust").click();
    await page.locator("#cuPlate").fill("PAD 77");
    await expect(page.locator("#cuPlate")).toBeFocused();
    await tap(0);
    await expect(page.locator("#cust")).toBeHidden();
    expect(await game.eval(() => __T.save.mods[__T.save.owned[__T.gSel]].plate)).toBe("PAD 77");
  });
});

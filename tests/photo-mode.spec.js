// Photo Mode: where it opens, the world standing still (car, traffic and scenery) and carrying on without a jump,
// the camera and looks, a real PNG of the 3D view only, everything restored on exit, turning a phone, and no
// leftovers after many visits.
const { test, expect } = require("./support/game");
const { installProbes } = require("./support/probes");

// everything that moves on its own: car, traffic, boats and their bobbing, sea, foam, grass, fish, clouds, the clock
const WORLD = () => {
  const T = __T,
    r = (v, d = 4) => +v.toFixed(d);
  return {
    car: [r(T.P.x), r(T.P.z), r(T.P.h)],
    traffic: T.TRAFFIC.map((t) => [r(t.wx, 3), r(t.wz, 3)]),
    boats: T.BOATS.filter((b) => b.move).map((b) => [r(b.x), r(b.z)]),
    bob: T.BOATS.map((b) => r(b.m.position.y, 5)),
    sea: r(T.seaT, 5),
    foam: T.foam ? r(T.foam.material.map.offset.x, 6) : null,
    grass: r(T.grassT.value, 5),
    fish: r(T.fishT, 5),
    clouds: r(T.skyU.cT.value, 4),
    clock: r(T.save.tod, 5),
  };
};

async function driving(game, opts) {
  await game.open(opts);
  await game.driveOut();
  await game.park();
}

test.describe("photo mode", () => {
  test("opens from free ride (V), the PHOTO chip and the pause menu, and goes back where it came from", async ({ game, page }) => {
    await driving(game);
    await game.key("v");
    await game.waitState("PHOTO");
    await expect(page.locator("#photo")).toBeVisible();
    await expect(page.locator("#hud")).toBeHidden();
    await game.key("Escape");
    await game.waitState("DRIVE");
    await expect(page.locator("#hud")).toBeVisible();
    await page.locator("#chPhoto").click();
    await game.waitState("PHOTO");
    await game.key("v");
    await game.waitState("DRIVE");
    await game.key("Escape");
    await game.waitState("PAUSE");
    await page.locator("#pPhoto").click();
    await game.waitState("PHOTO");
    await game.key("Escape");
    await game.waitState("PAUSE");
    await expect(page.locator("#pause")).toBeVisible();
  });

  test("shortcuts still work with a slider focused; leaving to the pause menu keeps the rear lights' colour", async ({ game, page }) => {
    await driving(game);
    // after dragging ZOOM the slider has focus: Escape still leaves (it used to be swallowed, like V, R and Enter)
    await game.key("v");
    await game.waitState("PHOTO");
    await page.locator("#phZoom").focus();
    // its arrow keys move the slider, not the camera (they used to be taken for camera keys)
    const z0 = +(await page.locator("#phZoom").inputValue());
    await page.keyboard.press("ArrowRight");
    await game.frames(5);
    expect(+(await page.locator("#phZoom").inputValue()), "ZOOM after ArrowRight").toBe(z0 + 1);
    expect(await game.eval(() => __T.keys.arrowright || false)).toBe(false);
    await expect(page.locator("#phZoom")).toBeFocused();
    await game.key("Escape");
    await game.waitState("DRIVE");
    // at night, from the pause menu into photo mode and back, three times: the rear lights stay the same colour
    // (each trip used to darken them: the colour was saved as hex and converted from sRGB again when put back)
    await game.eval(() => {
      __T.save.tod = 23;
      __T.applyDayNight && __T.applyDayNight();
    });
    await game.frames(3);
    await game.key("Escape");
    await game.waitState("PAUSE");
    const col = () => game.eval(() => __T.pc.tailM.color.toArray().map((v) => +v.toFixed(5)));
    const before = await col();
    for (let i = 0; i < 3; i++) {
      await page.locator("#pPhoto").click();
      await game.waitState("PHOTO");
      await game.key("Escape");
      await game.waitState("PAUSE");
    }
    expect(await col()).toEqual(before);
  });

  test("doesn't open over the map, a screen fade, the garage or the dealership", async ({ game }) => {
    await driving(game);
    const tries = await game.eval(async () => {
      const T = __T,
        out = {};
      T.openMap();
      out.map = [T.photoEnter(), T.state];
      T.closeMap();
      T.fadeThen(400, () => {});
      out.fade = [T.photoEnter(), T.state];
      return out;
    });
    expect(tries.map).toEqual([false, "MAP"]);
    expect(tries.fade).toEqual([false, "FADE"]);
    await game.waitState("DRIVE");
    await game.eval(() => __T.openDealer());
    await game.waitState("DEALER");
    expect(await game.eval(() => [__T.photoEnter(), __T.state])).toEqual([false, "DEALER"]);
  });

  test("the whole world stands still while it's open, for 60 frames, and carries on without a jump", async ({ game }) => {
    await driving(game);
    // moving traffic and a moving car make the test meaningful
    await game.steps(120, { w: true });
    await game.eval(() => {
      __T.keys.w = true;
    });
    await game.frames(5);
    await game.eval(() => {
      __T.keys.w = false;
    });
    const a = await game.eval(() => {
      __T.photoEnter();
      return null;
    });
    expect(a).toBeNull();
    const w0 = await game.eval(WORLD);
    await game.frames(60);
    const w1 = await game.eval(WORLD);
    expect(w1).toEqual(w0);
    // and after leaving, things move again from where they stopped (one frame is at most 0.05 s of game time)
    await game.eval(() => __T.photoExit());
    await game.frames(1);
    const w2 = await game.eval(WORLD);
    expect(w2.sea).toBeGreaterThan(w1.sea);
    expect(w2.sea - w1.sea).toBeLessThanOrEqual(0.05 * 3 + 1e-6);
    expect(w2.fish - w1.fish).toBeLessThanOrEqual(0.05 * 3 + 1e-6);
    await game.frames(30);
    const w3 = await game.eval(WORLD);
    expect(w3.boats).not.toEqual(w1.boats);
    expect(w3.clouds).not.toEqual(w1.clouds);
  });

  test("the camera orbits with a drag and the keys, zooms, resets, and the looks relight only the photo", async ({ game, page }) => {
    await driving(game);
    // a fixed hour, so only the looks change the light
    await game.eval(() => {
      __T.save.todMode = 2;
      __T.save.tod = 13;
    });
    await game.key("v");
    await game.waitState("PHOTO");
    const cam = () => game.eval(() => ({ p: __T.camera.position.toArray().map((v) => +v.toFixed(3)), fov: +__T.camera.fov.toFixed(3) }));
    const c0 = await cam();
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.mouse.move(760, 330, { steps: 8 });
    await page.mouse.up();
    await game.frames(3);
    const c1 = await cam();
    expect(c1.p).not.toEqual(c0.p);
    await page.keyboard.down("ArrowLeft");
    await game.frames(10);
    await page.keyboard.up("ArrowLeft");
    const c2 = await cam();
    expect(c2.p).not.toEqual(c1.p);
    const d0 = await game.eval(() => __T.PH.dist);
    await page.mouse.wheel(0, -600);
    await game.frames(2);
    expect(await game.eval(() => __T.PH.dist)).toBeLessThan(d0);
    await game.key("r");
    await game.frames(2);
    expect(await game.eval(() => ({ pitch: __T.PH.pitch, fov: __T.PH.fov }))).toEqual({ pitch: 0.22, fov: 50 });
    // looks: each lights the scene differently, without moving the clock
    const light = () =>
      game.eval(() => {
        let s = 0;
        __T.scene.traverse((o) => {
          if (o.isLight) s += o.intensity * (o.color.r + o.color.g * 2 + o.color.b);
        });
        return { s: +s.toFixed(4), tod: __T.save.tod };
      });
    const looks = [];
    for (const k of ["1", "2", "3", "4"]) {
      await game.key(k);
      await game.frames(1);
      looks.push(await light());
    }
    expect(new Set(looks.map((l) => l.s)).size).toBe(4);
    expect(new Set(looks.map((l) => l.tod)).size).toBe(1);
    await game.key("Escape");
    await game.waitState("DRIVE");
    await game.frames(1);
    // back to the real light of the hour (street lamps near the car may differ a touch), far from any look
    const back = (await light()).s;
    expect(Math.abs(back - looks[0].s) / looks[0].s, "relative difference from AS IS").toBeLessThan(0.01);
    for (const l of looks.slice(1)) expect(Math.abs(back - l.s) / l.s, "relative difference from a look").toBeGreaterThan(0.02);
  });

  test("leaving restores the camera, lens, HUD, speed and heading, and the drive carries on as if it never opened", async ({ game }) => {
    await driving(game);
    await game.steps(180, { w: true });
    // the same 3 s of driving twice from the same moment, the second time with a photo stop half way; all inside
    // one evaluate, with traffic moved out of the way, so nothing else differs between the two runs
    const r = await game.eval(() => {
      const T = __T,
        P = T.P;
      for (const t of T.TRAFFIC) {
        t.e = null;
        t.wx = 1e6;
        t.wz = 1e6;
      }
      const copy = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v === null || typeof v !== "object"));
      const p0 = copy(P),
        nr0 = P.nr,
        cam0 = [T.camera.position.clone(), T.camera.quaternion.clone(), T.camera.fov];
      const camNow = () => JSON.stringify([T.camera.position.toArray(), T.camera.quaternion.toArray(), T.camera.fov, T.camera.zoom]);
      const drive = (photoAt) => {
        Object.assign(P, p0);
        P.nr = nr0;
        T.camera.position.copy(cam0[0]);
        T.camera.quaternion.copy(cam0[1]);
        T.camera.fov = cam0[2];
        T.camera.updateProjectionMatrix();
        let restored = null;
        for (let i = 0; i < 180; i++) {
          T.keys.w = true;
          T.driveUpdate(1 / 60);
          if (i === photoAt) {
            const before = camNow(),
              kph = Math.hypot(P.vx, P.vz),
              h = P.h;
            T.photoEnter();
            T.PH.yaw += 1.3;
            T.PH.dist = 12;
            T.PH.fov = 30;
            T.photoFrame(1 / 60);
            const moved = camNow() !== before;
            T.photoExit();
            restored = { moved, same: camNow() === before, hud: !document.getElementById("hud").classList.contains("hide"), state: T.state, kph: Math.hypot(P.vx, P.vz) === kph, h: P.h === h };
          }
        }
        T.keys.w = false;
        return { end: [P.x, P.z, P.h, P.vx, P.vz], restored };
      };
      const a = drive(-1),
        b = drive(90);
      return { a: a.end, b: b.end, restored: b.restored };
    });
    expect(r.restored).toEqual({ moved: true, same: true, hud: true, state: "DRIVE", kph: true, h: true });
    expect(r.b).toEqual(r.a);
  });

  test("turning a phone while photo mode is open: the view fits the new shape on the way out", async ({ game, page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await driving(game);
    await game.key("v");
    await game.waitState("PHOTO");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => game.eval(() => +__T.camera.aspect.toFixed(4)), { timeout: 30_000 }).toBe(+(390 / 844).toFixed(4));
    await game.key("Escape");
    await game.waitState("DRIVE");
    expect(await game.eval(() => __T.camera.zoom)).toBeCloseTo(Math.sqrt(390 / 844), 4);
    await game.key("v");
    await game.waitState("PHOTO");
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => game.eval(() => +__T.camera.aspect.toFixed(4)), { timeout: 30_000 }).toBe(+(844 / 390).toFixed(4));
    await game.key("Escape");
    await game.waitState("DRIVE");
    expect(await game.eval(() => __T.camera.zoom)).toBe(1);
  });

  test("25 visits leave no listeners, timers, page elements or pictures behind", async ({ game, page }) => {
    await page.addInitScript(installProbes);
    await driving(game);
    const count = () =>
      game.eval(() => ({ listeners: __probe.listeners(), timers: __probe.timers(), // on-screen messages come and go on their own (the FREE RIDE one may still be up at the first count), so
      // they're left out, as in the stability tests
      nodes: document.getElementsByTagName("*").length - document.querySelectorAll("#toasts *").length, blobs: !!__T.PH.shot }));
    const once = async () => {
      await game.key("v");
      await game.waitState("PHOTO");
      await game.key("Escape");
      await game.waitState("DRIVE");
    };
    await once();
    await game.frames(10);
    const a = await count();
    for (let i = 0; i < 25; i++) await once();
    await game.frames(10);
    const b = await count();
    // (the first key press of a session also removes the game's one-time "first gesture" listeners)
    expect(b.listeners).toBeLessThanOrEqual(a.listeners);
    expect(b.nodes).toBe(a.nodes);
    expect(b.timers).toBeLessThanOrEqual(a.timers + 2);
    expect(b.blobs).toBe(false);
  });
});

test.describe("photo mode capture (real WebGL rendering)", () => {
  test("captures a non-blank PNG the size of the 3D view, with nothing from the page on top @webgl", async ({ game, page }) => {
    await driving(game, { render: true });
    await game.key("v");
    await game.waitState("PHOTO");
    // a bright magenta layer over the whole page: if the picture took anything from the page, it would show
    await game.eval(() => {
      const d = document.createElement("div");
      d.id = "__overlay";
      d.style.cssText = "position:fixed;inset:0;background:#ff00ff;z-index:99999;pointer-events:none";
      document.body.appendChild(d);
    });
    const ok = await game.eval(() => __T.photoCapture());
    expect(ok).toBe(true);
    const stats = await game.eval(async () => {
      const blob = __T.PH.shot.blob,
        bmp = await createImageBitmap(blob),
        c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const x = c.getContext("2d");
      x.drawImage(bmp, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0,
        sum = 0,
        sum2 = 0,
        magenta = 0;
      for (let i = 0; i < d.length; i += 4 * 97) {
        const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
        sum += l;
        sum2 += l * l;
        n++;
        if (d[i] > 240 && d[i + 1] < 20 && d[i + 2] > 240) magenta++;
      }
      const src = __T.renderer.domElement;
      return { type: blob.type, w: bmp.width, h: bmp.height, cw: src.width, ch: src.height, mean: sum / n, sd: Math.sqrt(sum2 / n - (sum / n) ** 2), magenta, bytes: blob.size };
    });
    await game.eval(() => document.getElementById("__overlay").remove());
    expect(stats.type).toBe("image/png");
    expect([stats.w, stats.h]).toEqual([stats.cw, stats.ch]);
    expect(stats.sd, "brightness variation (a blank frame has none)").toBeGreaterThan(8);
    expect(stats.mean).toBeGreaterThan(10);
    expect(stats.magenta).toBe(0);
    await expect(page.locator("#phShot")).toBeVisible();
    test.info().annotations.push({ type: "capture", description: `${stats.w}x${stats.h}, ${Math.round(stats.bytes / 1024)} KB` });
  });
});

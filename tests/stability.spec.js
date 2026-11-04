// Stability: many trips through the menus and screens leave nothing behind, a long gap between frames doesn't
// make the car jump, a hidden tab pauses the game and its sound, sound comes back after the browser suspends it,
// a long drive doesn't grow memory, and resizing keeps the view consistent.
const { test, expect } = require("./support/game");
const { installProbes } = require("./support/probes");

// free-roam autopilot: keeps to the road ahead, about 70 km/h, for n steps
const ROAM = (n) => {const T=__T,P=T.P;let off=0;
  for(let i=0;i<n;i++){const nr=P.nr;let tx=P.x+Math.sin(P.h)*10,tz=P.z+Math.cos(P.h)*10;
    if(nr){const al=Math.sin(P.h)*nr.dx+Math.cos(P.h)*nr.dz,dir=al>=0?1:-1,ux=nr.dx*dir,uz=nr.dz*dir,look=12+Math.hypot(P.vx,P.vz)*.6;
      tx=nr.x-uz*1.9+ux*look;tz=nr.z+ux*1.9+uz*look}
    const err=((Math.atan2(tx-P.x,tz-P.z)-P.h+Math.PI*3)%(Math.PI*2))-Math.PI,sp=Math.hypot(P.vx,P.vz);
    T.keys.a=err>.03;T.keys.d=err<-.03;T.keys.w=sp<19;T.keys.s=sp>23;T.driveUpdate(1/60);if(!P.onRoad)off++;
    if(T.state!=="DRIVE")break}
  T.keys.a=T.keys.d=T.keys.w=T.keys.s=false;return {off}};

async function heap(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const h = await cdp.send("Runtime.getHeapUsage");
  await cdp.detach();
  return h.usedSize;
}

const counts = (game) =>
  game.eval(() => ({
    listeners: __probe.listeners(),
    timers: __probe.timers(),
    // on-screen messages come and go on their own, so they're left out
    nodes: document.getElementsByTagName("*").length - document.querySelectorAll("#toasts *").length,
    // objects in the 3D scene; the GPU's own counts (renderer.info) only move when the scene is drawn, which the
    // @webgl version of this test does
    objects: (() => {
      let n = 0;
      __T.scene.traverse(() => n++);
      return n;
    })(),
    geometries: __T.renderer.info.memory.geometries,
    textures: __T.renderer.info.memory.textures,
  }));

test.describe("stability", () => {
  test("many trips through menus and screens leave no listeners, timers, elements or GPU objects behind", async ({ game, page }) => {
    test.setTimeout(600_000);
    await page.addInitScript(installProbes);
    await game.open();
    await game.driveOut();
    await game.park();
    const round = async () => {
      await game.key("Escape");
      await game.waitState("PAUSE");
      await page.locator("#pPass").click();
      await page.locator("#pzClose").click();
      await page.locator("#pJobs").click();
      await page.locator("#jbClose").click();
      await game.key("Escape");
      await game.waitState("DRIVE");
      await game.key("m");
      await game.waitState("MAP");
      await game.key("Escape");
      await game.waitState("DRIVE");
      await game.key("v");
      await game.waitState("PHOTO");
      await game.key("Escape");
      await game.waitState("DRIVE");
      await game.key("c");
      await game.eval(() => __T.openDealer());
      await game.waitState("DEALER");
      await page.locator("#dExit").click();
      await game.waitState("DRIVE");
      await game.park();
    };
    await round();
    await game.eval(() => __T.goGarage(false));
    await game.waitState("GARAGE", 30_000);
    await game.driveOut();
    await game.park();
    await game.frames(5);
    await page.waitForTimeout(3500); // messages from the first round leave
    const a = await counts(game);
    for (let i = 0; i < 6; i++) await round();
    for (let i = 0; i < 2; i++) {
      await game.eval(() => __T.goGarage(false));
      await game.waitState("GARAGE", 30_000);
      await game.driveOut();
      await game.park();
    }
    await game.frames(5);
    await page.waitForTimeout(3500);
    const b = await counts(game);
    expect(b.listeners, "event listeners").toBe(a.listeners);
    expect(b.nodes, "page elements").toBe(a.nodes);
    expect(b.timers, "pending timers").toBeLessThanOrEqual(a.timers + 2);
    expect(b.objects, "objects in the 3D scene").toBeLessThanOrEqual(a.objects);
    expect(b.geometries, "GPU geometries").toBeLessThanOrEqual(a.geometries);
    expect(b.textures, "GPU textures").toBeLessThanOrEqual(a.textures);
    test.info().annotations.push({ type: "after 6 rounds + 2 garage trips", description: JSON.stringify({ before: a, after: b }) });
  });

  test("drawn screen changes don't pile up GPU geometries or textures @webgl", async ({ game, page }) => {
    test.setTimeout(900_000);
    // a small window, so the software GPU keeps up
    await page.setViewportSize({ width: 480, height: 270 });
    await game.open({ render: true });
    await game.driveOut();
    await game.park();
    // traffic out of the way: a traffic car seen for the first time partway through adds its geometries once
    // (about 11), which a starting count taken before it came into view would mistake for a leak
    await game.eval(() => {
      for (const t of __T.TRAFFIC) {
        t.e = null;
        t.c.G.visible = false;
        t.wx = 1e6;
        t.wz = 1e6;
      }
    });
    const gpu = () => game.eval(() => ({ ...__T.renderer.info.memory }));
    const round = async () => {
      for (const [k, st] of [
        ["m", "MAP"],
        ["v", "PHOTO"],
      ]) {
        await game.key(k);
        await game.waitState(st);
        await game.frames(2);
        await game.key("Escape");
        await game.waitState("DRIVE");
        await game.frames(2);
      }
      await game.eval(() => __T.openDealer());
      await game.waitState("DEALER");
      await game.frames(2);
      await page.locator("#dExit").click();
      await game.waitState("DRIVE");
      await game.park();
      await game.frames(2);
    };
    await round();
    const a = await gpu();
    for (let i = 0; i < 3; i++) await round();
    const b = await gpu();
    test.info().annotations.push({ type: "GPU objects before and after 3 drawn rounds", description: JSON.stringify({ before: a, after: b }) });
    expect(b.geometries, "GPU geometries").toBeLessThanOrEqual(a.geometries);
    expect(b.textures, "GPU textures").toBeLessThanOrEqual(a.textures);
  });

  test("a long gap between frames (a stalled or backgrounded tab) doesn't make the car jump", async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    await game.eval(() => {
      __T.keys.w = true;
    });
    await game.page.waitForFunction(() => Math.hypot(__T.P.vx, __T.P.vz) * 3.6 > 40, null, { timeout: 120_000, polling: 100 });
    const r = await game.eval(
      () =>
        new Promise((res) => {
          const P = __T.P,
            t = performance.now();
          while (performance.now() - t < 2500) {} // the main thread stalls for 2.5 s
          const p0 = [P.x, P.z],
            v = Math.hypot(P.vx, P.vz);
          // the game asked for its next frame before ours, so this runs right after the game's next frame
          requestAnimationFrame(() => {
            __T.keys.w = false;
            res({ moved: Math.hypot(P.x - p0[0], P.z - p0[1]), v });
          });
        })
    );
    expect(r.moved, "metres moved in the frame after a 2.5 s gap").toBeLessThanOrEqual(r.v * 0.05 * 1.25 + 0.05);
  });

  test("a hidden tab pauses the game, lets go of held keys and suspends sound; showing it brings sound back", async ({ game, page }) => {
    // Playwright can't send a headless tab to the background, so the page is told it is hidden the way the
    // browser would: document.hidden becomes true and a visibilitychange event fires
    await game.open();
    await game.driveOut();
    await game.park();
    await page.mouse.click(640, 200); // a first gesture starts the game's audio
    await expect.poll(() => game.eval(() => __T.AC && __T.AC.state), { timeout: 30_000 }).toBe("running");
    await page.keyboard.down("w");
    const setHidden = (h) =>
      game.eval((h) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
        document.dispatchEvent(new Event("visibilitychange"));
      }, h);
    await setHidden(true);
    expect(await game.eval(() => ({ state: __T.state, w: !!__T.keys.w }))).toEqual({ state: "PAUSE", w: false });
    await expect.poll(() => game.eval(() => __T.AC.state)).toBe("suspended");
    await page.keyboard.up("w");
    await setHidden(false);
    await expect.poll(() => game.eval(() => __T.AC.state), { timeout: 15_000 }).toBe("running");
    expect(await game.state(), "still paused until the player resumes").toBe("PAUSE");
  });

  test("sound comes back with the next tap or key after the browser suspends it", async ({ game, page }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    await page.mouse.click(640, 200);
    await expect.poll(() => game.eval(() => __T.AC && __T.AC.state), { timeout: 30_000 }).toBe("running");
    for (const how of ["key", "tap"]) {
      await game.eval(() => __T.AC.suspend());
      await expect.poll(() => game.eval(() => __T.AC.state)).toBe("suspended");
      if (how === "key") await page.keyboard.press("Shift");
      else await page.mouse.click(640, 200);
      await expect.poll(() => game.eval(() => __T.AC.state), { timeout: 15_000, message: how }).toBe("running");
    }
  });

  test("ten minutes of driving with traffic doesn't grow memory or the scene", async ({ game, page }) => {
    test.setTimeout(900_000);
    await game.open();
    await game.driveOut();
    await game.park();
    const sample = async () => ({
      heap: await heap(page),
      objects: await game.eval(() => {
        let n = 0;
        __T.scene.traverse(() => n++);
        return n;
      }),
    });
    await game.eval(ROAM, 3600);
    const a = await sample();
    const series = [a];
    for (let i = 0; i < 9; i++) {
      await game.eval(ROAM, 3600); // one minute of game time
      series.push(await sample());
    }
    const b = series[series.length - 1];
    test.info().annotations.push({ type: "heap MB per minute", description: series.map((s) => (s.heap / 1048576).toFixed(1)).join(", ") });
    expect(b.heap - a.heap, "bytes of JavaScript heap grown over 9 minutes, after garbage collection").toBeLessThan(8 * 1048576);
    expect(b.objects, "objects in the 3D scene").toBeLessThanOrEqual(a.objects);
  });

  test("resizing the window keeps the camera, drawing size and HUD consistent", async ({ game, page }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    for (const [w, h] of [
      [800, 600],
      [1920, 1080],
      [1000, 1000],
      [1280, 720],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await expect.poll(() => game.eval(() => +__T.camera.aspect.toFixed(4)), { timeout: 30_000 }).toBe(+(w / h).toFixed(4));
      const r = await game.eval(() => {
        const c = __T.renderer.domElement,
          inView = ["speedo", "mini"].every((id) => {
            const b = document.getElementById(id).getBoundingClientRect();
            return b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight;
          });
        return { css: [c.clientWidth, c.clientHeight], zoom: __T.camera.zoom, inView };
      });
      expect(r).toEqual({ css: [w, h], zoom: 1, inView: true });
    }
  });
});

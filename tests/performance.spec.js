// Performance measurements. A software GPU on a shared machine says little about frame rates on players'
// devices, so these tests record numbers (as annotations in the report) and fail only on gross regressions:
// the per-frame JavaScript cost, how much the scene asks of the GPU, load time, memory and photo capture cost.
const { test, expect } = require("./support/game");

// times every animation-frame callback (the game's frame function is one) and keeps the last 2000
const FRAME_TIMER = () => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__frameMs = [];
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const s = performance.now();
      cb(t);
      const d = performance.now() - s;
      if (window.__frameMs.push(d) > 2000) window.__frameMs.shift();
    });
};

const stats = (a) => {
  const s = [...a].sort((x, y) => x - y),
    q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, avg: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2) };
};

const note = (type, v) => test.info().annotations.push({ type, description: typeof v === "string" ? v : JSON.stringify(v) });

test.describe("performance", () => {
  test("load time: from opening the page to the START button and to the garage @webgl", async ({ game, page }) => {
    const t0 = Date.now();
    await game.open({ instrument: false, autostart: false });
    await expect(page.locator("#lstart")).toBeVisible({ timeout: 180_000 });
    const tStart = Date.now() - t0;
    await page.locator("#lstart").click();
    await expect(page.locator("#gui")).toBeVisible({ timeout: 15_000 });
    const tGarage = Date.now() - t0;
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), bytes: n.transferSize };
    });
    note("load (ms)", { ...nav, startButton: tStart, garage: tGarage });
    expect(tStart, "ms to the START button on a software GPU").toBeLessThan(120_000);
  });

  test("JavaScript cost per frame while driving with traffic (without drawing)", async ({ game, page }) => {
    await page.addInitScript(FRAME_TIMER);
    await game.open();
    await game.driveOut();
    await game.park();
    // the simulation step alone (physics, traffic, HUD, GPS)
    const sim = await game.eval(() => {
      const T = __T,
        d = [];
      T.keys.w = true;
      for (let i = 0; i < 1200; i++) {
        const s = performance.now();
        T.driveUpdate(1 / 60);
        d.push(performance.now() - s);
      }
      T.keys.w = false;
      return d;
    });
    const step = stats(sim);
    // whole frames without drawing: the game's own frame function as the browser runs it
    await game.eval(() => {
      window.__frameMs.length = 0;
    });
    await game.frames(120);
    const noDraw = stats(await game.eval(() => window.__frameMs));
    note("simulation step (ms)", step);
    note("frame without drawing (ms)", noDraw);
    expect(step.avg, "average ms per simulation step").toBeLessThan(4);
    expect(noDraw.p50, "median ms per frame without drawing").toBeLessThan(12);
  });

  test("what the scene asks of the GPU (draw calls, triangles) and frame cost with drawing @webgl", async ({ game, page }) => {
    await page.addInitScript(FRAME_TIMER);
    await game.open({ render: true });
    const info = () => game.eval(() => ({ calls: __T.renderer.info.render.calls, triangles: __T.renderer.info.render.triangles, pixelRatio: __T.renderer.getPixelRatio() }));
    await game.frames(3);
    const out = { garage: await info() };
    await game.driveOut();
    await game.park();
    for (const [name, mode, tod] of [
      ["noon", 2, 13],
      ["night", 4, 22.5],
    ]) {
      await game.eval(([m, t]) => {
        __T.save.todMode = m;
        __T.save.tod = t;
      }, [mode, tod]);
      await game.frames(3);
      out[name] = await info();
    }
    await game.eval(() => {
      window.__frameMs.length = 0;
    });
    await game.frames(20);
    // on a software GPU this is the CPU doing the GPU's work, so it's far slower than on any real device
    out.frameMsSoftwareGpu = stats(await game.eval(() => window.__frameMs));
    note("renderer per frame", out);
    expect(out.noon.calls).toBeLessThan(600);
  });

  test("memory after loading, and photo capture time and size @webgl", async ({ game, page }) => {
    await game.open({ render: true });
    await game.driveOut();
    await game.park();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("HeapProfiler.collectGarbage");
    const h = await cdp.send("Runtime.getHeapUsage");
    const gpu = await game.eval(() => __T.renderer.info.memory);
    // garbage made per simulation step (no collection runs in so short a loop)
    const alloc = await game.eval(() => {
      const T = __T;
      T.keys.w = true;
      for (let i = 0; i < 60; i++) T.driveUpdate(1 / 60);
      return null;
    });
    const before = (await cdp.send("Runtime.getHeapUsage")).usedSize;
    await game.eval(() => {
      const T = __T;
      for (let i = 0; i < 300; i++) T.driveUpdate(1 / 60);
      T.keys.w = false;
    });
    const after = (await cdp.send("Runtime.getHeapUsage")).usedSize;
    await game.key("v");
    await game.waitState("PHOTO");
    const cap = await game.eval(async () => {
      const t = performance.now(),
        ok = await __T.photoCapture();
      return { ok, ms: Math.round(performance.now() - t), kb: Math.round(__T.PH.shot.blob.size / 1024), w: __T.renderer.domElement.width, h: __T.renderer.domElement.height };
    });
    note("JS heap after load, after garbage collection (MB)", (h.usedSize / 1048576).toFixed(1));
    note("GPU objects", gpu);
    note("heap growth per simulation step before collection (KB)", after > before ? ((after - before) / 300 / 1024).toFixed(2) : "under the measurement noise");
    note("photo capture", cap);
    expect(alloc).toBeNull();
    expect(cap.ok).toBe(true);
    expect(h.usedSize, "bytes of JavaScript heap after loading").toBeLessThan(400 * 1048576);
  });
  // Adding a light to the scene makes the graphics card rebuild the program of every lit surface on the next frame.
  // The car's headlight used to be created on the first press of DRIVE, which froze that frame
  test("pressing DRIVE adds no lights to the scene", async ({ game }) => {
    await game.open();
    const lights = () =>
      game.eval(() => {
        const n = {};
        __T.scene.traverse((o) => { if (o.isLight) n[o.type] = (n[o.type] || 0) + 1; });
        return n;
      });
    const before = await lights();
    expect(before.SpotLight, "the headlight exists before the first drive").toBeGreaterThanOrEqual(2);
    await game.driveOut();
    expect(await lights()).toEqual(before);
  });

  test("leaving the garage builds no new programs and uploads no new pictures @webgl", async ({ game }) => {
    test.setTimeout(600000);
    await game.open({ render: true });
    await game.frames(4);
    const count = () => game.eval(() => ({ programs: __T.renderer.info.programs.length, textures: __T.renderer.info.memory.textures }));
    const before = await count();
    const warm = await game.eval(() => ({ ...__T.WARM }));
    note("warm-up during loading", warm);
    expect(warm.failed, "warm-up steps that failed").toBe(0);
    expect(warm.textures).toBeGreaterThan(10);
    await game.eval(() => __T.goDrive());
    await game.frames(6);
    const after = await count();
    note("garage -> first frames outside", { before, after });
    expect(after.programs, "programs built on the way out").toBe(before.programs);
    expect(after.textures, "pictures uploaded on the way out").toBe(before.textures);
  });
});

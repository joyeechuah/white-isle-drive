// Phones and tablets: the on-screen pedals and steering work with real touch input, the HUD fits and nothing
// overlaps on common screen sizes (including short ones), and turning the device refits the view.
// These are emulated screens in desktop Chromium, not physical devices.
const { test, expect } = require("./support/game");

const SIZES = [
  { name: "phone landscape", width: 844, height: 390 },
  { name: "phone portrait", width: 390, height: 844 },
  { name: "small phone portrait", width: 360, height: 640 },
  { name: "short landscape", width: 640, height: 360 },
  { name: "common Android landscape", width: 800, height: 360 },
  { name: "tablet", width: 1024, height: 768 },
];

// boxes of the HUD parts that must be on screen, and any pair of them that overlap
const LAYOUT = () => {
  const ids = ["speedo", "mini", "gpsTxt", "jobhud", "chips", "bL", "bR", "bG", "bB", "bH"],
    box = {};
  for (const id of ids) {
    const e = document.getElementById(id);
    if (!e || !e.offsetParent) continue;
    const r = e.getBoundingClientRect();
    box[id] = { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }
  const off = Object.entries(box)
    .filter(([, b]) => b.l < -1 || b.t < -1 || b.r > innerWidth + 1 || b.b > innerHeight + 1)
    .map(([id]) => id);
  const ov = [];
  const ks = Object.keys(box);
  for (let i = 0; i < ks.length; i++)
    for (let j = i + 1; j < ks.length; j++) {
      const a = box[ks[i]],
        b = box[ks[j]],
        w = Math.min(a.r, b.r) - Math.max(a.l, b.l),
        h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (w > 2 && h > 2) ov.push(ks[i] + "/" + ks[j]);
    }
  return { shown: ks, off, overlaps: ov };
};

test.describe("touch controls", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("holding the on-screen pedals and steering drives the car (real touch input)", async ({ game, page }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    await game.eval(() => {
      __T.save.assist = false;
      __T.save.auto = false;
    });
    const cdp = await page.context().newCDPSession(page);
    const centre = (id) => game.eval((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, id);
    const g = await centre("bG"),
      l = await centre("bL"),
      b = await centre("bB");
    const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([id, p]) => ({ id, x: p.x, y: p.y })) });
    await touch("touchStart", [[1, g]]);
    expect(await game.eval(() => __T.pad.G)).toBe(true);
    const gas = await game.steps(180, {});
    expect(gas.fwd, "km/h after 3 s on the gas button").toBeGreaterThan(40);
    const h0 = await game.eval(() => __T.P.h);
    await touch("touchStart", [[1, g], [2, l]]);
    const turned = await game.steps(40, {});
    expect(Math.abs(Math.atan2(Math.sin(turned.h - h0), Math.cos(turned.h - h0))), "heading change with the steering button").toBeGreaterThan(0.1);
    await touch("touchEnd", [[1, g], [2, l]]);
    expect(await game.eval(() => [__T.pad.G, __T.pad.L])).toEqual([false, false]);
    await touch("touchStart", [[3, b]]);
    const slow = await game.steps(120, {});
    await touch("touchEnd", [[3, b]]);
    expect(slow.kph).toBeLessThan(gas.kph - 20);
  });
});

test.describe("no zooming on phones and tablets", () => {
  test.use({ viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("a double tap or a pinch doesn't zoom the page, buttons still take quick taps, and a zoomed page says how to get back", async ({ game, page }) => {
    await game.open();
    const set = await game.eval(() => ({
      meta: document.querySelector('meta[name="viewport"]').content,
      html: getComputedStyle(document.documentElement).touchAction,
      body: getComputedStyle(document.body).touchAction,
      list: getComputedStyle(document.getElementById("jbList")).touchAction,
      dealer: getComputedStyle(document.getElementById("dList")).touchAction,
    }));
    expect(set.meta).toContain("user-scalable=no");
    expect(set.meta).toContain("maximum-scale=1");
    expect([set.html, set.body]).toEqual(["none", "none"]);
    // lists that scroll still scroll
    expect(set.list).toBe("pan-y");
    expect(set.dealer).toBe("pan-x pan-y");
    const cdp = await page.context().newCDPSession(page);
    const tap = async (x, y) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    // in the garage: a double tap on NEXT picks two cars on (the second tap isn't lost)
    const g0 = await game.eval(() => __T.gSel);
    const b = await game.eval(() => {
      const r = document.getElementById("gnext").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await tap(b.x, b.y);
    await page.waitForTimeout(120);
    await tap(b.x, b.y);
    await game.frames(2);
    expect(await game.eval(() => __T.gSel)).toBe((g0 + 2) % (await game.eval(() => __T.save.owned.length)));
    // on the road: the second tap of a double tap is held back from the browser, so it can't zoom
    await game.driveOut();
    await game.park();
    await game.eval(() => {
      window.__ends = [];
      window.addEventListener("touchend", (e) => window.__ends.push(e.defaultPrevented));
    });
    await tap(512, 300);
    await page.waitForTimeout(120);
    await tap(512, 300);
    expect(await game.eval(() => window.__ends)).toEqual([false, true]);
    expect(await game.eval(() => window.visualViewport.scale)).toBe(1);
    // if the page does end up zoomed in, a note says how to get back
    const zoom = (s) =>
      game.eval((s) => {
        Object.defineProperty(visualViewport, "scale", { configurable: true, get: () => s });
        visualViewport.dispatchEvent(new Event("resize"));
        return !document.getElementById("zoomed").classList.contains("hide");
      }, s);
    expect(await zoom(2)).toBe(true);
    expect(await zoom(1)).toBe(false);
  });
});

test.describe("brake and reverse button", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("says REVERSE when stopped or backing up and BRAKE while moving forward; the first reverse explains it", async ({ game, page }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    await game.watchToasts();
    await game.eval(() => {
      __T.save.auto = false;
    });
    await game.steps(5, {});
    await expect(page.locator("#bB")).toHaveText("REVERSE");
    await game.steps(120, { w: true });
    await game.steps(1, {});
    await expect(page.locator("#bB")).toHaveText("BRAKE");
    // hold the button: it brakes to a stop, then reverses
    const cdp = await page.context().newCDPSession(page);
    const c = await game.eval(() => {
      const r = document.getElementById("bB").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x: c.x, y: c.y }] });
    const back = await game.steps(300, {});
    await game.steps(1, {});
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(back.fwd, "km/h after holding it").toBeLessThan(-3);
    await expect(page.locator("#bB")).toHaveText("REVERSE");
    await game.frames(2);
    expect((await game.toastLog()).filter((t) => t.startsWith("REVERSING"))).toHaveLength(1);
    // only the first time
    await game.steps(120, { w: true });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 2, x: c.x, y: c.y }] });
    await game.steps(300, {});
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await game.frames(2);
    expect((await game.toastLog()).filter((t) => t.startsWith("REVERSING"))).toHaveLength(1);
  });
});

for (const size of SIZES) {
  test.describe(`layout: ${size.name} ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

    test("the HUD and controls are on screen and don't overlap; the pause menu fits", async ({ game, page }) => {
      await game.open();
      await expect(page.locator("#drive")).toBeInViewport();
      await game.driveOut();
      await game.park();
      // a contract under way, so its panel and the GPS line under the minimap show too
      await game.eval(() => __T.jobStart(__T.JOBS[0]));
      await game.frames(3);
      const l = await game.eval(LAYOUT);
      expect(l.shown).toEqual(expect.arrayContaining(["speedo", "mini", "gpsTxt", "jobhud", "bL", "bR", "bG", "bB"]));
      expect(l.off, "off screen").toEqual([]);
      expect(l.overlaps, "overlapping").toEqual([]);
      await game.key("Escape");
      await game.waitState("PAUSE");
      const menu = await game.eval(() =>
        [...document.querySelectorAll("#pause button")]
          .filter((b) => b.offsetParent)
          .map((b) => {
            const r = b.getBoundingClientRect();
            return { id: b.id || b.textContent, in: r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1, h: r.height };
          })
      );
      const panel = await game.eval(() => {
        const p = document.querySelector("#pause > *") || document.getElementById("pause");
        return { scrolls: p.scrollHeight > p.clientHeight + 1, overflowY: getComputedStyle(p).overflowY };
      });
      // every button is on screen, or the menu scrolls to reach it
      const out = menu.filter((m) => !m.in).map((m) => m.id);
      if (out.length) expect(panel.scrolls && /auto|scroll/.test(panel.overflowY), `buttons off screen (${out.join(", ")}) and the menu doesn't scroll`).toBe(true);
      for (const m of menu) expect(m.h, `${m.id} touch target height`).toBeGreaterThanOrEqual(32);
    });
  });
}

test.describe("turning the device", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("landscape to portrait and back refits the camera, the drawing size and the HUD", async ({ game, page }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    for (const [w, h] of [
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await expect.poll(() => game.eval(() => +__T.camera.aspect.toFixed(4)), { timeout: 30_000 }).toBe(+(w / h).toFixed(4));
      await game.frames(3);
      const r = await game.eval(() => {
        const c = __T.renderer.domElement;
        return { zoom: __T.camera.zoom, css: [c.clientWidth, c.clientHeight], W: __T.W, H: __T.H };
      });
      expect(r.css).toEqual([w, h]);
      expect([r.W, r.H]).toEqual([w, h]);
      expect(r.zoom).toBeCloseTo(w < h ? Math.sqrt(w / h) : 1, 4);
      const l = await game.eval(LAYOUT);
      expect(l.off, `off screen at ${w}x${h}`).toEqual([]);
      expect(l.overlaps, `overlapping at ${w}x${h}`).toEqual([]);
    }
  });
});

// the race panel (position, time, checkpoint) must stay clear of the car, the road just ahead of it and the
// rest of the HUD
for (const [w, h] of [
  [412, 780],
  [390, 844],
  [360, 640],
  [844, 390],
  [800, 360],
]) {
  test.describe(`race panel: ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

    test("stays clear of the car, the road ahead and the rest of the HUD", async ({ game }) => {
      await game.open();
      await game.driveOut();
      await game.eval(() => __T.startEvent(__T.EVENTS[1]));
      await game.steps(200, {});
      await game.steps(240, { w: true });
      await game.frames(3);
      const r = await game.eval(PANEL);
      expect(r.shown).toBe(true);
      expect(r.onScreen).toBe(true);
      expect(r.hit, "covers").toEqual([]);
    });

    test("with the ghost's gap in a time trial, it still stays clear", async ({ game }) => {
      await game.open();
      await game.driveOut();
      await game.eval(() => {
        const T = __T,
          R = T.EVENTS[0].route,
          d = [];
        for (let k = 0; k * 3 < R.len; k++) {
          const q = T.edgePos(R, k * 3);
          d.push(+q.x.toFixed(1), +q.z.toFixed(1), +Math.atan2(q.dx, q.dz).toFixed(2), k * 3);
        }
        T.save.ghost.cubells = { c: "golf", t: R.len / 30, d };
        T.startEvent(T.EVENTS[0]);
      });
      await game.steps(200, {});
      await game.steps(240, { w: true });
      await game.frames(3);
      const r = await game.eval(PANEL);
      expect(await game.eval(() => !document.getElementById("evGhost").classList.contains("hide"))).toBe(true);
      expect(r.shown).toBe(true);
      expect(r.onScreen).toBe(true);
      expect(r.hit, "covers").toEqual([]);
    });
  });
}

// boxes of the race panel, the car (with a margin of road above it) and the rest of the HUD, and what the panel covers
const PANEL = () => {
  const T = __T,
    cam = T.camera;
  cam.updateMatrixWorld();
  T.pc.G.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(T.pc.G);
  let l = 1e9,
    t = 1e9,
    rr = -1e9,
    bb = -1e9;
  for (const x of [b.min.x, b.max.x])
    for (const y of [b.min.y, b.max.y])
      for (const z of [b.min.z, b.max.z]) {
        const v = new THREE.Vector3(x, y, z).project(cam),
          sx = ((v.x + 1) / 2) * innerWidth,
          sy = ((1 - v.y) / 2) * innerHeight;
        l = Math.min(l, sx);
        rr = Math.max(rr, sx);
        t = Math.min(t, sy);
        bb = Math.max(bb, sy);
      }
  const box = (el) => {
    const q = el.getBoundingClientRect();
    return { l: q.left, t: q.top, r: q.right, b: q.bottom };
  };
  const e = box(document.getElementById("evhud"));
  // the car, and a margin of road above it
  const others = { car: { l, t: t - 20, r: rr, b: bb } };
  for (const id of ["speedo", "mini", "gpsTxt", "chips", "tl", "bL", "bR", "bG", "bB", "bH"]) {
    const el = document.getElementById(id);
    if (el && el.offsetParent) others[id] = box(el);
  }
  const hit = Object.entries(others)
    .filter(([, o]) => Math.min(e.r, o.r) - Math.max(e.l, o.l) > 1 && Math.min(e.b, o.b) - Math.max(e.t, o.t) > 1)
    .map(([k]) => k);
  return { evhud: e, onScreen: e.l >= 0 && e.t >= 0 && e.r <= innerWidth && e.b <= innerHeight, hit, shown: !document.getElementById("evhud").classList.contains("hide") };
};

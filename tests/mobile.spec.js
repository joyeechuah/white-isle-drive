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

// Rendering smoke tests with real WebGL. On machines without a GPU (like CI runners) Chrome draws with its
// software renderer, SwiftShader: this proves the scene builds and draws, not how fast a real GPU runs it.
const { test, expect } = require("./support/game");

// brightness statistics of what is on screen, read back from a real screenshot
async function picture(page) {
  const png = await page.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0,
      s = 0,
      s2 = 0,
      sky = 0,
      green = 0;
    for (let i = 0; i < d.length; i += 4 * 53) {
      const r = d[i],
        g = d[i + 1],
        b = d[i + 2],
        l = 0.3 * r + 0.59 * g + 0.11 * b;
      s += l;
      s2 += l * l;
      n++;
      if (b > r + 15 && b > 90) sky++;
      if (g > r + 8 && g > b) green++;
    }
    return { mean: s / n, sd: Math.sqrt(s2 / n - (s / n) ** 2), skyShare: sky / n, greenShare: green / n };
  }, png.toString("base64"));
}

test.describe("rendering (real WebGL, software GPU) @webgl", () => {
  test("WebGL starts without errors and the garage is drawn", async ({ game, page }) => {
    await game.open({ render: true });
    const gl = await game.eval(() => {
      const R = __T.renderer,
        g = R.getContext();
      return { webgl2: R.capabilities.isWebGL2, err: g.getError(), lost: g.isContextLost(), maxTex: R.capabilities.maxTextureSize };
    });
    expect(gl).toMatchObject({ err: 0, lost: false });
    await game.frames(3);
    const p = await picture(page);
    expect(p.sd, "brightness variation (a blank frame has none)").toBeGreaterThan(10);
    test.info().annotations.push({ type: "webgl", description: `WebGL${gl.webgl2 ? "2" : "1"}, max texture ${gl.maxTex}` });
  });

  test("the island is drawn by day and by night, and night is darker", async ({ game, page }) => {
    await game.open({ render: true });
    await game.driveOut();
    await game.park();
    const shot = async (tod) => {
      // the pause menu's fixed hours: NOON (13:00) and NIGHT (22:30)
      await game.eval((tod) => {
        __T.save.todMode = tod > 20 ? 4 : 2;
        __T.save.tod = tod;
      }, tod);
      await game.frames(4);
      return picture(page);
    };
    const day = await shot(13);
    const night = await shot(22.5);
    expect(day.sd).toBeGreaterThan(10);
    expect(day.skyShare + day.greenShare, "share of the picture that is sky or vegetation").toBeGreaterThan(0.05);
    expect(night.mean).toBeLessThan(day.mean - 20);
    expect(await game.eval(() => __T.renderer.getContext().getError())).toBe(0);
    const info = await game.eval(() => {
      const i = __T.renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
    });
    test.info().annotations.push({ type: "renderer.info at night", description: JSON.stringify(info) });
    expect(info.calls).toBeGreaterThan(10);
  });

  test("every graphics quality setting draws without WebGL errors", async ({ game, page }) => {
    await game.open({ render: true });
    await game.driveOut();
    await game.park();
    const res = [];
    for (let q = 0; q < 3; q++) {
      await game.key("Escape");
      await game.waitState("PAUSE");
      // press GRAPHICS until it shows the setting we want
      for (let k = 0; k < 3; k++) {
        const t = await page.locator("#pGfx").textContent();
        if (t.endsWith(["AUTO", "SHARP", "SMOOTH"][q])) break;
        await page.locator("#pGfx").click();
      }
      await expect(page.locator("#pGfx")).toHaveText("GRAPHICS: " + ["AUTO", "SHARP", "SMOOTH"][q]);
      await game.key("Escape");
      await game.waitState("DRIVE");
      await game.frames(4);
      const p = await picture(page);
      const r = await game.eval(() => ({ err: __T.renderer.getContext().getError(), pr: __T.renderer.getPixelRatio(), calls: __T.renderer.info.render.calls }));
      res.push({ q, ...r, sd: Math.round(p.sd) });
      expect(r.err).toBe(0);
      expect(p.sd).toBeGreaterThan(10);
    }
    test.info().annotations.push({ type: "graphics settings", description: JSON.stringify(res) });
  });
});

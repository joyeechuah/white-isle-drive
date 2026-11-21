// On a phone, with the damage pill showing in the top-left column (money, damage, level, place), the minimap stays
// clear of that column: it moves down as the column grows in portrait, and in landscape the pill sits beside the
// money so the column keeps its height. A phone video showed the minimap over the place and the clock after a crash.
const { test, expect } = require("./support/game");

const overlap = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

for (const [name, w, h] of [["portrait", 390, 844], ["landscape", 844, 390], ["small landscape", 740, 360]])
  test.describe(name, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    test(`${name}: with the damage pill showing, the minimap covers nothing in the column`, async ({ game, page }) => {
      await game.open();
      await game.driveOut();
      await game.park();
      await game.eval(() => { __T.P.damage = 40; document.getElementById("damageHud").classList.remove("hide"); });
      await page.waitForTimeout(100);
      const r = await game.eval(() => {
        const box = (sel) => { const e = document.querySelector(sel); if (!e || e.classList.contains("hide")) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? b : null; };
        return { col: ["#tl .money", "#damageHud", "#tl .lvl", "#tl .loc"].map(box), mini: box("#mini") };
      });
      expect(r.col.every(Boolean), "the whole column is on screen").toBe(true);
      expect(r.mini, "the minimap is on screen").toBeTruthy();
      for (const b of r.col) expect(overlap(b, r.mini), "the minimap covers part of the column").toBe(false);
      expect(r.mini.bottom, "the minimap stays on screen").toBeLessThanOrEqual(h);
    });
  });

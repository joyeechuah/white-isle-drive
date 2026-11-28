// MAP KEY on a narrow screen opens the map's legend and the passport (they were hidden there, out of reach); and a
// song that failed for want of a connection is tried again as soon as the browser is back online. Both as in Port
// Meridien.
const { test, expect } = require("./support/game");

for (const [name, w, h] of [["phone", 390, 844], ["computer", 1280, 720]])
  test.describe(name, () => {
    test.use({ viewport: { width: w, height: h } });
    test(`${name}: the map's legend and passport ${w <= 700 ? "open with MAP KEY" : "show without MAP KEY"}`, async ({ game, page }) => {
      await game.open();
      await game.driveOut();
      await game.park();
      await game.key("m");
      await game.waitState("MAP");
      const key = page.getByRole("button", { name: "MAP KEY", exact: true });
      if (w <= 700) {
        await expect(page.locator("#mapSide")).toBeHidden();
        await key.click();
        await expect(key).toHaveAttribute("aria-expanded", "true");
        await expect(page.locator("#mapSide")).toBeVisible();
        await page.locator("#mapPass").click();
        await expect(page.locator("#passport")).toBeVisible();
        await page.locator("#pzClose").click();
        await expect(page.locator("#mapSide")).toBeVisible();
        await key.focus();
        await page.keyboard.press("Escape");
        await expect(page.locator("#mapSide")).toBeHidden();
        expect(await game.state()).toBe("MAP");
      } else {
        await expect(key).toBeHidden();
        await expect(page.locator("#mapSide")).toBeVisible();
      }
    });
  });

test("a song that failed offline is tried again once the browser is back online", async ({ game }) => {
  await game.open();
  const r = await game.eval(() => {
    const T = __T, n = Object.keys(T.SONGS)[0], S = T.SONGS[n];
    Object.assign(S, { st: "failed", retryDelay: 30, retryAt: performance.now() + 30000 });
    const before = (T.songFetch(n), S.st);
    window.dispatchEvent(new Event("online"));
    T.songFetch(n);
    return { before, after: S.st };
  });
  expect(r).toEqual({ before: "failed", after: "loading" });
});

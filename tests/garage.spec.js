// Garage and dealership: buying, selling, the garage limit, choosing a car, test drives and paint.
// Buttons are pressed with real clicks; credits and the save are read back from the game.
const { test, expect } = require("./support/game");

const pick = (game, id) =>
  game.eval((id) => {
    const T = __T,
      i = T.CARS.findIndex((c) => c.id === id);
    T.dPick(i);
    const c = T.CARS[i];
    return { price: c.price, sell: Math.round((c.price * 0.6) / 100) * 100 };
  }, id);

async function toDealer(game, cr) {
  await game.open();
  await game.driveOut();
  if (cr !== undefined)
    await game.eval((cr) => {
      __T.save.cr = cr;
    }, cr);
  await game.eval(() => __T.openDealer());
  await game.waitState("DEALER");
}

test.describe("dealership", () => {
  test("buying a car charges its price once, even when BUY is pressed twice", async ({ game, page }) => {
    await toDealer(game, 200000);
    const { price } = await pick(game, "m3");
    await page.locator("#dBuy").dblclick();
    const r = await game.eval(() => ({ cr: __T.save.cr, owned: __T.save.owned.filter((id) => id === "m3").length }));
    expect(r).toEqual({ cr: 200000 - price, owned: 1 });
    await expect(page.locator("#dPrice")).toHaveText("In your garage");
    const saved = await game.readSave();
    expect(saved.cr).toBe(200000 - price);
    expect(saved.owned).toContain("m3");
  });

  test("without enough credits BUY is disabled, says how much is missing, and does nothing", async ({ game, page }) => {
    await toDealer(game, 10000);
    const { price } = await pick(game, "m3");
    await expect(page.locator("#dBuy")).toBeDisabled();
    await expect(page.locator("#dNote")).toContainText("more CR");
    await game.eval(() => document.getElementById("dBuy").onclick());
    expect(await game.eval(() => ({ cr: __T.save.cr, has: __T.save.owned.includes("m3") }))).toEqual({ cr: 10000, has: false });
    expect(price).toBeGreaterThan(10000);
  });

  test("a full garage (12 cars) refuses another purchase and says why", async ({ game, page }) => {
    await toDealer(game, 5_000_000);
    await game.eval(() => {
      const T = __T;
      T.save.owned = T.CARS.slice(0, T.GARAGE_CAP).map((c) => c.id);
    });
    const spare = await game.eval(() => __T.CARS[__T.GARAGE_CAP].id);
    await pick(game, spare);
    await expect(page.locator("#dBuy")).toBeDisabled();
    await expect(page.locator("#dNote")).toHaveText("Your garage is full");
    await expect(page.locator("#dCap")).toContainText("12/12");
    await game.eval(() => document.getElementById("dBuy").onclick());
    expect(await game.eval(() => __T.save.owned.length)).toBe(12);
  });

  test("selling pays 60% once; the car you drive and your last car can't be sold", async ({ game, page }) => {
    await toDealer(game, 100000);
    const cur = await game.eval(() => __T.curId);
    const other = await game.eval(() => __T.save.owned.find((id) => id !== __T.curId));
    const { sell } = await pick(game, other);
    await page.locator("#dSell").click();
    expect(await game.eval((id) => ({ cr: __T.save.cr, has: __T.save.owned.includes(id) }), other)).toEqual({ cr: 100000 + sell, has: false });
    expect((await game.readSave()).owned).not.toContain(other);
    // a second press of the (now hidden) button pays nothing
    await game.eval(() => document.getElementById("dSell").onclick());
    expect(await game.eval(() => __T.save.cr)).toBe(100000 + sell);
    await pick(game, cur);
    await expect(page.locator("#dSell")).toBeHidden();
    await game.eval(() => document.getElementById("dSell").onclick());
    expect(await game.eval((id) => __T.save.owned.includes(id), cur)).toBe(true);
    // down to one car: it can't be sold
    await game.eval(() => {
      __T.save.owned = [__T.curId];
    });
    await pick(game, cur);
    await expect(page.locator("#dSell")).toBeHidden();
  });

  test("a test drive lasts 90 s, then the car goes back and your own car returns", async ({ game, page }) => {
    await toDealer(game, 100000);
    const own = await game.eval(() => __T.curId);
    await pick(game, "chiron");
    await page.locator("#dTest").click();
    await game.waitState("DRIVE");
    const td = await game.eval(() => ({ id: __T.testDrive.id, t: __T.testDrive.t, car: __T.curId }));
    expect(td).toMatchObject({ id: "chiron", car: "chiron" });
    expect(td.t, "seconds left just after it starts").toBeGreaterThan(88);
    expect(td.t).toBeLessThanOrEqual(90);
    await expect(page.locator("#tdPill")).toBeVisible();
    // run the clock down to its last moment, then let the game finish it
    await game.eval(() => {
      __T.testDrive.t = 0.5;
    });
    await game.waitState("DEALER", 60_000);
    const r = await game.eval(() => ({ td: __T.testDrive, car: __T.curId, owned: __T.save.owned.includes("chiron"), cr: __T.save.cr }));
    expect(r).toEqual({ td: null, car: own, owned: false, cr: 100000 });
    await expect(page.locator("#tdPill")).toBeHidden();
  });

  test("dealership paint swatches have names and show which one is selected", async ({ game, page }) => {
    await toDealer(game, 100000);
    await pick(game, "m3");
    const sw = page.locator("#dSw button");
    const names = await sw.evaluateAll((b) => b.map((e) => e.getAttribute("aria-label")));
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(5);
    await sw.nth(3).click();
    expect(await sw.evaluateAll((b) => b.map((e) => e.getAttribute("aria-pressed")))).toEqual(names.map((_, i) => String(i === 3)));
  });
});

test.describe("garage", () => {
  test("choosing a car in the garage drives it and remembers it", async ({ game, page }) => {
    await game.open();
    const before = await game.eval(() => __T.curId);
    await page.locator("#gnext").click();
    const picked = await game.eval(() => __T.save.owned[__T.gSel]);
    expect(picked).not.toBe(before);
    await game.driveOut();
    expect(await game.eval(() => __T.curId)).toBe(picked);
    expect((await game.readSave()).cur).toBe(picked);
  });

  test("garage paint: distinct names, one selected, and the choice is saved", async ({ game, page }) => {
    await game.open();
    const sw = page.locator("#gSw button");
    const names = await sw.evaluateAll((b) => b.map((e) => e.getAttribute("aria-label")));
    expect(new Set(names).size).toBe(names.length);
    expect((await sw.evaluateAll((b) => b.filter((e) => e.getAttribute("aria-pressed") === "true").length))).toBe(1);
    await sw.nth(2).click();
    await expect(sw.nth(2)).toHaveAttribute("aria-pressed", "true");
    const r = await game.eval(() => ({ id: __T.save.owned[__T.gSel], paint: __T.save.paint[__T.save.owned[__T.gSel]] }));
    expect((await game.readSave()).paint[r.id]).toBe(r.paint);
  });
});

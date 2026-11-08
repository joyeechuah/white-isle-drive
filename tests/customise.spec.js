// Customise: options for a garage car, seen on the car as you choose, paid once on APPLY, kept in the save and on the
// car on the road; CANCEL changes nothing; options you can't afford can't be applied; a bad save is cleaned.
const { test, expect } = require("./support/game");

const model = () =>
  __T.carMeshes[__T.save.owned[__T.gSel]] &&
  (() => {
    const c = __T.carMeshes[__T.save.owned[__T.gSel]],
      out = { spokes: 0, wing: 0, tips: 0, livery: 0, tint: null, plate: null, rim: null, cal: null };
    c.G.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.alphaMap && m.alphaTest && m.roughnessMap) out.livery++;
      if (m.alphaMap && m.alphaTest && !m.roughnessMap) out.tint = m.color.getHex();
      if (m.map && m.map.image && m.map.image.width === 256 && m.map.image.height === 56) out.plate = m.map.image.toDataURL().length;
      if (o.geometry.type === "CylinderGeometry" && o.geometry.parameters.height === 0.12) out.tips++;
      if (o.geometry.type === "ExtrudeGeometry" && o.parent && o.parent.parent === c.G && o.geometry.parameters.shapes && o.geometry.parameters.shapes.holes) out.spokes = o.geometry.parameters.shapes.holes.length;
    });
    out.rim = c.wheels[0].children[1].material.color.getHex();
    out.spokes = c.wheels[0].children[1].geometry.parameters.shapes.holes.length;
    out.cal = c.wheels[0].parent.children[0].children[2].material.color.getHex();
    out.wing = c.shell.children.filter((o) => o.geometry && o.geometry.type === "ExtrudeGeometry" && o.position.y > 0.9).length;
    return out;
  })();

test.describe("customise", () => {
  test.beforeEach(async ({ game }) => {
    await game.open();
  });

  test("options show on the car as you pick them; APPLY pays the total once and keeps them; they're on the car you drive", async ({ game, page }) => {
    await game.eval(() => (__T.save.cr = 100000));
    const before = await game.eval(model);
    await page.locator("#gCust").click();
    await expect(page.locator("#cust")).toBeVisible();
    const pick = async (k, i) => page.locator(`#cuList .cus[data-k="${k}"] .cos > *`).nth(i).click();
    await pick("rim", 1);
    await pick("rimC", 3);
    await pick("cal", 2);
    await pick("wing", 4);
    await pick("exh", 2);
    await pick("tint", 2);
    await pick("liv", 1);
    await page.locator("#cuPlate").fill("JOYEE 1");
    await page.locator("#cuPlate").press("Enter");
    const seen = await game.eval(model);
    // the preview is on the car already
    expect(seen.spokes).not.toBe(before.spokes);
    expect(seen.rim).not.toBe(before.rim);
    expect(seen.cal).not.toBe(before.cal);
    expect(seen.tips).toBe(4);
    expect(seen.livery).toBeGreaterThan(0);
    expect(seen.tint).not.toBe(before.tint);
    expect(seen.plate).not.toBe(before.plate);
    const want = 5000 + 1500 + 1000 + 6000 + 3000 + 1500 + 3500 + 500;
    await expect(page.locator("#cuTotal")).toHaveText(want.toLocaleString("en-US") + " CR");
    expect(await game.eval(() => __T.save.cr)).toBe(100000);
    await page.locator("#cuApply").click();
    await expect(page.locator("#cust")).toBeHidden();
    const after = await game.eval(() => ({ cr: __T.save.cr, mods: __T.save.mods[__T.save.owned[__T.gSel]], stored: JSON.parse(localStorage.getItem(__T.SAVE_KEY)).mods }));
    expect(after.cr).toBe(100000 - want);
    expect(after.mods).toEqual({ rim: 1, rimC: 3, cal: 2, wing: 4, exh: 2, tint: 2, liv: 1, plate: "JOYEE 1" });
    expect(after.stored).toEqual(await game.eval(() => __T.save.mods));
    const kept = await game.eval(model);
    expect(kept).toEqual(seen);
    // opening it again and applying nothing costs nothing
    await page.locator("#gCust").click();
    await expect(page.locator("#cuTotal")).toHaveText("NO CHANGES");
    await page.locator("#cuApply").click();
    expect(await game.eval(() => __T.save.cr)).toBe(100000 - want);
    // on the road it's the same car
    await game.driveOut();
    const road = await game.eval(() => ({ spokes: __T.pc.wheels[0].children[1].geometry.parameters.shapes.holes.length, mods: __T.pc.mods.plate }));
    expect(road.spokes).toBe(seen.spokes);
    expect(road.mods).toBe("JOYEE 1");
  });

  test("CANCEL puts the car back and charges nothing; Escape cancels too; options you can't afford can't be applied", async ({ game, page }) => {
    const before = await game.eval(model);
    await page.locator("#gCust").click();
    await page.locator('#cuList .cus[data-k="fin"] .cos > *').nth(2).click();
    await page.locator('#cuList .cus[data-k="rimC"] .cos > *').nth(1).click();
    expect((await game.eval(model)).rim).not.toBe(before.rim);
    await page.locator("#cuCancel").click();
    await expect(page.locator("#cust")).toBeHidden();
    expect(await game.eval(model)).toEqual(before);
    expect(await game.eval(() => __T.save.mods)).toEqual({});
    await page.locator("#gCust").click();
    await page.locator('#cuList .cus[data-k="rimC"] .cos > *').nth(1).click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#cust")).toBeHidden();
    expect(await game.eval(model)).toEqual(before);
    // short of credits
    await game.eval(() => (__T.save.cr = 2000));
    await page.locator("#gCust").click();
    await page.locator('#cuList .cus[data-k="wing"] .cos > *').nth(4).click();
    await expect(page.locator("#cuApply")).toBeDisabled();
    await expect(page.locator("#cuMsg")).toContainText("Not enough credits");
    await page.locator('#cuList .cus[data-k="wing"] .cos > *').nth(0).click();
    await page.locator('#cuList .cus[data-k="cal"] .cos > *').nth(1).click();
    await expect(page.locator("#cuApply")).toBeEnabled();
    await page.locator("#cuApply").click();
    expect(await game.eval(() => __T.save.cr)).toBe(1000);
  });

  test("a race number is drawn on both doors; every option builds on every body type", async ({ game }) => {
    const r = await game.eval(() => {
      const T = __T,
        bad = [];
      for (const shape of ["super", "gt", "hatch", "muscle", "roadster", "suv"]) {
        const cd = T.CARS.find((c) => c.shape === shape);
        for (const [k, O] of Object.entries(T.MOD_OPTS)) {
          if (!O.o) continue;
          for (let i = 0; i < O.o.length; i++) {
            const mods = { [k]: i };
            if (k === "livC") mods.liv = 1;
            try {
              const c = T.buildHeroCar(cd, 0x336699, mods);
              T.disposeHeroCar(c);
            } catch (e) {
              bad.push(shape + " " + k + "=" + i + ": " + e.message);
            }
          }
        }
      }
      const c = T.buildHeroCar(T.CARS[0], 0x336699, { liv: 3, num: 27 });
      let sides = 0;
      c.G.traverse((o) => o.isMesh && o.material.alphaMap && o.material.roughnessMap && o.geometry.index && o.geometry.index.count < c.shell.children[0].geometry.index.count && sides++);
      T.disposeHeroCar(c);
      return { bad, sides };
    });
    expect(r.bad).toEqual([]);
    expect(r.sides).toBe(2);
  });

  test("a bad customisation in storage is cleaned; selling a car forgets its customisation", async ({ game, page }) => {
    const raw = await game.eval(() => {
      const s = JSON.parse(JSON.stringify(__T.save));
      s.owned = ["golf", "mini", "mx5"];
      s.mods = { golf: { rim: 3, rimC: 99, plate: "<b>", num: 500, liv: 3, fin: -1, junk: 1 }, mini: { plate: "AB 12", exh: 2 }, nosuchcar: { rim: 1 }, mx5: "x" };
      return JSON.stringify(s);
    });
    await game.open({ save: raw });
    expect(await game.eval(() => __T.save.mods)).toEqual({ golf: { rim: 3, liv: 3 }, mini: { plate: "AB 12", exh: 2 } });
    // sell the Mini at the dealership: its customisation goes with it
    await game.eval(() => {
      const T = __T;
      T.openDealer();
      T.dPick(T.CARS.findIndex((c) => c.id === "mini"));
    });
    await page.locator("#dSell").click();
    expect(await game.eval(() => ({ owned: __T.save.owned.includes("mini"), mods: __T.save.mods.mini }))).toEqual({ owned: false, mods: undefined });
  });
});

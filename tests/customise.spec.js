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

  test("colour and material options change the car in place; caches of race numbers and plates stay bounded; rebuilding many times leaves nothing behind", async ({ game, page }) => {
    await game.eval(() => (__T.save.cr = 1e9));
    await page.locator("#gCust").click();
    const pick = (k, i) => page.locator(`#cuList .cus[data-k="${k}"] .cos > *`).nth(i).click();
    const car = () => game.eval(() => (window.__car = window.__car || __T.carMeshes[__T.save.owned[__T.gSel]]) === __T.carMeshes[__T.save.owned[__T.gSel]]);
    await game.eval(() => (window.__car = __T.carMeshes[__T.save.owned[__T.gSel]]));
    // colours, finish, tint and plate: the same model, changed where it is (no rebuild, so no pause)
    const t0 = Date.now();
    for (const [k, i] of [["fin", 2], ["roof", 1], ["rimC", 4], ["cal", 3], ["exhC", 2], ["tint", 0], ["fin", 3], ["rimC", 6]]) await pick(k, i);
    const inPlaceMs = (Date.now() - t0) / 8;
    expect(await car(), "the car model was kept").toBe(true);
    // a spoiler is new geometry: the model is built again
    await pick("wing", 4);
    expect(await car()).toBe(false);
    // race numbers 1 to 30, plates of 20 different texts: the caches keep only a few, and free the rest
    await pick("liv", 3);
    const r = await game.eval(async () => {
      const T = __T,
        freed = { num: 0, plate: 0 };
      const watch = () => {
        for (const p of Object.values(T.SHAPE_CACHE)) for (const k in p.liv) if (k[0] === "n") for (const t of [p.liv[k].R, p.liv[k].L]) if (!t.__w) { t.__w = 1; t.addEventListener("dispose", () => freed.num++); }
        for (const t of Object.values(T.PLATE_TEX)) if (!t.__w) { t.__w = 1; t.addEventListener("dispose", () => freed.plate++); }
      };
      const plus = document.querySelectorAll('#cuList .cus[data-k="num"] .co')[1];
      for (let i = 0; i < 30; i++) { document.querySelectorAll('#cuList .cus[data-k="num"] .co')[1].click(); watch(); }
      const box = () => document.getElementById("cuPlate");
      for (let i = 0; i < 20; i++) { box().value = "TEST " + i; box().onchange(); watch(); }
      let nums = 0;
      for (const p of Object.values(T.SHAPE_CACHE)) for (const k in p.liv) if (k[0] === "n") nums++;
      const env0 = T.CAR_ENV.mats.size;
      // forty rebuilds of the same car: the reflection list and the scene don't grow
      const kids0 = T.scene.children.length;
      for (let i = 0; i < 40; i++) document.querySelectorAll('#cuList .cus[data-k="wing"] .co')[i % 2 ? 1 : 4].click();
      return { nums, plates: Object.keys(T.PLATE_TEX).length, freed, envGrow: T.CAR_ENV.mats.size - env0, kidsGrow: T.scene.children.length - kids0, plus: !!plus };
    });
    test.info().annotations.push({ type: "customise", description: JSON.stringify({ inPlaceMs, ...r }) });
    expect(r.nums).toBeLessThanOrEqual(5);
    expect(r.freed.num).toBeGreaterThan(40);
    expect(r.plates).toBeLessThanOrEqual(9);
    expect(r.freed.plate).toBeGreaterThan(10);
    expect(r.envGrow).toBeLessThanOrEqual(2);
    expect(r.kidsGrow).toBe(0);
  });
});

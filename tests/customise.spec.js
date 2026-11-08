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

  test("the garage view turns all the way round the car by dragging, zooms with the wheel, and stays inside the room", async ({ game, page }) => {
    await page.locator("#gCust").click();
    await game.frames(30);
    const where = () =>
      game.eval(() => {
        const T = __T,
          c = T.carMeshes[T.save.owned[T.gSel]].G.position,
          cam = T.camera.position;
        return { a: Math.atan2(cam.x - c.x, cam.z - c.z), d: Math.hypot(cam.x - c.x, cam.z - c.z), y: cam.y - c.y };
      });
    const a0 = await where();
    // drag across the view: half a turn and more
    const box = await page.locator("#c").boundingBox();
    const y = box.y + box.height * 0.45,
      x0 = box.x + box.width * 0.15;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(x0 + i * 20, y);
    await page.mouse.up();
    await game.frames(90);
    const a1 = await where();
    const turned = Math.abs(((a1.a - a0.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    expect(turned, "radians the view went round the car").toBeGreaterThan(1.5);
    // the drag didn't count as a tap on a car (the panel is still open on the same car)
    await expect(page.locator("#cust")).toBeVisible();
    // the wheel zooms in
    await page.mouse.move(box.x + box.width * 0.3, y);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -200);
    await game.frames(90);
    const a2 = await where();
    expect(a2.d).toBeLessThan(a1.d * 0.85);
    // FRONT, SIDE and REAR turn the view to look straight at them; RESET goes back; SPIN turns it by itself
    const ang = async () => {
      await game.frames(120);
      return game.eval(() => {
        const T = __T,
          G = T.carMeshes[T.save.owned[T.gSel]].G,
          cam = T.camera.position,
          f = { x: Math.sin(G.rotation.y), z: Math.cos(G.rotation.y) },
          dx = cam.x - G.position.x,
          dz = cam.z - G.position.z;
        // angle of the camera round the car, 0 = straight in front
        return Math.atan2(dx * f.z - dz * f.x, dx * f.x + dz * f.z);
      });
    };
    await page.locator('#cuViews [data-v="front"]').click();
    expect(Math.abs(await ang())).toBeLessThan(0.25);
    await page.locator('#cuViews [data-v="rear"]').click();
    expect(Math.abs(Math.abs(await ang()) - Math.PI)).toBeLessThan(0.25);
    await page.locator('#cuViews [data-v="side"]').click();
    expect(Math.abs(Math.abs(await ang()) - Math.PI / 2)).toBeLessThan(0.3);
    // a change of option keeps the view where it is
    const before = await ang();
    await page.locator('#cuList .cus[data-k="rimC"] .cos > *').nth(3).click();
    expect(Math.abs((await ang()) - before)).toBeLessThan(0.05);
    await page.locator("#cuSpin").click();
    const s0 = await ang(),
      s1 = await ang();
    expect(Math.abs(s1 - s0)).toBeGreaterThan(0.3);
    // the other parked cars are out of the picture while customising, and back after
    const hidden = await game.eval(() => __T.save.owned.filter((o, i) => o !== __T.save.owned[__T.gSel] && __T.carMeshes[o] && __T.carMeshes[o].G.visible).length);
    expect(hidden).toBe(0);
    await page.locator("#cuCancel").click();
    const shown = await game.eval(() => __T.save.owned.filter((o) => __T.carMeshes[o] && __T.carMeshes[o].G.visible).length);
    expect(shown).toBeGreaterThan(1);
  });
  test("the car stands clear of the bays while customising; from every angle and zoom the view stays inside the room; it goes back to its bay after", async ({ game, page }) => {
    const bay = await game.eval(() => {
      const p = __T.carMeshes[__T.save.owned[__T.gSel]].G.position;
      return { x: p.x, z: p.z };
    });
    await page.locator("#gCust").click();
    await game.frames(5);
    const r = await game.eval(() => {
      const T = __T,
        G = T.carMeshes[T.save.owned[T.gSel]].G,
        st = T.gW(T.GO_STAGE[0], T.GO_STAGE[1]),
        ray = new THREE.Raycaster(),
        bad = [];
      let n = 0,
        nearest = 1e9;
      for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8)
        for (const zoom of [0.55, 1, 1.6])
          for (const pitch of [-1.9, 0, 3.2]) {
            Object.assign(T.GO, { yaw, yawS: yaw, zoom, pitch, user: true });
            const w = T.garageWant(),
              c = G.position.clone().setY(w.look.y > G.position.y ? G.position.y + 0.9 : w.look.y),
              d = w.pos.clone().sub(G.position.clone().setY(T.gW(0, 0).y + 0.9)),
              L = d.length();
            ray.set(G.position.clone().setY(T.gW(0, 0).y + 0.9), d.normalize());
            ray.far = L;
            const h = ray.intersectObjects(T.HOUSE_MESHES, false)[0];
            n++;
            if (h) bad.push({ yaw: +yaw.toFixed(2), zoom, pitch, hit: +h.distance.toFixed(2), L: +L.toFixed(2) });
            nearest = Math.min(nearest, L);
            void c;
          }
      return { at: { x: G.position.x - st.x, z: G.position.z - st.z }, n, bad, nearest };
    });
    // staged on its own in the open part of the garage
    expect(Math.hypot(r.at.x, r.at.z)).toBeLessThan(0.01);
    // nothing of the house between the car and the camera, from 16 angles x 3 zooms x 3 heights
    expect(r.n).toBe(144);
    expect(r.bad).toEqual([]);
    expect(r.nearest).toBeGreaterThan(2);
    // the selection ring and light follow it
    const ring = await game.eval(() => {
      const G = __T.carMeshes[__T.save.owned[__T.gSel]].G.position,
        R = __T.scene.children.find((o) => o.geometry && o.geometry.type === "RingGeometry");
      return R ? Math.hypot(R.position.x - G.x, R.position.z - G.z) : -1;
    });
    expect(ring).toBeGreaterThanOrEqual(0);
    expect(ring).toBeLessThan(0.01);
    await page.locator("#cuCancel").click();
    await game.frames(2);
    const back = await game.eval(() => {
      const p = __T.carMeshes[__T.save.owned[__T.gSel]].G.position;
      return { x: p.x, z: p.z };
    });
    expect(Math.hypot(back.x - bay.x, back.z - bay.z)).toBeLessThan(0.01);
  });

  test("SPIN's button always shows whether it's turning; a drag keeps its finger off the canvas and lets go when cancelled", async ({ game, page }) => {
    await page.locator("#gCust").click();
    await game.frames(10);
    const spin = () => game.eval(() => ({ on: __T.GO.spin, cls: document.getElementById("cuSpin").classList.contains("on"), aria: document.getElementById("cuSpin").getAttribute("aria-pressed") }));
    await page.locator("#cuSpin").click();
    expect(await spin()).toEqual({ on: true, cls: true, aria: "true" });
    // a drag stops it, and the button says so (it used to stay lit)
    const box = await page.locator("#c").boundingBox(),
      y = box.y + box.height * 0.4,
      x0 = box.x + box.width * 0.1;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(x0 + i * 15, y);
    expect(await spin()).toEqual({ on: false, cls: false, aria: "false" });
    // carry on dragging across the panel: the view keeps turning (the canvas holds on to the mouse)
    const panel = await page.locator("#cust").boundingBox(),
      yaw0 = await game.eval(() => __T.GO.yaw);
    for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + 90 + ((panel.x + panel.width / 2 - x0 - 90) * i) / 10, y);
    const yaw1 = await game.eval(() => __T.GO.yaw);
    expect(Math.abs(yaw1 - yaw0), "turn while the mouse is over the panel").toBeGreaterThan(1);
    await page.mouse.up();
    expect(await game.eval(() => __T.GO.ptr.size)).toBe(0);
    // a view button and closing stop it too
    await page.locator("#cuSpin").click();
    await page.locator('#cuViews [data-v="rear"]').click();
    expect(await spin()).toEqual({ on: false, cls: false, aria: "false" });
    await page.locator("#cuSpin").click();
    await page.locator("#cuCancel").click();
    expect(await spin()).toEqual({ on: false, cls: false, aria: "false" });
    // a press the browser cancels (a system gesture), or whose capture is lost, is forgotten
    const left = await game.eval(() => {
      const c = document.getElementById("c"),
        ev = (t, id) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: "touch", clientX: 100, clientY: 100, bubbles: true }));
      ev("pointerdown", 41);
      ev("pointerdown", 42);
      const two = __T.GO.ptr.size;
      ev("pointercancel", 41);
      ev("lostpointercapture", 42);
      return { two, after: __T.GO.ptr.size, pinch: __T.GO.pinch, last: __T.GO.last };
    });
    expect(left).toEqual({ two: 2, after: 0, pinch: null, last: null });
  });
});

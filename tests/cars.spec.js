// Car models: every car builds a body and glasshouse with sensible shape, paint changes reach both, cars of one body
// type share their shapes and textures, and freeing a car keeps what the others share.
const { test, expect } = require("./support/game");

test.describe("car models", () => {
  test("every car builds; shapes are sound, shared by body type, repainted as one, and freed safely", async ({ game }) => {
    await game.open();
    const r = await game.eval(() => {
      const T = __T,
        out = { bad: [], shapes: new Set(), wheels: 0 };
      const built = [];
      for (const cd of T.CARS) {
        const c = T.buildHeroCar(cd, 0x336699);
        built.push(c);
        const p = c.shell.children[0].geometry.attributes.position.array;
        let nan = false,
          minY = 9,
          maxY = -9,
          maxX = 0;
        for (let i = 0; i < p.length; i += 3) {
          if (!isFinite(p[i]) || !isFinite(p[i + 1]) || !isFinite(p[i + 2])) nan = true;
          minY = Math.min(minY, p[i + 1]);
          maxY = Math.max(maxY, p[i + 1]);
          maxX = Math.max(maxX, Math.abs(p[i]));
        }
        // the body sits above the road, under 2 m, and no wider than about 2.1 m
        if (nan || minY < 0.15 || maxY > 2 || maxX > 1.08) out.bad.push({ id: cd.id, nan, minY, maxY, maxX });
        out.wheels += c.wheels.length;
        c.paint(0xaa2211);
        const want = new THREE.Color(0xaa2211).getHex();
        if (c.bodyM.color.getHex() !== want || c.glass.material.color.getHex() !== want) out.bad.push({ id: cd.id, paint: false });
        out.shapes.add(c.shape);
      }
      // two cars of one body type use the same geometry and textures
      const a = built.find((c) => c.shape === "super"),
        b = built.filter((c) => c.shape === "super")[1];
      out.shared = a.shell.children[0].geometry === b.shell.children[0].geometry && a.bodyM.map === b.bodyM.map;
      // freeing every car leaves the shared shapes usable
      for (const c of built) T.disposeHeroCar(c);
      const again = T.buildHeroCar(T.CARS[0]);
      out.afterFree = again.shell.children[0].geometry.attributes.position.count > 1000 && !!again.bodyM.map.image;
      T.disposeHeroCar(again);
      out.shapes = [...out.shapes].sort();
      out.envMats = T.CAR_ENV.mats.size;
      return out;
    });
    expect(r.bad).toEqual([]);
    expect(r.shapes).toEqual(["gt", "hatch", "muscle", "roadster", "super", "suv"]);
    expect(r.wheels).toBe(4 * 24);
    expect(r.shared).toBe(true);
    expect(r.afterFree).toBe(true);
  });

  test("traffic wheels face outwards on both sides (the mirrored pair used to be inside out)", async ({ game }) => {
    await game.open();
    const r = await game.eval(() => {
      const T = __T,
        out = {};
      for (const shape of ["hatch", "sedan"]) {
        const c = T.buildTrafficCar(0xffffff, shape),
          g = c.G.children[2].geometry,
          p = g.attributes.position.array,
          n = g.attributes.normal.array,
          I = g.index.array,
          cnt = { left: [0, 0], right: [0, 0] };
        for (let i = 0; i < I.length; i += 3) {
          const [a, b, d] = [I[i] * 3, I[i + 1] * 3, I[i + 2] * 3];
          const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
          const vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
          const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
          if (Math.hypot(fx, fy, fz) < 1e-9) continue;
          const dot = fx * (n[a] + n[b] + n[d]) + fy * (n[a + 1] + n[b + 1] + n[d + 1]) + fz * (n[a + 2] + n[b + 2] + n[d + 2]);
          cnt[p[a] < 0 ? "left" : "right"][dot > 0 ? 0 : 1]++;
        }
        out[shape] = cnt;
      }
      return out;
    });
    for (const shape of ["hatch", "sedan"])
      for (const side of ["left", "right"]) {
        expect(r[shape][side][0], `${shape} ${side}: faces pointing out`).toBeGreaterThan(1000);
        expect(r[shape][side][1], `${shape} ${side}: faces pointing in`).toBe(0);
      }
  });

  test("ghost cars: changing model many times keeps the reflection list bounded, frees nothing shared, and the ghost reflects the current sky", async ({ game }) => {
    await game.open();
    const r = await game.eval(() => {
      const T = __T,
        sizes = [];
      let sharedFreed = 0;
      T.ghostModel("golf");
      T.ghostModel("mx5");
      // the shared textures: shapes' textures and the contact shadow's
      const watch = [];
      for (const k in T.SHAPE_CACHE) for (const t of [T.SHAPE_CACHE[k].bt, T.SHAPE_CACHE[k].ct]) watch.push(...Object.values(t));
      T.buildHeroCar(T.CARS[0]).G.traverse((o) => o.isMesh && o.material.map && !o.material.roughnessMap && o.material.map.image && o.material.map.image.width === 128 && watch.push(o.material.map));
      for (const t of watch) t.addEventListener("dispose", () => sharedFreed++);
      for (let i = 0; i < 8; i++) {
        T.ghostModel(i % 2 ? "mx5" : "golf");
        sizes.push(T.CAR_ENV.mats.size);
      }
      T.updateCarEnv(true);
      let reflects = 0, stale = 0;
      T.GH.m.G.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        for (const m of [].concat(o.material)) if (m.envMap) m.envMap === T.CAR_ENV.tex ? reflects++ : stale++;
      });
      return { sizes, sharedFreed, reflects, stale };
    });
    // after the first change the list stays the same size (it used to grow by three materials every change)
    expect(new Set(r.sizes.slice(2)).size, JSON.stringify(r.sizes)).toBe(1);
    expect(r.sharedFreed).toBe(0);
    expect(r.reflects).toBeGreaterThan(0);
    expect(r.stale).toBe(0);
  });

  test("choosing a photo look or a time of day redraws the reflections at once", async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    const r = await game.eval(() => {
      const T = __T;
      T.updateCarEnv(true);
      const t0 = T.CAR_ENV.t;
      T.photoEnter();
      T.photoLookSet(2);
      T.applyDayNight();
      const afterLook = T.CAR_ENV.t;
      T.photoExit();
      return { changed: afterLook > t0 };
    });
    expect(r.changed).toBe(true);
  });

  test("switching graphics to SMOOTH and back rebuilds the cars already built, in place", async ({ game, page }) => {
    await game.open();
    await game.driveOut();
    await game.park();
    const verts = () =>
      game.eval(() => {
        const T = __T,
          c = T.carMeshes[T.curId];
        return { v: c.shell.children[0].geometry.attributes.position.count, q: c.q, x: c.G.position.x, z: c.G.position.z, same: T.pc === c, all: Object.values(T.carMeshes).map((m) => m.q) };
      });
    await game.eval(() => (__T.save.gfx = 1));
    const sharp = await verts();
    await game.eval(() => __T.pauseOn());
    // SHARP → SMOOTH, then on round to AUTO
    await page.locator("#pGfx").click();
    const smooth = await verts();
    await page.locator("#pGfx").click();
    const back = await verts();
    expect(smooth.v, "vertices in SMOOTH against SHARP").toBeLessThan(sharp.v * 0.6);
    expect(smooth.all.every((q) => q === 0)).toBe(true);
    expect(smooth.same, "the car you drive is the rebuilt one").toBe(true);
    expect(Math.hypot(smooth.x - sharp.x, smooth.z - sharp.z)).toBeLessThan(0.01);
    expect(back.v).toBe(sharp.v);
    expect(back.all.every((q) => q === 1)).toBe(true);
  });
});

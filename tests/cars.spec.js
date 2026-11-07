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
});

// Fixes from Gemini's second audit pass (28 Nov 2026): the cloud dialog over the loading screen, the palms by the
// house drawn, medals by the time shown, the ghost of the record standing now, and a fade finished in a hidden tab
// pausing the game.
const { test, expect } = require("./support/game");

test("the cloud dialog and its chooser stand over the loading screen, and under the other-tab screen", async ({ game }) => {
  await game.open();
  const z = await game.eval(() => ["cloud", "cloudPick", "load", "tabIdle"].map((id) => +getComputedStyle(document.getElementById(id)).zIndex));
  expect(z[0]).toBeGreaterThan(z[2]);
  expect(z[1]).toBeGreaterThan(z[2]);
  expect(z[0]).toBeLessThan(z[3]);
});

test("the palms round the house are part of the scene", async ({ game }) => {
  await game.open();
  const n = await game.eval(() => {
    const { gW, scene } = __T, V = scene.position.constructor;
    const p = gW(-28, -4);
    let hit = 0;
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (b.max.x - b.min.x < 60 && b.containsPoint(new V(p.x, b.min.y + 1, p.z))) hit++;
    });
    return hit;
  });
  expect(n).toBeGreaterThan(0);
});

test("a time shown as the gold time is gold", async ({ game }) => {
  await game.open();
  const r = await game.eval(() => { const { medalOf } = __T, G = { gold: 60, silver: 65, bronze: 70 }; return [medalOf(60.004, G), medalOf(60.006, G), medalOf(70.004, G), medalOf(70.02, G)]; });
  expect(r).toEqual([0, 1, 2, 3]);
});

test("a ghost kept from a record since beaten isn't raced", async ({ game }) => {
  await game.open();
  const r = await game.eval(() => {
    const { EVENTS, save, ghostFor } = __T, E = EVENTS.find((e) => e.type === "tt");
    save.ghost[E.id] = { t: 80, v: 1, p: [] };
    save.rec[E.id] = 72;
    const stale = ghostFor(E);
    save.rec[E.id] = 80;
    return { stale, current: !!ghostFor(E) };
  });
  expect(r).toEqual({ stale: null, current: true });
});

test("a fade that finishes while the tab is hidden leaves the game paused", async ({ game }) => {
  await game.open();
  await game.driveOut();
  const s = await game.eval(async () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    try {
      __T.fadeThen(30, () => {});
      await new Promise((res) => setTimeout(res, 120));
      return __T.state;
    } finally { delete document.hidden; }
  });
  expect(s).toBe("PAUSE");
});

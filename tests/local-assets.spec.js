// What the game needs to start comes with it: three.js r128 from vendor/ (checked against the same hash as cdnjs's
// copy) and the Barlow fonts from fonts/. The page asks no other site for anything until you turn on cloud saves.
const { test, expect } = require("./support/game");

test("three.js and the fonts load from the game's own files, and nothing else is fetched from another site", async ({ game, page }) => {
  const asked = [];
  page.on("request", (r) => asked.push(r.url()));
  await game.open({ realFonts: true });
  await game.waitState("GARAGE");
  const r = await game.eval(async () => {
    await document.fonts.ready;
    return {
      three: typeof THREE !== "undefined" && THREE.REVISION,
      barlow: document.fonts.check("700 16px Barlow"),
      condensed: document.fonts.check("800 16px 'Barlow Condensed'"),
      loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "") + " " + f.weight),
    };
  });
  expect(r.three).toBe("128");
  expect(r.barlow).toBe(true);
  expect(r.condensed).toBe(true);
  expect(r.loaded.length).toBeGreaterThan(0);
  expect(asked.filter((u) => /\/vendor\/three\.min\.js$/.test(u)).length).toBe(1);
  expect(asked.filter((u) => /\/fonts\/[\w-]+\.woff2$/.test(u)).length).toBeGreaterThan(0);
  expect(game.external).toEqual([]);
});

test("the page's security policy allows fonts only from the game's own site", async ({ game }) => {
  await game.open();
  const csp = await game.eval(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  expect(csp).toContain("font-src 'self';");
  expect(csp).not.toMatch(/fonts\.g(oogleapis|static)\.com/);
});

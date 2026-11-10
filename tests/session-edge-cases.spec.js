const { test, expect, Game } = require("./support/game");

test("a cloud reply from a stopped tab leaves the active tab's save alone", async ({ game, page }) => {
  await page.addInitScript(() => {
    window.__cloudNoReload = true;
    const user = { uid: "audit", name: "Test player", email: "" };
    window.__cloudAdapter = {
      loaded: true, init: async () => user, signIn: async () => user,
      get: () => new Promise(resolve => { window.releaseRead = resolve; }),
    };
  });
  await game.open();
  await page.locator("#gCloud").click();
  await page.locator("#clIn").click();
  await expect.poll(() => game.eval(() => typeof window.releaseRead)).toBe("function");
  const second = await page.context().newPage();
  try {
    const next = new Game(second);
    await next.open();
    await expect(page.locator("#tabIdle")).toBeVisible();
    await next.eval(() => __T.earn(500));
    await game.eval(async () => {
      window.releaseRead({rev: 2, at: Date.now(), save: JSON.stringify({...__T.save, cr: 180000})});
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(await next.eval(() => JSON.parse(localStorage.getItem(__T.SAVE_KEY)).cr)).toBe(120500);
    await expect(second.locator("#tabIdle")).toBeHidden();
  } finally {
    await second.close();
  }
});

test("only the current Photo Mode session can show its capture", async ({ game }) => {
  await game.open();
  await game.driveOut();
  const result = await game.eval(async () => {
    const T = __T, toBlob = HTMLCanvasElement.prototype.toBlob, replies = [];
    HTMLCanvasElement.prototype.toBlob = function (cb) { replies.push(cb); };
    try {
      T.photoEnter();
      const first = T.photoCapture();
      T.photoExit();
      T.photoEnter();
      const second = T.photoCapture();
      const blob = new Blob(["test capture"], {type: "image/png"});
      replies[0](blob);
      const stalePreview = !!T.PH.shot;
      replies[1]?.(blob);
      return { first: await first, second: await second, stalePreview, preview: !!T.PH.shot };
    } finally {
      HTMLCanvasElement.prototype.toBlob = toBlob;
    }
  });
  expect(result).toEqual({first: false, second: true, stalePreview: false, preview: true});
});

test("returning to the garage restores stationary wheels and suspension", async ({ game }) => {
  await game.open();
  await game.driveOut();
  await game.park();
  const before = await game.eval(() => {
    const T = __T, p = T.P;
    p.vx = Math.sin(p.h) * 17;
    p.vz = Math.cos(p.h) * 17;
    T.driveUpdate(.016);
    const blur = T.pc.wheels[0].userData.blur.visible;
    T.goGarage(false);
    return blur;
  });
  await game.waitState("GARAGE");
  expect(before).toBe(true);
  expect(await game.eval(() => {
    const c = __T.carMeshes[__T.save.cur];
    return !c.blurOn && c.wheels.every(w =>
      w.parent.position.y === c.wr && !w.userData.blur.visible && w.userData.spokes.every(s => s.visible)
    );
  })).toBe(true);
});

test("the MX-5 brakes from a crawl and still reverses only after a fresh press", async ({ game }) => {
  await game.open({save: {v: 3, cur: "mx5", assist: false}});
  await game.driveOut();
  await game.park();
  await game.eval(() => {
    const p = __T.P;
    p.vx = Math.sin(p.h) * .3;
    p.vz = Math.cos(p.h) * .3;
  });
  expect(Math.abs((await game.steps(30, {s: true})).fwd)).toBeLessThan(.2);
  expect((await game.steps(30, {w: true})).fwd).toBeGreaterThan(8);
  await game.park();
  const back = (await game.steps(160, {s: true})).fwd;
  expect(back).toBeLessThan(-3);
  expect(back).toBeGreaterThanOrEqual(-29);
});

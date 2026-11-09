// Cloud save (optional sign-in): guests play as before; SAVE MY PROGRESS signs in (a fake Google account and cloud
// here, kept in this browser's storage so a second "device" is the same browser with the game's own data wiped);
// the first sign-in keeps the guest's progress; another device restores it; when both differ the player chooses and
// nothing is added together; it backs up by itself, says when it last did, and keeps working offline.
// The real Firebase service can't be reached from the tests: its code is checked by hand (see CLOUD_SETUP.md).
const { test, expect, Game } = require("./support/game");

const FAKE_CLOUD = () => {
  const K = "__fakeCloud",
    st = () => JSON.parse(localStorage.getItem(K) || "null") || { docs: {}, user: null, fail: false, puts: 0, acct: { uid: "u1", name: "Jo", email: "jo@example.com" } },
    keep = (s) => localStorage.setItem(K, JSON.stringify(s)),
    down = () => Promise.reject(Object.assign(new Error("offline"), { code: "unavailable" }));
  window.__cloudGap = 0;
  window.__cloudAdapter = {
    init: () => (st().fail ? down() : Promise.resolve(st().user)),
    signIn() {
      const s = st();
      if (s.fail) return down();
      s.user = s.acct;
      keep(s);
      return Promise.resolve(s.user);
    },
    signOut() {
      const s = st();
      s.user = null;
      keep(s);
      return Promise.resolve();
    },
    get: (uid) => (st().fail ? down() : Promise.resolve(st().docs[uid] || null)),
    put(uid, data, rev) {
      const s = st();
      if (s.fail) return down();
      const cur = s.docs[uid] || null;
      if (((cur && cur.rev) || 0) !== rev) return Promise.resolve({ ok: false, doc: cur });
      s.docs[uid] = Object.assign({}, data, { rev: rev + 1, at: Date.now() });
      s.puts++;
      keep(s);
      return Promise.resolve({ ok: true, rev: rev + 1 });
    },
  };
};
const cloud = (game) => game.eval(() => JSON.parse(localStorage.getItem("__fakeCloud") || "null"));
const setCloud = (game, f) =>
  game.eval((f) => {
    const s = JSON.parse(localStorage.getItem("__fakeCloud") || "null") || { docs: {}, user: null, fail: false, puts: 0, acct: { uid: "u1", name: "Jo", email: "jo@example.com" } };
    new Function("s", f)(s);
    localStorage.setItem("__fakeCloud", JSON.stringify(s));
  }, f);
const status = (game) => game.eval(() => ({ st: __T.CL.st, uid: __T.CL.meta.uid, line: document.getElementById("gCloud").textContent, stat: document.getElementById("clStat").textContent }));
// sign in from the garage: the pill opens the panel, then SIGN IN WITH GOOGLE
async function signIn(page, game) {
  await page.locator("#gCloud").click();
  await expect(page.locator("#cloud")).toBeVisible();
  await page.locator("#clIn").click();
}
// a "new device": the same browser with the game's save and cloud note wiped (the fake account and cloud stay)
async function newDevice(game) {
  await game.eval(() => {
    localStorage.removeItem(__T.SAVE_KEY);
    localStorage.removeItem(__T.CLOUD_KEY);
    const s = JSON.parse(localStorage.getItem("__fakeCloud"));
    s.user = null;
    localStorage.setItem("__fakeCloud", JSON.stringify(s));
  });
  await game.reload();
}
// progress this device has made: credits earned, a car bought, a paint colour (and customisation), a landmark
const progress = (game, cr) =>
  game.eval((cr) => {
    const T = __T;
    T.save.cr = cr;
    T.save.xp = 50000;
    T.save.owned.push("mini");
    T.save.paint.golf = 0x1d4aa8;
    // a customisation, where this version of the game has them
    if (T.save.mods) T.save.mods.golf = { wing: 4, plate: "JO 1" };
    T.save.found[Object.keys(T.save.found)[0] || "lm1"] = 1;
    T.save.ghost.e1 = { c: "golf", t: 61, d: [1, 2, 3, 4, 5, 6, 7, 8] };
    T.persist();
  }, cr);

test.describe("cloud save", () => {
  test("guests play as before: no sign-in in the way, and nothing is downloaded until SAVE MY PROGRESS is opened", async ({ game, page }) => {
    await game.open();
    const r = await game.eval(() => ({
      fb: [...document.scripts].some((s) => /firebase/.test(s.src)),
      lcloud: !document.getElementById("lcloud").classList.contains("hide"),
      label: document.getElementById("lstart").textContent,
      st: __T.CL.st,
    }));
    expect(r).toEqual({ fb: false, lcloud: false, label: "PLAY AS GUEST", st: "guest" });
    // the test server isn't the game's own site, where Google accepts sign-ins: the panel says where it works
    await game.eval(() => __T.clOpen());
    await expect(page.locator("#clStat")).toHaveText(/joyeechuah\.github\.io\/white-isle-drive/);
    await expect(page.locator("#clIn")).toBeDisabled();
    expect(await game.eval(() => [...document.scripts].some((s) => /firebase/.test(s.src)))).toBe(false);
    await game.key("Escape");
    await expect(page.locator("#cloud")).toBeHidden();
    expect(await game.eval(() => __T.state)).toBe("GARAGE");
  });

  test("first sign-in keeps the guest's progress: it goes to the account, and the time of the backup shows", async ({ game, page }) => {
    await page.addInitScript(FAKE_CLOUD);
    await game.open();
    await expect(page.locator("#gCloud")).toHaveText("SAVE MY PROGRESS");
    await progress(game, 345678);
    await signIn(page, game);
    await expect.poll(() => status(game).then((s) => s.st)).toBe("synced");
    const c = await cloud(game),
      doc = c.docs.u1,
      sv = JSON.parse(doc.save);
    expect(sv.cr).toBe(345678);
    expect(sv.owned).toContain("mini");
    expect(sv.paint.golf).toBe(0x1d4aa8);
    if (sv.mods) expect(sv.mods.golf).toEqual({ wing: 4, plate: "JO 1" });
    // ghost laps stay on the device (they can pass the cloud's size limit)
    expect(sv.ghost).toBeUndefined();
    expect(doc.summary).toMatchObject({ cr: 345678, cars: 6 });
    const s = await status(game);
    expect(s.line).toBe("BACKED UP JUST NOW");
    expect(s.stat).toMatch(/Last backed up: .*just now/);
    await expect(page.locator("#clWho")).toContainText("Jo");
  });

  test("on another device, signing in brings the account's progress back", async ({ game, page }) => {
    await page.addInitScript(FAKE_CLOUD);
    await game.open();
    await progress(game, 222333);
    await signIn(page, game);
    await expect.poll(() => status(game).then((s) => s.st)).toBe("synced");
    await newDevice(game);
    expect(await game.eval(() => __T.save.cr)).toBe(120000);
    await signIn(page, game);
    // the game starts again from the account's save
    await page.waitForEvent("load");
    await game.boot();
    const r = await game.eval(() => ({ cr: __T.save.cr, mini: __T.save.owned.includes("mini"), paint: __T.save.paint.golf, uid: __T.CL.meta.uid }));
    expect(r).toEqual({ cr: 222333, mini: true, paint: 0x1d4aa8, uid: "u1" });
    await expect.poll(() => status(game).then((s) => s.st)).toBe("synced");
    // and nothing was asked: a device with no progress of its own just takes the account's
    await expect(page.locator("#cloudPick")).toBeHidden();
  });

  for (const keep of ["device", "account"]) {
    test(`when this device and the account differ, the player chooses (${keep}); credits are never added together`, async ({ game, page }) => {
      await page.addInitScript(FAKE_CLOUD);
      await game.open();
      // the account already has progress from elsewhere: 500,000 credits
      await setCloud(game, `const sv=JSON.parse(JSON.stringify(__T.save));sv.cr=500000;sv.xp=90000;sv.owned=sv.owned.concat(["tt"]);delete sv.ghost;s.docs.u1={save:JSON.stringify(sv),rev:3,at:Date.now()-3600e3};`);
      // and this guest has 300,000 of their own
      await progress(game, 300000);
      await signIn(page, game);
      await expect(page.locator("#cloudPick")).toBeVisible();
      await expect(page.locator("#cpkDev")).toContainText("300,000");
      await expect(page.locator("#cpkAcc")).toContainText("500,000");
      await expect(page.locator("#cpkAcc")).toContainText("Saved 1 h ago");
      if (keep === "device") {
        await page.locator("#cpkKeepDev").click();
        await expect.poll(() => status(game).then((s) => s.st)).toBe("synced");
        const sv = JSON.parse((await cloud(game)).docs.u1.save);
        expect(sv.cr).toBe(300000);
        expect(sv.owned).not.toContain("tt");
        expect(await game.eval(() => __T.save.cr)).toBe(300000);
      } else {
        await page.locator("#cpkKeepAcc").click();
        await page.waitForEvent("load");
        await game.boot();
        const r = await game.eval(() => ({ cr: __T.save.cr, tt: __T.save.owned.includes("tt"), mini: __T.save.owned.includes("mini"), ghost: !!__T.save.ghost.e1 }));
        // exactly the account's credits and cars; this device's ghost laps stay
        expect(r).toEqual({ cr: 500000, tt: true, mini: false, ghost: true });
        // and the account still holds exactly its own progress
        await expect.poll(() => status(game).then((s) => s.st)).toBe("synced");
        const acc = JSON.parse((await cloud(game)).docs.u1.save);
        expect([acc.cr, acc.owned.includes("tt"), acc.owned.includes("mini")]).toEqual([500000, true, false]);
      }
    });
  }

  test("signed in, progress backs itself up a few seconds after it changes; offline it waits, keeps the copy here, and catches up", async ({ game, page }) => {
    await page.addInitScript(FAKE_CLOUD);
    await game.open();
    await signIn(page, game);
    await expect.poll(() => status(game).then((s) => s.st)).toBe("synced");
    await game.eval(() => __T.earn(12345));
    await expect.poll(() => cloud(game).then((c) => JSON.parse(c.docs.u1.save).cr), { timeout: 10000 }).toBe(132345);
    // offline: the change stays on this device, and the pill says when the last backup was
    await setCloud(game, "s.fail=true;");
    await game.eval(() => __T.earn(1000));
    await expect.poll(() => status(game).then((s) => s.st), { timeout: 10000 }).toBe("offline");
    const s = await status(game);
    expect(s.line).toMatch(/^OFFLINE · LAST BACKED UP/);
    expect(await game.eval(() => JSON.parse(localStorage.getItem(__T.SAVE_KEY)).cr)).toBe(133345);
    // back online: it catches up
    await setCloud(game, "s.fail=false;");
    await game.eval(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => cloud(game).then((c) => JSON.parse(c.docs.u1.save).cr), { timeout: 10000 }).toBe(133345);
    await expect.poll(() => status(game).then((s) => s.st)).toBe("synced");
  });

  test("another device saved meanwhile: the next backup doesn't overwrite it, the player chooses (after the drive, not during it)", async ({ game, page }) => {
    await page.addInitScript(FAKE_CLOUD);
    await game.open();
    await signIn(page, game);
    await expect.poll(() => status(game).then((s) => s.st)).toBe("synced");
    // this device earns 5,000 while the backup can't get through
    await setCloud(game, "s.fail=true;");
    await game.eval(() => __T.earn(5000));
    await expect.poll(() => status(game).then((s) => s.st), { timeout: 10000 }).toBe("offline");
    // meanwhile another device backs up 900,000 credits
    await setCloud(game, `s.fail=false;const sv=JSON.parse(s.docs.u1.save);sv.cr=900000;sv.xp=1e6;s.docs.u1.save=JSON.stringify(sv);s.docs.u1.rev++;`);
    await page.locator("#clClose").click();
    await game.driveOut();
    await game.eval(() => __T.clSync());
    await expect.poll(() => status(game).then((s) => s.st)).toBe("conflict");
    // not over the drive: the choice waits for the pause menu
    await expect(page.locator("#cloudPick")).toBeHidden();
    expect(JSON.parse((await cloud(game)).docs.u1.save).cr).toBe(900000);
    await game.key("Escape");
    await game.waitState("PAUSE");
    await game.eval(() => __T.clOpen());
    await expect(page.locator("#cloudPick")).toBeVisible();
    await expect(page.locator("#cpkAcc")).toContainText("900,000");
    await expect(page.locator("#cpkDev")).toContainText("125,000");
  });

  test("signing out stops the backups and keeps the progress on this device; failures to sign in leave the game as it was", async ({ game, page }) => {
    await page.addInitScript(FAKE_CLOUD);
    await game.open();
    await setCloud(game, "s.fail=true;");
    await signIn(page, game);
    await expect.poll(() => status(game).then((s) => s.st)).toBe("offline");
    await expect(page.locator("#clStat")).toContainText("offline");
    expect(await game.eval(() => __T.state)).toBe("GARAGE");
    await setCloud(game, "s.fail=false;");
    await page.locator("#clIn").click();
    await expect.poll(() => status(game).then((s) => s.st)).toBe("synced");
    await page.locator("#clOut").click();
    await expect.poll(() => status(game).then((s) => s.uid)).toBe(null);
    const puts = (await cloud(game)).puts;
    await game.eval(() => __T.earn(777));
    await page.waitForTimeout(5000);
    expect((await cloud(game)).puts).toBe(puts);
    expect(await game.eval(() => __T.save.cr)).toBe(120777);
    await expect(page.locator("#gCloud")).toHaveText("SAVE MY PROGRESS");
  });

  test("the start screen: PLAY AS GUEST, or SAVE MY PROGRESS; once signed in it says PLAY and when it last backed up", async ({ game, page }) => {
    await page.addInitScript(FAKE_CLOUD);
    await game.open({ autostart: false });
    await expect(page.locator("#lstart")).toBeVisible({ timeout: 240000 });
    await expect(page.locator("#lstart")).toHaveText("PLAY AS GUEST");
    await expect(page.locator("#lcloud")).toBeVisible();
    // as plain to see as PLAY AS GUEST: the same size, a filled button (it was an outline), and a line saying what it's for
    const look = await game.eval(() => {
      const a = document.getElementById("lstart").getBoundingClientRect(),
        b = document.getElementById("lcloud").getBoundingClientRect();
      return { w: [Math.round(a.width), Math.round(b.width)], h: [Math.round(a.height), Math.round(b.height)], bg: getComputedStyle(document.getElementById("lcloud")).backgroundColor };
    });
    expect(look.w[1]).toBe(look.w[0]);
    expect(look.h[1]).toBe(look.h[0]);
    expect(look.bg).toBe("rgb(255, 255, 255)");
    await expect(page.locator("#lcl")).toContainText("Sign in with Google");
    await page.locator("#lcloud").click();
    await game.waitState("GARAGE");
    await expect(page.locator("#cloud")).toBeVisible();
    await page.locator("#clIn").click();
    await expect.poll(() => status(game).then((s) => s.st)).toBe("synced");
    await page.reload();
    await expect(page.locator("#lstart")).toHaveText("PLAY", { timeout: 240000 });
    await expect(page.locator("#lcloud")).toBeHidden();
    await expect(page.locator("#lcl")).toContainText("Signed in as Jo");
  });
});

test.describe("one game tab at a time", () => {
  test("a second tab takes over; the first stops and saves nothing, so credits earned in either aren't lost; PLAY IN THIS TAB switches back", async ({ game, page }) => {
    await game.open();
    const page2 = await page.context().newPage(),
      game2 = new Game(page2);
    await game2.open();
    // the first tab stops and says why
    await expect(page.locator("#tabIdle")).toBeVisible();
    await expect(page2.locator("#tabIdle")).toBeHidden();
    const stored = (g) => g.eval(() => JSON.parse(localStorage.getItem(__T.SAVE_KEY)).cr);
    // earn 100 in the new tab, then the old one tries to earn 50: the old one writes nothing
    await game2.eval(() => __T.earn(100));
    await game.eval(() => __T.earn(50));
    expect(await stored(game2)).toBe(120100);
    // it used to come out at 120,050 (the old tab's copy over the new one's)
    await game2.eval(() => __T.earn(25));
    expect(await stored(game2)).toBe(120125);
    // the game's keys do nothing in the stopped tab (Enter would press its focused PLAY IN THIS TAB, as on any page)
    await game.key("ArrowRight");
    await game.key("Escape");
    expect(await game.eval(() => __T.state)).toBe("GARAGE");
    // play in the first tab again: it reloads with the latest save, and the second tab stops
    await page.locator("#tiHere").click();
    await page.waitForEvent("load");
    await game.boot();
    expect(await game.eval(() => __T.save.cr)).toBe(120125);
    await expect(page2.locator("#tabIdle")).toBeVisible();
    await game.eval(() => __T.earn(5));
    await game2.eval(() => __T.earn(1000));
    expect(await stored(game)).toBe(120130);
    await page2.close();
  });
});

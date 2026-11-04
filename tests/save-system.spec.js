// Saves: progress loads back exactly, a save from the first public release (27 Oct 2026) keeps everything, a
// corrupt or malformed save never breaks the game, and a browser that refuses storage is handled.
const fs = require("fs");
const path = require("path");
const { test, expect, SAVE_KEY } = require("./support/game");

const V1027 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "save-2026-10-27.json"), "utf8"));

const loaded = (game) =>
  game.eval(() => {
    const s = __T.save;
    return JSON.parse(JSON.stringify(s));
  });

test.describe("save system", () => {
  test("progress written by the game loads back exactly after a reload", async ({ game }) => {
    await game.open();
    await game.driveOut();
    await game.eval(() => {
      const T = __T,
        s = T.save;
      s.cr = 345678;
      s.owned.push("m3", "amggt");
      s.paint.m3 = 0x123456;
      s.rec.cubells = 41.25;
      s.found[T.LANDMARKS[0].id] = 1;
      s.jobs.parcel = 2;
      s.jobs.runs[T.JOBS[0].id] = 2;
      s.todMode = 4;
      s.assist = false;
      s.music = false;
      s.gfx = 2;
      T.persist();
    });
    const before = await loaded(game);
    await game.reload();
    expect(await loaded(game)).toEqual(before);
  });

  test("a save from the 27 Oct 2026 release keeps its credits, cars, paint and settings", async ({ game }) => {
    // exactly the string that release stored
    await game.open({ save: V1027.raw });
    const s = await loaded(game);
    const old = V1027.save;
    expect(s.cr).toBe(old.cr);
    expect(s.owned).toEqual(old.owned);
    expect(s.cur).toBe(old.cur);
    expect(s.paint).toEqual(old.paint);
    expect({ assist: s.assist, sound: s.sound, todMode: s.todMode }).toEqual({ assist: old.assist, sound: old.sound, todMode: old.todMode });
    // what the release didn't have yet starts empty or at its default
    expect({ found: s.found, passBonus: s.passBonus, music: s.music, gfx: s.gfx, auto: s.auto, jobActive: s.jobActive }).toEqual({
      found: {},
      passBonus: false,
      music: true,
      gfx: 0,
      auto: false,
      jobActive: null,
    });
    expect(s.jobs).toEqual({ parcel: 0, courier: 0, tour: 0, failed: 0, abandoned: 0, earned: 0, runs: {} });
    // the garage shows the car that was chosen in that release
    expect(await game.eval(() => __T.curId)).toBe(old.cur);
  });

  test("a corrupt save starts a fresh game without errors", async ({ game, page }) => {
    for (const raw of ["{not json", "[1,2,3]", '"just a string"', "null", "12"]) {
      await game.open({ save: raw });
      const s = await loaded(game);
      expect({ cr: s.cr, owned: s.owned, cur: s.cur }, raw).toEqual({ cr: 120000, owned: ["golf", "mx5", "mustang", "rrsport", "gtr"], cur: "golf" });
      await game.driveOut();
      expect(await game.state()).toBe("DRIVE");
      await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
    }
  });

  test("malformed values are made safe: numbers in range, only known cars, valid colours, no extra fields", async ({ game }) => {
    const bad = {
      v: 3,
      cr: -500,
      xp: "lots",
      owned: ["golf", "golf", "batmobile", "m3", 42, "amggt", "tt", "viper", "r8", "urus", "gt3", "f488", "huracan", "mclaren", "apollo", "ccx"],
      cur: "batmobile",
      paint: { golf: -1, m3: 0x1000000, amggt: "red", tt: 0xff0000 },
      rec: { cubells: -3, talaia: "fast", oldtown: 33.3, south: Infinity },
      radar: { r1: NaN, r2: 210 },
      auto: "yes",
      assist: 0,
      sound: null,
      music: "off",
      gfx: 7.6,
      todMode: 99,
      tod: 1e9,
      found: { a: 1, b: 0, c: "1", d: true },
      passBonus: "true",
      jobs: { parcel: -4, courier: 2.6, tour: "x", runs: { a: 1, b: -1, c: 1.5 } },
      jobActive: { id: 7 },
      admin: true,
    };
    // keys named __proto__ straight from storage must not reach any object's prototype
    const raw = JSON.stringify(bad).replace(/^\{/, '{"__proto__":{"polluted":true},').replace('"found":{', '"found":{"__proto__":{"polluted":true},');
    await game.open({ save: raw });
    const s = await loaded(game);
    expect(s.cr).toBe(0);
    expect(s.xp).toBe(0);
    expect(s.owned).toEqual(["golf", "m3", "amggt", "tt", "viper", "r8", "urus", "gt3", "f488", "huracan", "mclaren", "apollo"]);
    expect(s.owned.length).toBeLessThanOrEqual(12);
    expect(s.owned).toContain(s.cur);
    expect(s.paint).toEqual({ tt: 0xff0000 });
    expect(s.rec).toEqual({ oldtown: 33.3 });
    expect(s.radar).toEqual({ r2: 210 });
    expect([s.auto, s.assist, s.sound, s.music, s.passBonus]).toEqual([false, true, true, true, false]);
    expect(s.gfx).toBeGreaterThanOrEqual(0);
    expect(s.gfx).toBeLessThanOrEqual(2);
    expect(s.todMode).toBe(4);
    expect(s.tod).toBeLessThan(24);
    expect(s.found).toEqual({ a: 1, d: 1 });
    expect(s.jobs).toEqual({ parcel: 0, courier: 3, tour: 0, failed: 0, abandoned: 0, earned: 0, runs: { a: 1 } });
    expect(s.jobActive).toBeNull();
    expect(s.admin).toBeUndefined();
    expect(await game.eval(() => [({}).polluted, __T.save.polluted, __T.save.found.polluted, Object.getPrototypeOf(__T.save.found) === Object.prototype])).toEqual([undefined, undefined, undefined, true]);
    await game.driveOut();
    expect(await game.state()).toBe("DRIVE");
  });

  test("only the game's own key is used; the old Claude-artifact key is not read on GitHub", async ({ game }) => {
    await game.open();
    await game.eval(() => {
      localStorage.setItem("tdu2-ibiza-v1", JSON.stringify({ cr: 999999999, owned: ["chiron"] }));
    });
    await game.reload();
    const s = await loaded(game);
    expect(s.cr).toBe(120000);
    expect(s.owned).not.toContain("chiron");
    await game.eval(() => __T.persist());
    const keys = await game.eval(() => Object.keys(localStorage).filter((k) => k !== "tdu2-ibiza-v1"));
    expect(keys).toEqual([SAVE_KEY]);
  });

  test("when the browser refuses to store progress the game carries on and says so once", async ({ game, page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      };
      // every message from the very start
      window.__allToasts = [];
      document.addEventListener("DOMContentLoaded", () => {
        new MutationObserver((ms) => {
          for (const m of ms) for (const n of m.addedNodes) if (n.querySelector && n.querySelector("b")) window.__allToasts.push(n.querySelector("b").textContent);
        }).observe(document.getElementById("toasts"), { childList: true });
      });
    });
    await game.open();
    await game.driveOut();
    await game.eval(() => {
      __T.persist();
      __T.earn(100);
      __T.persist();
    });
    const msgs = await game.eval(() => new Promise((r) => setTimeout(() => r(window.__allToasts.filter((t) => t === "PROGRESS NOT SAVED")), 0)));
    expect(msgs).toHaveLength(1);
    expect(await game.state()).toBe("DRIVE");
    expect(await game.eval(() => __T.save.cr)).toBe(120100);
  });
});

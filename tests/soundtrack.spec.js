const { test, expect } = require("./support/game");

test("a slow song requested at audio time zero starts the backup after four seconds", async ({ game, page }) => {
  await page.addInitScript(() => {
    const fetchFile = window.fetch;
    window.fetch = (url, ...args) => String(url).endsWith(".mp3") ? new Promise(() => {}) : fetchFile(url, ...args);
  });
  await game.open();
  await page.mouse.click(2, 2);
  await game.eval(() => { __T.SONGS.lounge.askT = 0; });
  await expect.poll(() => game.eval(() => __T.MUSIC.playing()), { timeout: 12000 }).toContain("lounge");
});

test("a transient soundtrack failure retries only after its deadline and recovers", async ({ game, page }) => {
  await page.addInitScript(() => {
    const fetchFile = window.fetch;
    window.loungeRequests = 0;
    window.fetch = (url, ...args) => {
      if (String(url).endsWith("showroom.mp3") && ++window.loungeRequests === 1) {
        return Promise.reject(new Error("temporary outage"));
      }
      return fetchFile(url, ...args);
    };
  });
  await game.open();
  const beforeRetry = await game.eval(() => {
    const song = __T.SONGS.lounge;
    song.retryAt = performance.now() + 30000;
    __T.songFetch("lounge");
    const requests = window.loungeRequests;
    song.retryAt = performance.now() - 1;
    __T.songFetch("lounge");
    return requests;
  });
  expect(beforeRetry).toBe(1);
  await expect.poll(() => game.eval(() => __T.SONGS.lounge.st)).toBe("fetched");
  expect(await game.eval(() => window.loungeRequests)).toBe(2);
});

test("photo lighting presets preserve the driving soundtrack", async ({ game }) => {
  await game.open();
  await game.driveOut();
  const tracks = await game.eval(() => {
    const T = __T, tracks = [];
    for (const [hour, look] of [[13, 2], [22.5, 1]]) {
      T.save.tod = hour;
      T.applyDayNight();
      T.photoEnter();
      T.photoLookSet(look);
      tracks.push(T.musicWant()[0]);
      T.photoExit();
      tracks.push(T.musicWant()[0]);
    }
    return tracks;
  });
  expect(tracks).toEqual(["coast", "coast", "night", "night"]);
});

test("a title cue fades out even when the next recording is still loading", async ({ game, page }) => {
  await page.addInitScript(() => {
    const fetchFile = window.fetch;
    window.fetch = (url, ...args) => String(url).endsWith("showroom.mp3")
      ? new Promise(() => {}) : fetchFile(url, ...args);
  });
  await game.open();
  await page.mouse.click(2, 2);
  await game.eval(() => __T.setState("LOAD"));
  await expect.poll(() => game.eval(() => !!__T.SONGS.title.p), { timeout: 15000 }).toBe(true);
  const fading = await game.eval(() => {
    __T.setState("GARAGE");
    __T.musicTick();
    return !!__T.SONGS.title.p.end;
  });
  expect(fading).toBe(true);
});

test("a stalled soundtrack response body times out and can be retried", async ({ game, page }) => {
  await game.open();
  await page.clock.install();
  await game.eval(() => {
    const fetchFile = window.fetch;
    window.raceRequests = 0;
    window.fetch = (url, options) => {
      if (String(url).endsWith("highway.mp3") && ++window.raceRequests === 1) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => new Promise((resolve, reject) => {
            options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          }),
        });
      }
      return fetchFile(url, options);
    };
    __T.songFetch("race");
  });
  await page.clock.fastForward(120001);
  expect(await game.eval(() => __T.SONGS.race.st)).toBe("failed");
  await game.eval(() => __T.songFetch("race"));
  expect(await game.eval(() => window.raceRequests)).toBe(1);
  await page.clock.fastForward(3001);
  await game.eval(() => __T.songFetch("race"));
  await expect.poll(() => game.eval(() => __T.SONGS.race.st)).toBe("fetched");
  expect(await game.eval(() => window.raceRequests)).toBe(2);
});

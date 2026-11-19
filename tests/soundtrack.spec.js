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

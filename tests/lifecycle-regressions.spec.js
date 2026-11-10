const { test, expect } = require("./support/game");

test("finished rivals slow to a complete stop and keep their finish time", async ({ game }) => {
  await game.open();
  await game.driveOut();
  const result = await game.eval(() => {
    const T = __T, E = T.EVENTS.find(e => e.type === "race");
    T.startEvent(E);
    for (const t of T.TRAFFIC) { t.e = null; t.lost = false; }
    const a = T.ev.ai[0];
    T.ev.ai = [a]; T.ev.phase = "run"; T.ev.t = 30;
    E.vp.fill(60);
    Object.assign(a, { s: E.route.len + 1, v: 30, vmax: 60, acc: 10, sk: 1, fin: 29 });
    let accelerating = false, previous = a.v;
    for (let i = 0; i < 900; i++) {
      T.updateEvent(1 / 60);
      if (a.v > previous + 1e-10) accelerating = true;
      previous = a.v;
    }
    const stoppedAt = a.s;
    for (let i = 0; i < 60; i++) T.updateEvent(1 / 60);
    return { accelerating, speed: a.v, stoppedAt, finalAt: a.s, finish: a.fin };
  });
  expect(result.accelerating).toBe(false);
  expect(result.speed).toBe(0);
  expect(result.finalAt).toBe(result.stoppedAt);
  expect(result.finish).toBe(29);
});

test("failed traffic placement hides the car and schedules retries", async ({ game }) => {
  await game.open();
  const initiallyHidden = await game.eval(() => __T.TRAFFIC.every(t => !t.e && t.lost && !t.c.G.visible));
  expect(initiallyHidden).toBe(true);
  await game.driveOut();
  const result = await game.eval(() => {
    const T = __T, car = T.TRAFFIC[0];
    for (const t of T.TRAFFIC) { t.e = null; t.lost = false; }
    const placed = T.spawnTraffic(car, 1e9, 1e9 + 1, false);
    const failed = { placed, road: car.e, retry: car.lost, visible: car.c.G.visible };
    const random = Math.random;
    let samples = 0;
    Math.random = () => { samples++; return random(); };
    try { T.updateTraffic(.6); } finally { Math.random = random; }
    const recovered = T.spawnTraffic(car, 0, Infinity, false);
    return { failed, samples, recovered, road: !!car.e, retry: car.lost };
  });
  expect(result.failed).toEqual({ placed: false, road: null, retry: true, visible: false });
  expect(result.samples).toBeGreaterThan(0);
  expect(result.recovered).toBe(true);
  expect(result.road).toBe(true);
  expect(result.retry).toBe(false);
});

test("tab takeover cancels pending fade work and stops frames and music", async ({ game }) => {
  await game.open();
  await game.driveOut();
  const result = await game.eval(async () => {
    const T = __T;
    let callback = false;
    T.fadeThen(30, () => { callback = true; });
    T.tabStop();
    await new Promise(resolve => setTimeout(resolve, 80));
    const render = T.renderer.render, raf = window.requestAnimationFrame;
    let draws = 0;
    T.renderer.render = () => { draws++; };
    window.requestAnimationFrame = () => 0;
    const position = [T.P.x, T.P.z], time = T.skyClock;
    try { T.frame(performance.now()); } finally {
      T.renderer.render = render; window.requestAnimationFrame = raf;
    }
    T.fadeThen(0, () => { callback = true; });
    await new Promise(resolve => setTimeout(resolve, 10));
    return { callback, idle: T.tabIdle, state: T.state, draws, position,
      after: [T.P.x, T.P.z], time, afterTime: T.skyClock, music: T.musicWant() };
  });
  expect(result).toMatchObject({ callback: false, idle: true, state: "FADE", draws: 0, music: [null, 0] });
  expect(result.after).toEqual(result.position);
  expect(result.afterTime).toBe(result.time);
});

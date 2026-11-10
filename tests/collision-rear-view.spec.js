const { test, expect } = require("./support/game");

async function driving(game) {
  await game.open();
  await game.driveOut();
  await game.park();
}

test("rear-ending traffic transfers speed and damages both cars, while a gentle bump does no damage", async ({ game }) => {
  await driving(game);
  const result = await game.eval(() => {
    const T = __T, P = T.P, traffic = T.TRAFFIC[0];
    for (const other of T.TRAFFIC) other.wx = other.wz = 1e6;
    const sin = Math.sin(P.h), cos = Math.cos(P.h);
    const hit = speed => {
      traffic.wx = P.x + sin * 3.1;
      traffic.wz = P.z + cos * 3.1;
      traffic.yaw = P.h;
      traffic.v = 4;
      P.vx = sin * speed;
      P.vz = cos * speed;
      T.collidePlayer();
      return { player: P.damage || 0, npc: traffic.damage || 0, playerSpeed: Math.hypot(P.vx, P.vz), npcSpeed: traffic.v };
    };
    return { soft: hit(5), hard: hit(20) };
  });
  expect(result.soft).toMatchObject({ player: 0, npc: 0 });
  expect(result.hard.player).toBeGreaterThan(0);
  expect(result.hard.npc).toBeGreaterThan(0);
  expect(result.hard.playerSpeed).toBeLessThan(20);
  expect(result.hard.npcSpeed).toBeGreaterThan(4);
});

test("an NPC traffic collision affects both vehicles without player contact", async ({ game }) => {
  await driving(game);
  const result = await game.eval(() => {
    const T = __T, e = T.EDGES.find(e => e.type === "main" && e.len > 70) || T.EDGES.find(e => e.len > 70);
    for (const car of T.TRAFFIC) { car.e = null; car.lost = false; car.wx = car.wz = 1e6; }
    const [back, front] = T.TRAFFIC;
    for (const [car, s, v] of [[back, e.len / 2, 20], [front, e.len / 2 + 3, 2]]) {
      const p = T.edgePos(e, s);
      Object.assign(car, {e, s, dir: 1, v, base: v, lane: 0, off: 0, offCur: 0, wx: p.x, wz: p.z, yaw: Math.atan2(p.dx, p.dz)});
    }
    T.updateTraffic(.016);
    return [back.damage || 0, front.damage || 0];
  });
  expect(result[0]).toBeGreaterThan(0);
  expect(result[1]).toBeGreaterThan(0);
});

test("race rivals take damage and a new race resets it for everyone", async ({ game }) => {
  await driving(game);
  const result = await game.eval(() => {
    const T = __T, P = T.P, race = T.EVENTS.find(e => e.type === "race");
    for (const car of T.TRAFFIC) car.wx = car.wz = 1e6;
    T.startEvent(race);
    const a = T.ev.ai[0], sin = Math.sin(P.h), cos = Math.cos(P.h);
    a.x = P.x + sin * 3.1; a.z = P.z + cos * 3.1; a.yaw = P.h; a.v = 4;
    P.vx = sin * 22; P.vz = cos * 22;
    T.collidePlayer();
    const damaged = [P.damage || 0, a.damage || 0];
    T.startEvent(race);
    return { damaged, fresh: [P.damage || 0, ...T.ev.ai.map(car => car.damage || 0)] };
  });
  expect(result.damaged.every(amount => amount > 0)).toBe(true);
  expect(result.fresh).toEqual([0, 0, 0, 0]);
});

test("damage costs acceleration, shows a warning and clears at the garage", async ({ game, page }) => {
  await driving(game);
  const run = async damage => {
    await game.park();
    await game.eval(damage => {
      __T.P.damage = damage;
      __T.P.thr = 0;
      __T.save.assist = false;
    }, damage);
    return (await game.steps(45, { w: true })).fwd;
  };
  const clean = await run(0), damaged = await run(75);
  expect(damaged).toBeGreaterThan(0);
  expect(damaged).toBeLessThan(clean * .85);
  await expect(page.locator("#damageHud")).toHaveText("DAMAGE 75%");
  expect(await game.eval(() => __T.pc.damageSmoke.visible)).toBe(true);
  await game.eval(() => __T.goGarage(true));
  await game.waitState("GARAGE");
  expect(await game.eval(() => ({ damage: __T.P.damage, smoke: __T.pc.damageSmoke.visible }))).toEqual({ damage: 0, smoke: false });
});

test("keyboard, pointer and controller can hold a rear view without changing the camera preset", async ({ game, page }) => {
  await page.addInitScript(() => {
    const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, () => ({pressed: false, value: 0})) };
    window.testPad = pad;
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] });
  });
  await driving(game);
  const direction = () => game.eval(() => {
    const T = __T, v = T.camera.getWorldDirection(new THREE.Vector3());
    return v.x * Math.sin(T.P.h) + v.z * Math.cos(T.P.h);
  });
  const facing = value => expect.poll(direction).toBeGreaterThan(value);
  const facingBack = () => expect.poll(direction).toBeLessThan(-.8);
  const preset = await game.eval(() => __T.save.cam);
  await page.keyboard.down("b");
  await facingBack();
  await page.keyboard.up("b");
  await facing(.8);
  const button = page.locator("#chRear"), box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await facingBack();
  await page.mouse.up();
  await facing(.8);
  await game.eval(() => { window.testPad.buttons[4].pressed = true; });
  await facingBack();
  await game.eval(() => { window.testPad.buttons[4].pressed = false; });
  await facing(.8);
  expect(await game.eval(() => __T.save.cam)).toBe(preset);
});

test.describe("touch rear view", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("holding REAR with another finger keeps the throttle active", async ({ game, page }) => {
    await driving(game);
    const cdp = await page.context().newCDPSession(page);
    const point = async (id, selector) => {
      const b = await page.locator(selector).boundingBox();
      return { id, x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const gas = await point(1, "#bG"), rear = await point(2, "#chRear");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [gas] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [gas, rear] });
    await expect(page.locator("#chRear")).toHaveAttribute("aria-pressed", "true");
    expect(await game.eval(() => __T.pad.G)).toBe(true);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [rear] });
    await expect(page.locator("#chRear")).toHaveAttribute("aria-pressed", "false");
    expect(await game.eval(() => __T.pad.G)).toBe(true);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  });
});

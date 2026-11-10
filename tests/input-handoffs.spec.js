const { test, expect } = require("./support/game");

test("entering the dealership with controller X requires a new press to test drive", async ({ game, page }) => {
  await page.addInitScript(() => {
    const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.handoffPad = pad;
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] });
  });
  await game.open();
  await game.driveOut();
  const result = await game.eval(() => {
    const T = __T, button = window.handoffPad.buttons[2];
    T.P.x = T.DEALER_MARK.x; T.P.z = T.DEALER_MARK.z; T.P.vx = T.P.vz = 0;
    T.updatePrompt();
    const prompt = document.getElementById("promptTxt").textContent;
    button.pressed = true; button.value = 1; T.pollPad();
    const entered = { state: T.state, testDrive: !!T.testDrive };
    T.pollPad();
    const held = { state: T.state, testDrive: !!T.testDrive };
    button.pressed = false; button.value = 0; T.pollPad();
    button.pressed = true; button.value = 1; T.pollPad();
    const pressedAgain = { state: T.state, testDrive: !!T.testDrive };
    button.pressed = false; button.value = 0; T.pollPad();
    return { prompt, entered, held, pressedAgain };
  });
  expect(result.prompt).toContain("Auto Gallery");
  expect(result.entered).toEqual({ state: "DEALER", testDrive: false });
  expect(result.held).toEqual(result.entered);
  expect(result.pressedAgain).toEqual({ state: "DRIVE", testDrive: true });
});

for (const release of ["pointerup", "pointercancel", "lostpointercapture"]) {
  test(`garage pinch keeps its zoom when a participating finger leaves via ${release}`, async ({ game }) => {
    await game.open();
    const result = await game.eval(release => {
      const G = __T.GO, canvas = document.getElementById("c");
      const fire = (type, pointerId, x) => canvas.dispatchEvent(new PointerEvent(type, {
        pointerId, pointerType: "touch", button: 0, clientX: x, clientY: 100, bubbles: true,
      }));
      fire("pointerdown", 41, 100); fire("pointerdown", 42, 200);
      fire("pointermove", 42, 225);
      const before = G.zoom;
      fire("pointerdown", 43, 500);
      fire("pointermove", 43, 550); // the third finger is not part of the current pinch
      const thirdFinger = G.zoom;
      fire(release, 41, 100);
      fire("pointermove", 43, 550); // unchanged coordinates must not change zoom
      const after = G.zoom;
      fire("pointermove", 43, 600);
      const zoomed = G.zoom;
      fire(release, 42, 225);
      const yaw = G.yaw;
      fire("pointermove", 43, 610);
      const turned = G.yaw !== yaw;
      fire(release, 43, 610);
      return { before, thirdFinger, after, zoomed, turned, pointers: G.ptr.size, pinch: G.pinch, last: G.last };
    }, release);
    expect(result.thirdFinger).toBeCloseTo(result.before, 10);
    expect(result.after).toBeCloseTo(result.before, 10);
    expect(result.zoomed).toBeLessThan(result.after);
    expect(result.turned).toBe(true);
    expect(result).toMatchObject({ pointers: 0, pinch: null, last: null });
  });
}

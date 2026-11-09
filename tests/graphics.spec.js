const { test, expect } = require("./support/game");

test("changing graphics quality preserves a paused test drive's paint and pose", async ({ game }) => {
  await game.open({ save: { v: 3, gfx: 1 } });
  const result = await game.eval(() => {
    const T = __T, rental = T.CARS.find(car => !T.save.owned.includes(car.id));
    T.openDealer(rental.id);
    document.querySelector("#dSw button:last-child").click();
    T.startTestDrive(rental.id);
    T.pauseOn();
    const old = T.pc;
    old.inside.visible = true;
    old.shell.visible = old.glass.visible = false;
    old.blurOn = true;
    old.wheels[0].rotation.x = .7;
    old.wheels[0].parent.position.y += .04;
    old.wheels[0].userData.blur.visible = true;
    old.wheels[0].userData.spokes.forEach(spoke => { spoke.visible = false; });
    old.front[0].rotation.y = .3;
    const appearance = car => ({
      paint: car.bodyM.color.getHex(),
      cockpit: [car.inside.visible, car.shell.visible, car.glass.visible],
      wheel: [car.wheels[0].rotation.x, car.wheels[0].parent.position.y, car.front[0].rotation.y],
      blur: [car.blurOn, car.wheels[0].userData.blur.visible, ...car.wheels[0].userData.spokes.map(spoke => spoke.visible)]
    });
    const before = appearance(old);
    T.save.gfx = 2;
    T.rebuildCarModels();
    return { rebuilt: T.pc !== old, before, after: appearance(T.pc), ownedPaint: T.save.paint[rental.id] };
  });
  expect(result.rebuilt).toBe(true);
  expect(result.after).toEqual(result.before);
  expect(result.ownedPaint).toBeUndefined();
});

test("resizing picks up the screen's current pixel density", async ({ game }) => {
  await game.open({ save: { v: 3, gfx: 1 } });
  const sizes = await game.eval(() => [2, 1].map(density => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: density });
    window.dispatchEvent(new Event("resize"));
    return [__T.renderer.getPixelRatio(), __T.renderer.domElement.width];
  }));
  expect(sizes).toEqual([[2, 2560], [1, 1280]]);
});

test("a photo taken immediately after orbiting uses the new camera's sky position", async ({ game }) => {
  await game.open();
  await game.driveOut();
  const centred = await game.eval(async () => {
    const T = __T;
    T.photoEnter();
    const sky = T.scene.children.find(object => object.geometry?.parameters?.radius === 3800);
    const render = T.renderer.render;
    let matches;
    T.renderer.render = (_, camera) => { matches = sky.position.equals(camera.position); };
    T.PH.yaw += 1;
    const capture = T.photoCapture();
    T.renderer.render = render;
    await capture;
    return matches;
  });
  expect(centred).toBe(true);
});

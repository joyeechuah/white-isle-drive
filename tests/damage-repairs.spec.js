const { test, expect } = require("./support/game");

async function damagedDrive(game, amount = 75) {
  await game.open();
  await game.driveOut();
  await game.park();
  await game.eval(damage => {
    __T.P.damage = damage;
    __T.P.damageT = 0;
  }, amount);
  await game.steps(2);
}

test("repair screen explains damage, charges credits only after a second confirmation, and clears smoke", async ({ game, page }) => {
  await damagedDrive(game, 75);
  const before = await game.eval(() => __T.save.cr);
  const hud = page.locator("#damageHud");
  await expect(hud).toHaveText("DAMAGE 75% · REPAIR");
  await hud.click();
  await expect(page.locator("#repair")).toBeVisible();
  await expect(page.locator("#repairDetails")).toContainText("26%");
  await expect(page.locator("#repairHome")).toContainText("FREE");
  const pay = page.locator("#repairNow");
  await expect(pay).toBeEnabled();
  await expect(pay).toContainText("2,500 CR");
  await pay.click();
  await expect(pay).toContainText("CONFIRM SPEND 2,500 CR");
  expect(await game.eval(() => __T.save.cr)).toBe(before);
  expect(await game.eval(() => __T.P.damage)).toBe(75);
  await pay.click();
  await expect(page.locator("#repair")).toBeHidden();
  await expect(hud).toBeHidden();
  expect(await game.eval(() => ({ cr: __T.save.cr, damage: __T.P.damage, smoke: __T.pc.damageSmoke.visible, state: __T.state })))
    .toEqual({ cr: before - 2500, damage: 0, smoke: false, state: "DRIVE" });
});

test("free garage repair leaves credits unchanged and works from the paused menu", async ({ game, page }) => {
  await damagedDrive(game, 100);
  const before = await game.eval(() => __T.save.cr);
  await game.eval(() => __T.pauseOn());
  await page.locator("#pRepair").click();
  await expect(page.locator("#repair")).toBeVisible();
  await expect(page.locator("#repairTitle")).toHaveText("DAMAGE 100%");
  await expect(page.locator("#repairNow")).toContainText("3,000 CR");
  await page.locator("#repairHome").click();
  await game.waitState("GARAGE");
  expect(await game.eval(() => ({ damage: __T.P.damage, cr: __T.save.cr })))
    .toEqual({ damage: 0, cr: before });
});

test("repair cancels without spending credits and is blocked while moving or racing", async ({ game, page }) => {
  await damagedDrive(game, 55);
  const before = await game.eval(() => __T.save.cr);
  await game.eval(() => { __T.P.vx = 3; __T.P.vz = 0; });
  await page.locator("#damageHud").click();
  await expect(page.locator("#repairNow")).toBeDisabled();
  await expect(page.locator("#repairRule")).toContainText("Stop the vehicle");
  await page.locator("#repairClose").click();
  expect(await game.eval(() => __T.save.cr)).toBe(before);
  await game.park();
  await game.eval(() => __T.startEvent(__T.EVENTS.find(e => e.type === "race")));
  await game.eval(() => { __T.P.damage = 35; });
  await game.steps(2);
  await page.locator("#damageHud").click();
  await expect(page.locator("#repairNow")).toBeDisabled();
  await expect(page.locator("#repairRule")).toContainText("race or time trial");
});

test("insufficient credits disables roadside repair; canceling confirmation never deducts credits", async ({ game, page }) => {
  await damagedDrive(game, 100);
  await game.eval(() => { __T.save.cr = 500; });
  await page.locator("#damageHud").click();
  await expect(page.locator("#repairNow")).toBeDisabled();
  await expect(page.locator("#repairRule")).toContainText("Not enough credits");
  await page.locator("#repairClose").click();
  expect(await game.eval(() => ({ cr: __T.save.cr, damage: __T.P.damage }))).toEqual({ cr: 500, damage: 100 });
  await page.locator("#damageHud").click();
  await expect(page.locator("#repairNow")).toBeDisabled();
});

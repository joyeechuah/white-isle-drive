// Shared test fixture: opens the game in a fresh page and gives the tests helpers to drive it.
//
// Every page gets:
//   - three.js r128 from the npm package instead of cdnjs (same file: the page's Subresource Integrity hash is
//     still checked by the browser, so a different copy would fail to load)
//   - Firebase 10.12.2 (for the cloud save) from the npm package in the same way
//   - an empty stylesheet for Google Fonts, so no test waits on Google; the game falls back to system fonts
//   - every other request to another site blocked and recorded (the game makes none on its own)
// and, unless a test asks for the untouched page, the instrumented copy from instrument.js.
//
// After each test the fixture fails the test if the page threw an error or logged one to the console.
const { test: base, expect } = require("@playwright/test");
const { instrumentedPage } = require("./instrument");

const THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const THREE_FILE = require.resolve("three/build/three.min.js");
// the Firebase scripts the cloud save loads, from the npm package of the same pinned version (again the page's hashes
// are checked by the browser). Only the cloud tests that open SAVE MY PROGRESS load them
const FIREBASE_URL = /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/firebase\/10\.12\.2\/(firebase-(?:app|auth|firestore)-compat\.js)$/;
const FIREBASE_DIR = require("path").dirname(require.resolve("firebase/package.json"));
const SAVE_KEY = "white-isle-drive-v1";

// a careful autopilot along the GPS route to the current contract objective, or (stopWhen "gps") to the GPS target,
// carrying on to within 6 m of it after the GPS says it has arrived (28 m out). Free-ride streaks are kept at zero,
// so they can't add credits to a check. Stepped inside one evaluate, so real frames can't interfere. When stuck it
// backs up, letting go of the brake for a step first (a brake held from moving only holds the car still)
const ROUTE_BOT = ([n, stopWhen]) => {const T=__T,P=T.P;let i=0;const w=a=>a-Math.PI*2*Math.round(a/(Math.PI*2));
  const B=window.__bot||(window.__bot={stuck:0,rev:0}),goal=stopWhen==="gps"&&T.gps.t?{x:T.gps.t.x,z:T.gps.t.z}:null;
  for(;i<n&&(goal||T.job);i++){
    const t=goal||T.jobTarget(),R=T.gps.route,sp=Math.hypot(P.vx,P.vz),dt=Math.hypot(t.x-P.x,t.z-P.z);let tx=t.x,tz=t.z;
    if(R&&R.pts.length>1&&dt>14){let bi=0,bd=1e18;for(let k=0;k<Math.min(R.pts.length,150);k++){const p=R.pts[k],d=(p.x-P.x)**2+(p.z-P.z)**2;if(d<bd){bd=d;bi=k}}
      const look=Math.min(R.len,R.cum[bi]+8+sp*.5);let lo=0,hi=R.cum.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(R.cum[m]<=look)lo=m;else hi=m}tx=R.pts[hi].x;tz=R.pts[hi].z}
    const err=w(Math.atan2(tx-P.x,tz-P.z)-P.h);
    if(B.rev>0){B.rev--;T.keys.w=false;T.keys.s=B.rev<69;T.keys.a=err<0;T.keys.d=err>0;T.driveUpdate(1/60);continue}
    const want=Math.min(27.5,Math.sqrt(Math.max(0,2*3.5*(dt-9)))+3);
    T.keys.a=err>.03;T.keys.d=err<-.03;T.keys.w=sp<want-.5;T.keys.s=sp>want+1.5;
    B.stuck=T.keys.w&&sp<.7?B.stuck+1:0;if(B.stuck>90){B.stuck=0;B.rev=70}
    if(goal&&dt<6)break;
    T.driveUpdate(1/60);T.streakReset()}
  T.keys.a=T.keys.d=T.keys.w=T.keys.s=false;return {steps:i,active:!!T.job}};

// an autopilot for races and time trials: follows the event's route a little ahead of the car, full throttle
// (driving assist keeps it on the road). Returns once the event ends, after n steps, or once checkpoint untilCp is reached.
const EVENT_BOT = ([n, untilCp]) => {const T=__T,P=T.P;let i=0,off=0;
  for(;i<n;i++){if(T.state!=="DRIVE"||!T.ev||(untilCp!=null&&T.ev.cp>=untilCp))break;
    const R=T.ev.R,look=Math.min(R.len,T.ev.s+18+Math.hypot(P.vx,P.vz)*.5);let lo=0,hi=R.cum.length-1;
    while(hi-lo>1){const m=(lo+hi)>>1;if(R.cum[m]<=look)lo=m;else hi=m}
    const p=R.pts[hi],err=((Math.atan2(p.x-P.x,p.z-P.z)-P.h+Math.PI*3)%(Math.PI*2))-Math.PI;
    T.keys.a=err>.03;T.keys.d=err<-.03;T.keys.w=true;T.driveUpdate(1/60);if(!P.onRoad)off++}
  T.keys.a=T.keys.d=T.keys.w=false;return {steps:i,offRoad:off,state:T.state,cp:T.ev?T.ev.cp:null}};

class Game {
  constructor(page) {
    this.page = page;
    this.errors = [];
    this.external = [];
    this.allowErrors = [];
  }

  // open the game. Options:
  //   instrument (true)  serve the copy with test hooks; false = the exact file in the repository
  //   autostart  (true)  skip the START screen and wait for the garage (needs instrument)
  //   render     (false) draw the 3D scene; logic tests never draw it, which makes them many times faster. Tests
  //                      that draw belong in the "webgl" project (put @webgl in their title, see playwright.config.js)
  //   save               a save (object or raw string) put in localStorage before the game loads
  async open({ instrument = true, autostart = true, render = false, save, path = "/index.html" } = {}) {
    const page = this.page;
    if (!this._wired) {
      this._wired = true;
      page.on("pageerror", (e) => this.errors.push("page error: " + e.message));
      page.on("console", (m) => {
        if (m.type() === "error") this.errors.push("console error: " + m.text());
      });
      // registered first, so the more specific routes below take precedence
      await page.route(
        (u) => !u.href.startsWith("http://127.0.0.1"),
        (r) => {
          this.external.push(r.request().url());
          return r.abort("blockedbyclient");
        }
      );
      await page.route(THREE_URL, (r) =>
        r.fulfill({ path: THREE_FILE, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" } })
      );
      await page.route(FIREBASE_URL, (r) =>
        r.fulfill({ path: FIREBASE_DIR + "/" + FIREBASE_URL.exec(r.request().url())[1], contentType: "text/javascript", headers: { "access-control-allow-origin": "*" } })
      );
      await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) =>
        r.fulfill({ status: 200, contentType: "text/css", body: "", headers: { "access-control-allow-origin": "*" } })
      );
    }
    if (instrument && !this._instrumented) {
      this._instrumented = true;
      await page.route(
        (u) => u.href.startsWith("http://127.0.0.1") && (u.pathname === "/index.html" || u.pathname === "/"),
        (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: instrumentedPage() })
      );
    }
    if (!render && !this._norender) {
      this._norender = true;
      await page.addInitScript(() => {
        window.__NORENDER = 1;
      });
    }
    if (autostart && !this._auto) {
      this._auto = true;
      await page.addInitScript(() => {
        window.__autostart = 1;
      });
    }
    if (save !== undefined) await this.seed(save);
    await page.goto(path);
    if (instrument && autostart) await this.boot(render);
    return this;
  }

  // put a save in localStorage for this site before the game reads it
  async seed(save) {
    const raw = typeof save === "string" ? save : JSON.stringify(save);
    await this.page.goto("/404.html");
    await this.page.evaluate(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)), [SAVE_KEY, raw]);
  }

  async boot(render = false) {
    await this.waitState("GARAGE", 240000);
    if (!render) await this.noRender();
  }

  async reload(render = false) {
    await this.page.reload();
    await this.boot(render);
  }

  async noRender() {
    await this.page.evaluate(() => {
      const R = __T.renderer;
      if (!R.__draw) R.__draw = R.render;
      R.render = function () {};
    });
  }

  async withRender() {
    await this.page.evaluate(() => {
      const R = __T.renderer;
      if (R.__draw) R.render = R.__draw;
    });
  }

  eval(fn, arg) {
    return this.page.evaluate(fn, arg);
  }

  state() {
    return this.page.evaluate(() => __T.state);
  }

  async waitState(s, timeout = 60000) {
    await this.page.waitForFunction((s) => window.__T && __T.state === s, s, { timeout, polling: 100 });
  }

  // wait for n real animation frames
  frames(n = 2) {
    return this.page.evaluate(
      (n) =>
        new Promise((res) => {
          let i = 0;
          const f = () => (++i >= n ? res() : requestAnimationFrame(f));
          requestAnimationFrame(f);
        }),
      n
    );
  }

  // from the garage out onto the road, through the real exit sequence (in bigger time steps)
  async driveOut() {
    await this.page.evaluate(() => {
      window.__DTMAX = 0.25;
      document.getElementById("drive").click();
    });
    await this.waitState("DRIVE", 120000);
    await this.page.evaluate(() => {
      window.__DTMAX = 0;
    });
  }

  // stop the car on a quiet open road, away from every prompt (or at x, z)
  park(x = null, z = null) {
    return this.page.evaluate(
      ([x, z]) => {
        const T = __T;
        let spot = null;
        if (x !== null) spot = { x, z };
        else
          for (const e of T.EDGES) {
            if (e.type === "drive" || e.len < 80) continue;
            const q = T.edgePos(e, e.len / 2);
            const far = [...T.EVENTS.map((E) => [E.x, E.z]), [T.HOUSE.x, T.HOUSE.z], [T.DEALER.x, T.DEALER.z], ...T.LANDMARKS.map((L) => [L.x, L.z])].every(
              ([px, pz]) => Math.hypot(q.x - px, q.z - pz) > 140
            );
            if (far) {
              spot = q;
              break;
            }
          }
        T.P.x = spot.x;
        T.P.z = spot.z;
        T.resetToRoad(false);
        T.P.vx = T.P.vz = 0;
        // Clear leftover input so the car cannot creep before a reverse test.
        T.P.thr = 0;
        T.P.brkHold = false;
        if (document.activeElement) document.activeElement.blur();
        return { x: T.P.x, z: T.P.z, h: T.P.h };
      },
      [x, z]
    );
  }

  // hold keys for n simulation steps of 1/60 s, inside one evaluate; returns the car's state afterwards
  steps(n, held = {}) {
    return this.page.evaluate(
      ([n, held]) => {
        const T = __T,
          P = T.P;
        for (const k in held) T.keys[k] = held[k];
        for (let i = 0; i < n; i++) T.driveUpdate(1 / 60);
        for (const k in held) T.keys[k] = false;
        const f = { x: Math.sin(P.h), z: Math.cos(P.h) };
        return { x: P.x, z: P.z, h: P.h, kph: Math.hypot(P.vx, P.vz) * 3.6, fwd: (P.vx * f.x + P.vz * f.z) * 3.6, onRoad: P.onRoad };
      },
      [n, held]
    );
  }

  routeBot(n = 30000, stopWhen = "job") {
    return this.page.evaluate(ROUTE_BOT, [n, stopWhen]);
  }

  eventBot(n = 20000, untilCp = null) {
    return this.page.evaluate(EVENT_BOT, [n, untilCp]);
  }

  // press a real key (through the browser's input pipeline)
  async key(k) {
    await this.page.keyboard.press(k);
  }

  // record every on-screen message (toast) as it appears; messages leave after 3.2 s, so reading the screen
  // later would depend on timing
  watchToasts() {
    return this.page.evaluate(() => {
      const box = document.getElementById("toasts");
      window.__toastLog = [];
      if (window.__toastObs) window.__toastObs.disconnect();
      window.__toastObs = new MutationObserver((ms) => {
        for (const m of ms)
          for (const n of m.addedNodes) {
            const b = n.querySelector && n.querySelector("b");
            if (b) window.__toastLog.push(b.textContent + (n.querySelector("span") ? " | " + n.querySelector("span").textContent : ""));
          }
      });
      window.__toastObs.observe(box, { childList: true });
    });
  }

  // the messages recorded since watchToasts() (after any pending ones are delivered)
  toastLog() {
    return this.page.evaluate(() => new Promise((r) => setTimeout(() => r(window.__toastLog || []), 0)));
  }

  readSave() {
    return this.page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), SAVE_KEY);
  }
}

const test = base.extend({
  game: async ({ page }, use) => {
    const g = new Game(page);
    await use(g);
    const errors = g.errors.filter((e) => !g.allowErrors.some((re) => re.test(e)));
    expect(errors, "the page threw or logged errors").toEqual([]);
  },
});

module.exports = { test, expect, Game, SAVE_KEY, THREE_URL };

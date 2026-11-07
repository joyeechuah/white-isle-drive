// The page the tests drive: the shipping index.html, read from disk on every run, with test hooks added in
// memory. index.html itself is never changed, so the tests always exercise the code players get.
//
// The hooks only add ways to look inside the game, plus two small helpers:
//   window.__T      read access to the game's internal state and functions (the game code is wrapped in a
//                   function, so nothing is reachable from outside otherwise)
//   window.__DTMAX  lets a test take bigger time steps through scripted scenes (the garage exit)
//   window.__AUD    counts impact sounds
//   window.__NORENDER  set by a test before the page loads: the 3D scene is never drawn (much faster)
// Each edit must match exactly once. If the game's code changes so that one no longer matches, the tests stop
// with a message saying which, rather than quietly testing something else.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

// internal names the tests read; each is exposed as a getter, so the value is always the live one, and a name
// that no longer exists fails only the tests that use it, with "<name> is not defined"
const NAMES = (
  "AC AU BOATS CARS DEALER DEALER_MARK EDGES EVENTS FR GARAGE_CAP H HOUSE JOBS JOB_R LANDMARKS LANDMARK_REWARD MV " +
  "NODES P PASSPORT_BONUS PH PHOTO_LOOKS PZ RADARS RES ROADS SAVE_KEY SHOW STARTERS TODS TRAFFIC VTL W " +
  "adaptRes applyDayNight attachCar camMode camera carById closeDealer closeMap curCar curId cycleCam dPick dSel " +
  "discoverLandmark drawMap driveUpdate earn edgePos endTestDrive ev fastTravel finishEvent fishT fitZoom " +
  "foam foundCount gPick gSel gW goDrive goGarage gps grassT groundH hudOn job jobEnd jobRestart jobStart " +
  "jobTarget jobsClose jobsOpen keys mapToWorld mapZoomAt nearestRoad nearestRoadGlobal openDealer openIntro " +
  "openMap openMapPopup pad passportClose passportOpen pauseOff pauseOn pc persist photoCapture photoEnter " +
  "photoExit photoLook photoLookSet photoReset prNow promptAct renderer resetToRoad routeBetween save scene " +
  "seaT setGPS clearGPS setState skyClock skyU startEvent startTestDrive state streakReset testDrive " +
  "updatePrompt zoneAt Hf LM_R gates fadeThen layoutHUD show audioOn acResume musicWant photoFrame finishTestDrive gateOf trackRoute trackRouteFull mapMarkers CAMV snapCam DIFFS setDiff raceRewards"
).split(/\s+/);

const EDITS = [
  {
    name: "test hooks after boot()",
    find: "\nboot();\n})();",
    replace:
      "\nboot();\nwindow.__T={" +
      NAMES.map((n) => `get ${n}(){return ${n}}`).join(",") +
      ",set camMode(v){camMode=v}};\n" +
      // logic tests switch 3D drawing off from the start (see game.js)
      "if(window.__NORENDER){renderer.__draw=renderer.render;renderer.render=function(){}}\n})();",
  },
  {
    name: "time step cap (window.__DTMAX)",
    find: ",dt=Math.min(.05,raw)",
    replace: ",dt=Math.min(window.__DTMAX||.05,raw)",
  },
  {
    name: "impact sound counter (window.__AUD)",
    find: "function playThump(v){",
    replace: "function playThump(v){window.__AUD=(window.__AUD||0)+1;",
  },
];

function count(hay, needle) {
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

function instrumentedPage() {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const e of EDITS) {
    const n = count(html, e.find);
    if (n !== 1)
      throw new Error(
        `tests/support/instrument.js: the "${e.name}" edit expects ${JSON.stringify(e.find)} once in index.html, found ${n}. ` +
          "The game's code has changed there; update the edit to match."
      );
    html = html.replace(e.find, () => e.replace);
  }
  return html;
}

module.exports = { instrumentedPage, NAMES, ROOT };

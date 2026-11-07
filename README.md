# White Isle Drive

A free-roam driving game set on a Mediterranean island modelled loosely on Ibiza. Cruise the coast roads, buy and collect cars, set records on speed radars, race AI drivers in time trials and races, find the island's landmarks, take on driving contracts and stop for photos. It runs in any modern browser on desktop or phone, with no install and no build step.

### [▶ Play now](https://joyeechuah.github.io/white-isle-drive/)

![A white hatchback driving along the coastal highway at sunset, with the credits, minimap and speedometer on screen](docs/screenshot.jpg)

## Play

**Online:** play it at [joyeechuah.github.io/white-isle-drive](https://joyeechuah.github.io/white-isle-drive/).

**Locally:** download or clone the repository and open `index.html` in Chrome, Edge, Firefox or Safari. It needs an internet connection to load three.js and the web fonts. Browsers block a page opened straight from disk from loading the music files, so locally you'll hear the built-in backup music instead; to hear the full soundtrack, run a small local server in the folder (for example `python -m http.server`) and open `http://localhost:8000`.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Accelerate / brake and reverse | `W` / `S` or `↑` / `↓` | GAS / BRAKE pads (BRAKE reads REVERSE when you're stopped) |
| Steer | `A` / `D` or `←` / `→` | ◀ / ▶ pads |
| Handbrake | `Space` | HAND BRAKE pad |
| Interact (dealer, events, house) | `E` or `Enter` | Tap the prompt |
| Map and GPS | `M` | MAP |
| Change camera (remembered next visit) | `C` | CAM |
| Photo mode | `V` | PHOTO |
| Back on the road | `R` | |
| Pause and settings | `Esc` or `P` | PAUSE |

In the garage, `←` / `→` choose a car and `Enter` drives it. On the map, drag to pan, scroll or pinch to zoom, click a marker to set the GPS or travel there, or click a road to drop a waypoint.

In photo mode, drag (or use the arrow keys) to move around the car and scroll, pinch or press `+` / `−` to move closer. The ZOOM and DISTANCE sliders do the same, `1` to `4` pick a look (AS IS, GOLDEN HOUR, NIGHT DRIVE, COASTAL SUNSET), `R` resets the camera, `Enter` takes the picture and `Esc` or `V` goes back to the game. The world stands still while it's open, and the looks change the light only in photo mode.

The pause menu opens photo mode, the Island Passport and the Contracts board, and sets the time of day, driving assist (keeps the car stable and in its lane), auto gas (off by default, handy on phones), sound effects (SOUND FX), music and graphics quality (AUTO, SHARP or SMOOTH). The two sound switches are independent. The garage also has its own MUSIC button.

## Features

- A compact island with the old town of Eivissa, Sant Antoni, hill villages, villas, a coastal highway, offshore islets and passing boats, all generated in code at load time
- A day and night cycle in which the sky, clouds and sea change with the hour, and moonlit nights lit by street lamps and your headlights
- 24 cars from hatchbacks to hypercars across classes A1 to A7, with paint colours, a 12-car garage and a dealership where you can buy, sell and take a 90-second test drive
- 6 events (time trials and races against AI drivers) with medals and personal bests; traffic on the route only drives your way, so you can overtake
- Photo mode: a free camera around your car, a zoom control, three looks (Golden Hour, Night Drive, Coastal Sunset) and a PNG of the scene without the game's on-screen display
- An Island Passport of 18 landmarks to find by driving to them, from the highest road to the far capes and the villages, each paying credits once, with a bonus for finding them all
- Contracts: parcel deliveries, timed courier runs and scenic tours between the towns, with the GPS guiding you and a reward on completion
- Speed radars, plus a free-ride points streak for speed, near misses, oncoming-lane driving and drifts that you bank as credits
- Traffic on the roads, a GPS minimap that draws the route to any marker or waypoint, and a full map with fast travel
- A three-track soundtrack: a Mediterranean lounge groove in the garage and dealership, Balearic house for free driving and a faster track for races, looping without a gap, quieter behind menus and softer after dark
- Engine, tyre, surface and impact sound synthesised live with the Web Audio API
- Responsive HUD for desktop and touch screens in landscape or portrait

## How it works

The game itself is one file, `index.html`. The only library is [three.js](https://threejs.org/) r128 (MIT licence), loaded from cdnjs with a Subresource Integrity hash so the browser rejects a modified copy. Terrain, roads, buildings, vegetation, cars, textures and sound effects are all generated procedurally. The only asset files are the three music tracks in `audio/` (about 2 MB each), which are loaded only when needed and looped on the Web Audio clock. Two backup tracks composed in code play if the files can't load. A Content Security Policy in the page only lets it load scripts from itself and cdnjs, fonts from Google Fonts and music from its own folder.

## Testing

The game has an automated test suite that plays it in a real browser (Chromium, through [Playwright](https://playwright.dev/)). Node.js and the packages in `package.json` are only needed to run the tests; the game itself still needs no build or install.

```
npm ci                                  # once: installs Playwright, ESLint and the test copy of three.js
npx playwright install --with-deps chromium   # once: the browser Playwright drives
npm test                                # runs every test (serves this folder on http://127.0.0.1:4173)
npx playwright test tests/contracts.spec.js   # one file
npx playwright test -g "photo"          # tests whose name matches
npm run test:report                     # opens the HTML report of the last run
npm run lint                            # static checks (ESLint) on the game's script
```

`npm start` serves the folder on the same address for playing locally with the full soundtrack.

The tests run against the real `index.html`, read fresh on every run. For tests that need to look inside the game, `tests/support/instrument.js` adds read-only hooks to an in-memory copy; the file on disk is never changed. three.js is served from the npm package (the page's integrity hash is still checked) and web fonts are stubbed, so runs don't depend on outside sites. They cover:

- **Smoke**: the untouched page loads, START, the garage, driving, pause and home; site files and the 404 page.
- **Driving**: throttle, brakes, reverse, steering, handbrake, the sea reset, R to reset, map travel, keys held while menus are open.
- **Garage and dealership**: buying (charged once), not enough credits, the 12-car limit, selling, test drives, paint.
- **Races and time trials**: rewards paid once, checkpoints in order, the finish line, quitting and restarting, no oncoming traffic on any event route, rivals never driving through each other, and the car braking to a stop past the line before the result.
- **Map and GPS**: waypoints and routes, mouse and touch zoom and pan, turning a phone, travelling from a marker.
- **Photo Mode**: where it opens, the world standing still, camera and looks, a real PNG capture, everything restored.
- **Island Passport** and **Contracts**: every landmark and all 9 contracts, each paid once, failures and cancellations.
- **Saves**: reloads, a save from the first release, corrupt and malformed saves, storage being refused.
- **Phones**: touch controls, and layouts at six screen sizes (including 360 px tall phones held sideways), and turning the device, the race panel kept clear of the car and the road, and the BRAKE / REVERSE label.
- **Traffic**: cars keep their distance at junctions, in queues and where they appear, and none waits for good, even behind a parked car.
- **Camera**: the chase camera keeps the road ahead in view for small, large and low cars; the chosen camera is remembered.
- **Rendering**: real WebGL drawing by day and night and at each graphics setting.
- **Stability and performance**: no leftovers after many screen changes, long frame gaps, a hidden tab, memory over a long drive, and measurements of frame cost, GPU load, load time and memory.

GitHub Actions (`.github/workflows/test.yml`) runs ESLint and then the suite on every push to `main` and every pull request. A failing test fails the run, and the HTML report, with screenshots and traces of any failure, is attached to it.

The tests come in two Playwright projects. `chromium` runs the logic and interaction tests with 3D drawing switched off, which is many times faster. `webgl` runs the tests tagged `@webgl`, which draw with real WebGL. Run one with `npx playwright test --project=webgl`.

Limits: on machines without a GPU, CI runners included, Chrome draws with its software renderer (SwiftShader). The rendering tests prove the scene builds and draws, and the performance numbers are comparisons between runs, not frame rates on real devices. Phones are emulated screen sizes with emulated touch in desktop Chromium. Firefox and Safari aren't covered by the automated tests yet.

## Privacy

The game has no accounts, analytics, ads, cookies or tracking, and sends no data anywhere. The feedback links only open Google Forms or GitHub in a new tab when you click them; the form collects no email addresses. Progress is saved only in your own browser's `localStorage` (key `white-isle-drive-v1`); clearing site data resets it.

The page makes two kinds of outside requests: three.js from cdnjs.cloudflare.com and the Barlow fonts from Google Fonts. As with any web font, Google receives the visitor's IP address when the fonts load. To avoid that, delete the three Google Fonts `<link>` lines at the top of `index.html`; the game then uses the system font.

## Music

The soundtrack was generated with Google Flow Music under a Google AI Plus plan: *Mediterranean Showroom* (garage and dealership), *Coastal Cruise Loop* (free driving) and *Island Highway Run* (races and time trials). The backup tracks used when the files can't load are composed in the game's code.

## Feedback

Found a bug or have an idea? I'd love to hear it.

- **[Quick feedback form](https://forms.gle/bPk18BbmhaGLNJtD9)** takes about a minute and needs no account. It's also what **SEND FEEDBACK** in the in-game pause menu opens.
- **[GitHub issues](https://github.com/joyeechuah/white-isle-drive/issues/new/choose)**: if you have a GitHub account, the bug report and idea forms there let you follow the fix.

## How this was made

This game was vibe coded: I directed the design and features, playtested each version, and reported bugs and changes, while the code was written by an AI assistant (Claude by Anthropic). Testing used automated browser checks on desktop and phone screen sizes, plus my own playthroughs in the browser.

## Disclaimer

This is an unofficial, non-commercial fan project. It is not affiliated with, endorsed by or sponsored by any game publisher or car manufacturer. Car makes and model names are trademarks of their respective owners and are used only to identify the vehicles; the car models are simplified original shapes with no logos. The island is a stylised interpretation and not an accurate map of Ibiza.

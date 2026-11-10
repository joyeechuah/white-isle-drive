# White Isle Drive — Architecture and Developer Guide

This is a guide to the **current merged implementation on `main`**, not a roadmap. White Isle Drive is a static browser driving game, hosted on GitHub Pages. The game itself needs no build step.

Return to [README](../README.md) · See [Changelog](../CHANGELOG.md) · Set up [Cloud Save](../CLOUD_SETUP.md).

## Technology and entry points

| Area | Implementation | Main entry point |
| --- | --- | --- |
| Game UI and control surfaces | HTML, CSS, vanilla JavaScript | `index.html` |
| 3D renderer, camera, scene graph | three.js r128, WebGL | `index.html` |
| Terrain, roads, town props, cars | Procedural geometry / generated textures | `index.html` |
| Physics-style driving, collisions and AI | Frame-based JavaScript simulation | `index.html` |
| Audio | Web Audio API, pre-recorded music and synthesised fallback | `index.html`, `audio/` |
| Guest progress | Validated browser `localStorage` save | `index.html` |
| Optional cloud backup | Firebase Auth + Firestore | `index.html`, `firestore.rules`, `CLOUD_SETUP.md` |
| Automation | Playwright / ESLint / GitHub Actions | `tests/`, `playwright.config.js`, `.github/workflows/test.yml` |

The sizeable `index.html` contains the production game, not a framework application with separate ES modules. Search the section comments and functions listed below rather than expecting `src/` or a bundler.

## Boot and the main loop

The page loads the three.js library from cdnjs with a Subresource Integrity hash. Startup checks for WebGL support, restores and sanitises saved progress, then `boot()` executes the staged `STEPS` initialisation. These stages construct road networks, terrain, scenery, landmarks, events, traffic and parked vehicles. The `requestAnimationFrame(frame)` loop drives the simulation.

`frame(ts)` clamps the elapsed time, applies day/night and environment updates, delegates based on the current game state, and renders. Representative states are `LOAD`, `GARAGE`, `EXIT`, `DRIVE`, `DEALER`, `MAP`, `PHOTO`, `PAUSE` and `FADE`. `setState()` coordinates state transitions and interaction availability. Photo mode pauses world clocks; a tab that is no longer the active session skips its frame work.

### Driving and traffic

- `driveUpdate()` handles active driving; the input handlers combine keyboard, on-screen touch pads and standard gamepad state.
- `collidePlayer()`, `damageVehicle()`, `damagePower()` and `showDamageSmoke()` model contact, damage penalties and smoke. Damage is **session-only**. `goGarage()` repairs the current car free of charge.
- `initTraffic()`, `spawnTraffic()` and `updateTraffic()` handle ambient vehicles and placement/retry behaviour.
- `startEvent()` and `updateEvent()` handle races, rivals and their finishing behaviour.
- `openMap()` / `fastTravel()`, `goGarage()` and `goDrive()` coordinate movement between gameplay screens.
- `garageCam()` and garage pointer handlers implement rotation and pinch zoom. Two-finger touches are tracked by pointer IDs to prevent zoom jumps.

**State transition caution:** Input that changes screens must not continue into controls belonging to the new screen during the same frame (for example, the controller dealership-entry bug addressed in PR #35). Similar care is needed for asynchronous fade callbacks and inactive tabs.

## Save data and cloud backup

The local game save uses `localStorage` key `white-isle-drive-v1`, with sanitisation of loaded values. `persist()` saves locally and notifies the optional cloud layer of relevant changes. Runtime driving damage is not part of saved progress.

Cloud saving is opt-in through `SAVE MY PROGRESS`. The Firebase libraries load only when that feature is used on an authorised host. Firestore stores a per-user document under `saves/{uid}`; `firestore.rules` restricts access to the signed-in owner and requires an incrementing revision number. When local and remote progress differ, the game asks the player which to keep rather than merging balances. Ghost replay data is intentionally excluded from cloud payloads to limit record size.

`BroadcastChannel` (with a storage-event fallback) prevents an older tab from continuing to overwrite a newer tab's progress. An inactive tab suspends relevant gameplay/audio and must not resume pending work.

For Firebase provisioning, rules and supported domains, use [CLOUD_SETUP.md](../CLOUD_SETUP.md), not this overview.

## Sound and external resources

The game uses Web Audio for engine, tyres, ambient sound and music, with three soundtrack assets in `audio/` and synthesised fallback tracks. Sound effects and music have separate settings. The page fetches three.js and Google Fonts on startup; optional Firebase authentication/downloads occur only on cloud use. Cloudflare Web Analytics runs on the official site when browser privacy signals allow it. See [README Privacy](../README.md#privacy) for the user-facing explanation and `index.html`'s Content Security Policy for permitted network origins.

## Tests and continuous integration

Production `index.html` is loaded fresh for browser tests. `tests/support/instrument.js` inserts controlled inspection hooks into an **in-memory copy**; it does **not** modify the shipping HTML file. Tests can then inspect internal state using `window.__T`. `tests/support/game.js` contains test-driving helpers. The Playwright server is in `tests/support/server.js`.

`playwright.config.js` defines two projects: `chromium` for logic and interaction without 3D rendering, and `webgl` for tests tagged `@webgl`, drawing with WebGL/SwiftShader as needed. The workflow `.github/workflows/test.yml` installs dependencies, runs lint, runs Chromium Playwright tests, and uploads reports and failure artifacts.

```sh
npm ci
npx playwright install --with-deps chromium
npm run lint
npm test
npx playwright test tests/collision-rear-view.spec.js
npx playwright test --project=webgl
npm run test:report
```

Automated mobile cases use emulated viewports and touch events, **not physical mobile browsers**. Firefox and Safari are not part of the automated suite.

## Working safely on the project

1. Make a feature branch from the **current** `main`; don't edit `main` directly.
2. Keep game logic changes and test expectations in the same pull request.
3. Update any exact-match hooks in `tests/support/instrument.js` if modifying the associated production source string.
4. For input/camera changes, test mouse, touch, controllers and short phone landscape layouts.
5. For save or cloud changes, test migrations, corrupt saves, offline behaviour and multi-tab ownership.
6. Run lint and relevant targeted tests first, then the complete suite and GitHub Actions before merging.
7. When multiple PRs touch `index.html`, merge one and update the others against the latest `main`; preserve both sides of the change.
8. Describe user-visible behaviour in the README and record substantial merged changes in the [changelog](../CHANGELOG.md).

## Known constraints

The game relies on WebGL and a modern browser; a low-power device may need the SMOOTH graphics setting. The CDN-hosted renderer requires connectivity at load time. Browser local storage can be cleared, and guest progress does not sync across devices. Automation does not currently exercise actual mobile Safari or Firefox, and GPU-less CI performance is not representative of physical devices.

## AI-assisted development and human direction

The project uses AI coding assistants for implementation. Human project work includes requirements and UX direction, playtesting, reproduction of reported issues, reviewing fixes, regression-test strategy and deciding merge readiness. Preserve that distinction in project documentation and portfolio descriptions.

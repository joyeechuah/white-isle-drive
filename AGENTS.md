# Notes for coding agents

- The game is `index.html`: its HTML, CSS and one large inline script. Tests are in `tests/`; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the game is built.
- `npm run lint` runs ESLint on the game's script and then TypeScript's type check (`npm run typecheck` alone; settings in `tsconfig.json`, outside code such as three.js declared in `types/globals.d.ts`). Keep both at zero: settle a false type report where it is, with a JSDoc cast such as `/** @type {any} */ (x)` or a typed default, not by turning checks off.
- Before opening a PR: `npm run lint`, then the Playwright tests for what changed (`npx playwright test tests/<name>.spec.js`). Run one Playwright instance at a time: the test server uses port 4173.
- Commits use the GitHub noreply address of whoever they are attributed to, never a personal email.

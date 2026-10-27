# White Isle Drive

A free-roam driving game set on a Mediterranean island modelled loosely on Ibiza. Cruise the coast roads, buy and collect cars, set records on speed radars and race AI drivers in time trials and races. It runs in any modern browser on desktop or phone, with no install and no build step.

![White Isle Drive screenshot](docs/screenshot.jpg)

## Play

**Locally:** download or clone the repository and open `index.html` in Chrome, Edge, Firefox or Safari. It needs an internet connection to load three.js and the web fonts.

**On GitHub Pages:** in the repository go to *Settings → Pages*, set *Source* to *Deploy from a branch*, choose `main` and `/ (root)`, then save. The game will be live at `https://<your-username>.github.io/<repository-name>/` after a minute or two.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Accelerate / brake and reverse | `W` / `S` or `↑` / `↓` | GAS / BRAKE pads |
| Steer | `A` / `D` or `←` / `→` | ◀ / ▶ pads |
| Handbrake | `Space` | HAND BRAKE pad |
| Interact (dealer, events, house) | `E` or `Enter` | Tap the prompt |
| Map and GPS | `M` | MAP |
| Change camera | `C` | CAM |
| Back on the road | `R` | |
| Pause and settings | `Esc` or `P` | PAUSE |

In the garage, `←` / `→` choose a car and `Enter` drives it. On the map, drag to pan, scroll or pinch to zoom, click a marker to set the GPS or travel there, or click a road to drop a waypoint.

The pause menu sets the time of day, driving assist (keeps the car stable and in its lane), auto gas (handy on phones) and sound.

## Features

- A compact island with the old town of Eivissa, Sant Antoni, hill villages, villas, a coastal highway, offshore islets and passing boats, all generated in code at load time
- A day and night cycle with a dynamic sky, clouds and sea, and moonlit nights lit by street lamps and your headlights
- 24 cars from hatchbacks to hypercars across classes A1 to A7, with paint colours, a 12-car garage and a dealership where you can buy, sell and take a 90-second test drive
- 6 events (time trials and races against AI drivers) with medals and personal bests
- Speed radars, plus a free-ride points streak for speed, near misses, oncoming-lane driving and drifts that you bank as credits
- Traffic on the roads, a GPS minimap that draws the route to any marker or waypoint, and a full map with fast travel
- Engine, tyre, surface and impact sound synthesised live with the Web Audio API
- Responsive HUD for desktop and touch screens in landscape or portrait

## How it works

Everything is in one file, `index.html`. The only library is [three.js](https://threejs.org/) r128 (MIT licence), loaded from cdnjs with a Subresource Integrity hash so the browser rejects a modified copy. Terrain, roads, buildings, vegetation, cars, textures and sound are all generated procedurally, so the repository has no asset files.

## Privacy

The game has no accounts, analytics, ads, cookies or tracking, and sends no data anywhere. Progress is saved only in your own browser's `localStorage` (key `white-isle-drive-v1`); clearing site data resets it.

The page makes two kinds of outside requests: three.js from cdnjs.cloudflare.com and the Barlow fonts from Google Fonts. As with any web font, Google receives the visitor's IP address when the fonts load. To avoid that, delete the three Google Fonts `<link>` lines at the top of `index.html`; the game then uses the system font.

## How this was made

This game was vibe coded: I directed the design and features, playtested each version, and reported bugs and changes, while the code was written by an AI assistant (Claude by Anthropic). Testing used automated browser checks on desktop and phone screen sizes, plus my own playthroughs in the browser.

## Disclaimer

This is an unofficial, non-commercial fan project. It is not affiliated with, endorsed by or sponsored by any game publisher or car manufacturer. Car makes and model names are trademarks of their respective owners and are used only to identify the vehicles; the car models are simplified original shapes with no logos. The island is a stylised interpretation and not an accurate map of Ibiza.

# Changelog

Notable development milestones for [White Isle Drive](README.md). This is a curated record of changes, not a complete release history; the project does not yet use tagged semantic versions. Entries describe changes that are **merged into `main`** unless marked otherwise.

## 2026-11-10 — Driving, controls and session stability

- **Collision damage and rear view ([#33](https://github.com/joyeechuah/white-isle-drive/pull/33)):** impacts transfer speed, damage player and AI vehicles, reduce driving performance and produce smoke; look behind with keyboard `B`, touch REAR or controller LB. Returning to the garage repairs damage for free.
- **Mobile garage pinch ([#37](https://github.com/joyeechuah/white-isle-drive/pull/37)):** two-finger zoom works when a finger lands over the lower garage information panel.
- **Controller and touch handoffs ([#35](https://github.com/joyeechuah/white-isle-drive/pull/35)):** a single controller action no longer both opens the dealership and initiates a test drive; the garage tracks pinch pointer pairs to avoid sudden zoom jumps when fingers join or leave.
- **Race, traffic and inactive-tab lifecycle ([#36](https://github.com/joyeechuah/white-isle-drive/pull/36)):** finished rivals decelerate without renewed racing acceleration, failed traffic placement can recover, and inactive tabs stop running simulation/audio or delayed fade work.
- Expanded Playwright regression coverage for collisions, camera input, garage gestures, controller screen transitions, finished rivals and tab ownership.

## Existing gameplay systems

The game includes an open-world Mediterranean island, procedural scenery and vehicle models, a dealership and garage customisation, day/night driving, timed events and AI races, class championships, a time-trial ghost, speed radars, a landmark passport, driving contracts, a map with GPS and travel, photo mode, Web Audio soundtrack/sound effects, guest saves and optional Google/Firebase cloud backup.

## In progress (not released)

- **Vehicle condition and roadside repair UI ([#38](https://github.com/joyeechuah/white-isle-drive/pull/38))** is an open pull request. Its proposed damage panel, paid roadside repairs and damage warnings are **not shipped** until merged into `main`.

## Maintaining this file

- Record *merged*, user-visible features and significant bug fixes.
- Cite a pull request when available; do not describe draft or open pull requests as released.
- Update the README's controls and feature instructions when behaviour changes.
- After introducing release tags, replace date-only headings with version headings and retain links to the corresponding tags.

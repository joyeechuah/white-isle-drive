# White Isle Drive bug review for Claude

Reviewed main at `d829de6` on 19 November 2026. The five regression checks below exercise the game script in Chromium. The controller and network failures are simulated.

| Area | Reproduction on main | Change and regression check |
| --- | --- | --- |
| Dealership save | Buy the M3 and inspect each local save write. The first write contains the lower balance and the old garage. If the second write fails, reloading loses the purchase. | Set ownership and paint before charging. The purchase test now checks every saved snapshot with the debited balance as well as the final save after a double click. |
| Roadside repair | Open Vehicle Condition from Pause at 67% damage and confirm payment. Pause still displays 67% after the repair. | Refresh the condition when returning to Pause. The test expects 0% while the player is still paused. |
| Controller reconnect | Press Start to pause, disconnect with Start held, then reconnect with Start pressed. The first press is swallowed. | Clear the previous button readings on disconnect. The test checks that the first Start press resumes driving. |
| Soundtrack fallback | Delay the recorded garage track and start its timeout at audio-clock time zero. The elapsed-time calculation stays at zero and the backup never starts. | Preserve zero as a valid timestamp. The test detects the synthesized lounge track while the download remains pending. |
| Soundtrack recovery | Fail the first showroom download, then make the MP3 available again. The game keeps the track in its failed state for the session. | Retry on demand with delays capped at 30 seconds and discard bytes that failed decoding. The download test checks for an early duplicate request and then verifies a successful fetch after the deadline. |

## Verification

All five focused Playwright checks passed on the revised game using a local Chromium headless shell. ESLint reported zero errors and zero warnings. The repository's Tests workflow runs the full Chromium and WebGL suites on the pull request. The focused audio checks cover fallback selection and download recovery. They do not measure playback quality on a physical phone.

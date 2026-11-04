// Playwright configuration for White Isle Drive's automated tests (development only; the game needs no build).
// Run with `npm test`. See the Testing section of README.md.
const { defineConfig } = require("@playwright/test");

const PORT = Number(process.env.PORT) || 4173;
const CI = !!process.env.CI;
// WebGL on machines without a GPU (CI runners): Chrome's software renderer, SwiftShader
const GL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"];

module.exports = defineConfig({
  testDir: "./tests",
  // building the island takes a while on a software GPU, so tests get generous time
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: CI,
  // one retry on CI; a test that only passes on its retry is reported as flaky, never hidden
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [["github"], ["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]]
    : [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      // game logic and interaction: the 3D scene is never drawn, and the page is composited in software, which
      // keeps frames quick on a machine without a GPU
      name: "chromium",
      grepInvert: /@webgl/,
      use: { browserName: "chromium", launchOptions: { args: [...GL_ARGS, "--disable-gpu-compositing"] } },
    },
    {
      // tests that draw with real WebGL (tagged @webgl): the software GPU, SwiftShader, with GPU compositing, in a
      // smaller window, since a software GPU's time grows with the number of pixels
      name: "webgl",
      grep: /@webgl/,
      timeout: 600_000,
      use: { browserName: "chromium", viewport: { width: 800, height: 450 }, launchOptions: { args: GL_ARGS } },
    },
  ],
  webServer: {
    command: "node tests/support/server.js",
    url: `http://127.0.0.1:${PORT}/404.html`,
    reuseExistingServer: !CI,
    env: { PORT: String(PORT) },
    timeout: 30_000,
  },
});

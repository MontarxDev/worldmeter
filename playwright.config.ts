import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4178",
    launchOptions: {
      executablePath: "/usr/bin/google-chrome",
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178",
    timeout: 180_000,
    reuseExistingServer: false,
  },
})

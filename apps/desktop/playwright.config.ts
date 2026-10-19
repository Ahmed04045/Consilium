import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:1537",
    channel: "msedge",
    viewport: { width: 1440, height: 1050 },
  },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 1537 --strictPort",
    url: "http://127.0.0.1:1537",
    reuseExistingServer: false,
  },
  reporter: "list",
});

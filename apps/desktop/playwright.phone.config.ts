import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./phone-tests",
  use: { baseURL: "http://127.0.0.1:1538", channel: "msedge", viewport: {width:390,height:844} },
  webServer: {command: "npx vite ../phone --host 127.0.0.1 --port 1538 --strictPort",url:"http://127.0.0.1:1538",reuseExistingServer:false},
  reporter:"list",
});

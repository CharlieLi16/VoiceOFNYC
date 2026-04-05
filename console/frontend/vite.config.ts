import type { ServerResponse } from "node:http";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import type { ProxyOptions } from "vite";

const BACKEND_DEV = "http://127.0.0.1:8765";

const apiProxy: ProxyOptions = {
  target: BACKEND_DEV,
  changeOrigin: true,
  configure(proxy) {
    proxy.on("error", (err, _req, res) => {
      const sr = res as ServerResponse | undefined;
      if (sr && !sr.headersSent) {
        sr.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        sr.end(
          JSON.stringify({
            detail:
              "开发环境后端未启动（127.0.0.1:8765）。在 console/backend 虚拟环境中执行：python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8765。详见 console/README.md。",
          })
        );
        return;
      }
      console.error("[vite proxy /api]", err instanceof Error ? err.message : err);
    });
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": apiProxy,
      "/ws": { target: "ws://127.0.0.1:8765", ws: true },
    },
    host: true,
    /** 避免浏览器强缓存 public/vote/*.js、*.html，改代码后 localhost 仍显示旧逻辑 */
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages 배포 시 base는 repo 이름과 일치해야 함
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = process.env.BASE_PATH || (repoName ? `/${repoName}/` : "./");

const APP_NAME = "자산관리 앱";
const APP_SHORT = "자산관리";

export default defineConfig({
  base,
  // 보다 넓은 브라우저 호환 (Naver Whale, Edge, Safari, 구형 Chrome 포함)
  // 한국 Whale은 Chromium 기반이지만 메이저 버전이 Chrome보다 약간 늦음.
  build: {
    target: ["chrome87", "edge88", "firefox78", "safari14"],
    sourcemap: true   // 임시 — 디버깅을 위해 sourcemap 노출
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "profile.jpeg", "*.png"],
      manifest: {
        name: APP_NAME,
        short_name: APP_SHORT,
        description: "개인 자산관리 캘린더",
        theme_color: "#C08080",
        background_color: "#FAF5F3",
        display: "standalone",
        orientation: "portrait",
        start_url: base,
        scope: base,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,jpeg,jpg}"],
        // 새 SW가 바로 활성화되고 옛 캐시는 정리 → 업데이트 후 흰 화면 방지
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      }
    })
  ]
});

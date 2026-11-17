import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three") || id.includes("globe.gl") || id.includes("three-globe")) return "globe"
          if (id.includes("maplibre-gl")) return "map"
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})

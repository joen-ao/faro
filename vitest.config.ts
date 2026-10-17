import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    testTimeout: 60000,
    maxWorkers: 3,
    hookTimeout: 60000,
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    coverage: { provider: "v8", include: ["src/features/**", "src/integrations/**", "src/lib/**", "src/db/**"], reporter: ["text", "html"], exclude: ["**/*.sql", "**/migrations/**"] },
  },
});

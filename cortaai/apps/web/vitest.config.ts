import { defineConfig } from "vitest/config";

// Testes da matemática pura do editor (sem DOM). O static export do Next não é
// afetado — vitest roda só via `npm run test`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

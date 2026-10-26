import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests live next to the code they test, named *.test.ts. Run them with `npm test`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});

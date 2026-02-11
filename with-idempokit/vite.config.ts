import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
  resolve: {
    alias: {
      // Map your local packages to their source files
      "@idempotkit/core": resolve(
        __dirname,
        "../../idempokit/core/src/index.ts",
      ),
      "@idempotkit/redis-adapter": resolve(
        __dirname,
        "../../idempokit/adapters/redis/src/index.ts",
      ),
      "@idempotkit/postgres-adapter": resolve(
        __dirname,
        "../../idempokit/adapters/postgres/src/index.ts",
      ),
      "@idempotkit/mongodb-adapter": resolve(
        __dirname,
        "../../idempokit/adapters/mongodb/src/index.ts",
      ),
    },
  },
});

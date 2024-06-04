import { defineConfig } from "tsup";

export default [
  defineConfig({
    entry: [
      "src/client.ts",
      "src/runtime.ts",
      "src/server.node.ts",
      "src/server.ts",
    ],
    format: ["cjs"],
    platform: "node",
    dts: true,
    external: ["react", "turbo-stream"],
  }),
  defineConfig({
    entry: [
      "src/client.ts",
      "src/runtime.ts",
      "src/server.node.ts",
      "src/server.ts",
    ],
    format: ["esm"],
    platform: "node",
    dts: true,
    external: ["react", "turbo-stream"],
  }),
];

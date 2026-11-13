import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

import { defineConfig } from "tsdown";

const require = createRequire(import.meta.url);
// The bundled SDK version is reported to Langfuse through
// `x-langfuse-sdk-version`. Read it from the installed package so the header
// can never drift from the SDK that actually produced the spans. Resolved via
// the entry point because the package does not export `./package.json`.
const sdkPackage = path.join(path.dirname(require.resolve("@langfuse/otel")), "..", "package.json");
const { version: langfuseSdkVersion } = JSON.parse(readFileSync(sdkPackage, "utf8")) as {
  version: string;
};

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node22",
  define: {
    __LANGFUSE_SDK_VERSION__: JSON.stringify(langfuseSdkVersion),
  },
  noExternal: [/^@langfuse\//, /^@opentelemetry\//],
  dts: false,
  clean: true,
  minify: false,
  outputOptions: {
    inlineDynamicImports: true,
  },
});

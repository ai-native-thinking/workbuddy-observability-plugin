/**
 * Injected at build time by `tsdown` (`define` in `tsdown.config.ts`) from the
 * installed `@langfuse/otel` package version. Kept as a build-time constant so
 * the runtime bundle has no dependency on the Langfuse SDK's package metadata.
 */
declare const __LANGFUSE_SDK_VERSION__: string;

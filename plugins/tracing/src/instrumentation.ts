import { LangfuseSpanProcessor } from "@langfuse/otel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import type { Config } from "./config.js";
import { createProxyAgentFactory } from "./proxy.js";
import { debugLog } from "./utils.js";

export type Instrumentation = { shutdown: () => Promise<void> };

type ProcessorParams = NonNullable<ConstructorParameters<typeof LangfuseSpanProcessor>[0]>;
type SpanExporter = NonNullable<ProcessorParams["exporter"]>;

const DEFAULT_TIMEOUT_SECONDS = 5;

/**
 * Filled in by `tsdown` at build time from the installed `@langfuse/otel`
 * version. Absent under `vitest`, where no bundler runs the substitution.
 */
const SDK_VERSION =
  typeof __LANGFUSE_SDK_VERSION__ === "string" ? __LANGFUSE_SDK_VERSION__ : "unknown";

/**
 * `LangfuseSpanProcessor` builds its own OTLP exporter, and that exporter uses
 * `node:https` agents which ignore `HTTPS_PROXY`. When a proxy is configured we
 * therefore construct the exporter ourselves with a tunneling agent factory.
 * The endpoint and headers mirror Langfuse's own defaults.
 */
function createProxyExporter(config: Config): SpanExporter {
  const authHeader = Buffer.from(`${config.public_key}:${config.secret_key}`).toString("base64");
  debugLog(`exporting spans through proxy ${config.proxy_url}`);
  return new OTLPTraceExporter({
    url: `${config.base_url}/api/public/otel/v1/traces`,
    headers: {
      Authorization: `Basic ${authHeader}`,
      "x-langfuse-sdk-name": "javascript",
      "x-langfuse-sdk-version": SDK_VERSION,
      "x-langfuse-public-key": config.public_key ?? "<missing>",
      // Langfuse v4: a custom OTLP exporter that does not declare the ingestion
      // version is treated as legacy OpenTelemetry and its data can lag by up to
      // 15 minutes. The Langfuse SDK's own exporter opts in implicitly by
      // identifying itself; ours replaces that exporter, so opt in explicitly.
      "x-langfuse-ingestion-version": "4",
    },
    timeoutMillis: DEFAULT_TIMEOUT_SECONDS * 1000,
    // `httpAgentOptions` also accepts an agent factory; the published types only
    // declare `http.AgentOptions`, hence the cast.
    httpAgentOptions: createProxyAgentFactory(config.proxy_url!) as never,
  });
}

export function setupInstrumentation(config: Config): Instrumentation {
  const exporter = config.proxy_url ? createProxyExporter(config) : undefined;
  // Media uploads go through `fetch`, which the proxy agent does not cover, so
  // they default to off whenever a proxy is configured.
  const mediaUploadEnabled = config.media_upload ?? (config.proxy_url ? false : undefined);
  const spanProcessor = new LangfuseSpanProcessor({
    publicKey: config.public_key,
    secretKey: config.secret_key,
    baseUrl: config.base_url,
    environment: config.environment,
    exportMode: "batched",
    shouldExportSpan: () => true,
    ...(exporter ? { exporter } : {}),
    ...(mediaUploadEnabled === undefined ? {} : { mediaUploadEnabled }),
  });
  const provider = new NodeTracerProvider({ spanProcessors: [spanProcessor] });
  provider.register();
  return {
    shutdown: async () => {
      await spanProcessor.forceFlush();
      await provider.shutdown();
    },
  };
}

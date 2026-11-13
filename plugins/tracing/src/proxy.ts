import * as http from "node:http";
import * as https from "node:https";
import type { Duplex } from "node:stream";
import * as tls from "node:tls";

import { debugLog } from "./utils.js";

type ConnectOptions = tls.ConnectionOptions & {
  host?: string;
  hostname?: string;
  port?: string | number;
  servername?: string;
};

/**
 * `https.Agent` that reaches the target through an HTTP CONNECT proxy
 * (for example `http://127.0.0.1:7897`).
 *
 * The OpenTelemetry Node exporters build their own agents and never read
 * `HTTPS_PROXY`, so a proxy has to be injected through the exporter's agent
 * factory. This class is the agent handed to that factory.
 */
export class HttpsProxyAgent extends https.Agent {
  private readonly proxy: URL;

  constructor(proxyUrl: string, options: https.AgentOptions = {}) {
    super({ keepAlive: true, ...options });
    this.proxy = new URL(proxyUrl);
  }

  override createConnection(
    options: http.ClientRequestArgs,
    callback?: (error: Error | null, stream: Duplex) => void,
  ): Duplex | null | undefined {
    const host = String(options.host ?? options.hostname ?? "localhost");
    const port = String(options.port ?? 443);
    this.tunnel(host, port, options as ConnectOptions).then(
      (socket) => callback?.(null, socket),
      (error: Error) => callback?.(error, null as unknown as Duplex),
    );
    // The socket is delivered asynchronously through the callback.
    return undefined;
  }

  private tunnel(host: string, port: string, options: ConnectOptions): Promise<tls.TLSSocket> {
    const proxyHost = this.proxy.hostname;
    const proxyPort = Number(this.proxy.port || (this.proxy.protocol === "https:" ? 443 : 80));
    const proxyIsSecure = this.proxy.protocol === "https:";

    const headers: Record<string, string> = { host: `${host}:${port}` };
    if (this.proxy.username || this.proxy.password) {
      const credentials = `${decodeURIComponent(this.proxy.username)}:${decodeURIComponent(this.proxy.password)}`;
      headers["proxy-authorization"] = `Basic ${Buffer.from(credentials).toString("base64")}`;
    }

    debugLog(`connecting to ${host}:${port} through proxy ${proxyHost}:${proxyPort}`);

    return new Promise<tls.TLSSocket>((resolve, reject) => {
      const transport = proxyIsSecure ? https : http;
      const request = transport.request({
        host: proxyHost,
        port: proxyPort,
        method: "CONNECT",
        path: `${host}:${port}`,
        headers,
        agent: false,
      });

      request.once("connect", (response, socket) => {
        if (response.statusCode !== 200) {
          socket.destroy();
          reject(new Error(`proxy CONNECT ${host}:${port} failed with ${response.statusCode}`));
          return;
        }
        const secured = tls.connect({
          ...options,
          socket,
          servername: options.servername ?? host,
        });
        secured.once("error", reject);
        secured.once("secureConnect", () => resolve(secured));
      });
      request.once("error", (error: Error) => reject(error));
      request.end();
    });
  }
}

/**
 * Build the agent factory expected by `@opentelemetry/otlp-exporter-base`.
 * HTTPS traffic is tunneled through the proxy; plain HTTP (a local collector,
 * for example) connects directly.
 */
export function createProxyAgentFactory(proxyUrl: string) {
  let httpsAgent: HttpsProxyAgent | undefined;
  let httpAgent: http.Agent | undefined;
  return async (protocol: string): Promise<http.Agent> => {
    if (protocol === "http:") {
      httpAgent ??= new http.Agent({ keepAlive: true });
      return httpAgent;
    }
    httpsAgent ??= new HttpsProxyAgent(proxyUrl);
    return httpsAgent;
  };
}

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getConfig } from "../src/config.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("configuration", () => {
  it("resolves global, project, then WorkBuddy-specific environment values", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "workbuddy-langfuse-"));
    temporary.push(root);
    const home = path.join(root, "home");
    const cwd = path.join(root, "project");
    await fs.mkdir(path.join(home, ".workbuddy"), { recursive: true });
    await fs.mkdir(path.join(cwd, ".workbuddy"), { recursive: true });
    await fs.writeFile(
      path.join(home, ".workbuddy", "langfuse.json"),
      JSON.stringify({ enabled: true, public_key: "global", max_chars: 100 }),
    );
    await fs.writeFile(
      path.join(cwd, ".workbuddy", "langfuse.json"),
      JSON.stringify({ public_key: "project", tags: ["project"] }),
    );

    const config = await getConfig({
      home,
      cwd,
      env: {
        LANGFUSE_PUBLIC_KEY: "standard",
        LANGFUSE_WORKBUDDY_PUBLIC_KEY: "workbuddy",
        LANGFUSE_WORKBUDDY_SECRET_KEY: "secret",
        LANGFUSE_WORKBUDDY_TAGS: "one,two",
      },
    });
    expect(config.enabled).toBe(true);
    expect(config.public_key).toBe("workbuddy");
    expect(config.secret_key).toBe("secret");
    expect(config.tags).toEqual(["one", "two"]);
    expect(config.max_chars).toBe(100);
  });
});

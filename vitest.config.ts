import { readFileSync } from "fs";
import { getViteConfig } from "astro/config";

function loadDevVars(): Record<string, string> {
  try {
    const content = readFileSync(".dev.vars", "utf8");
    const vars: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const match = /^([A-Z_][A-Z0-9_]*)=(.+)$/.exec(line);
      if (match) vars[match[1]] = match[2].trim();
    }
    return vars;
  } catch {
    return {};
  }
}

export default getViteConfig({
  test: { environment: "node", env: loadDevVars() },
});

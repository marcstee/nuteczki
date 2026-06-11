import { getViteConfig } from "astro/config";
import { parseDevVars } from "./src/test/supabase-it";

export default getViteConfig({
  test: { environment: "node", env: parseDevVars() },
});

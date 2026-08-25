import { it } from "vitest";
import { performAnalysis } from "../src/lib/engine";
it("re-runs analysis for deal 148", async () => {
  const t = Date.now();
  await performAnalysis(148);
  console.log(`\n>>> finished in ${((Date.now() - t) / 1000).toFixed(0)}s`);
});

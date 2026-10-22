import { createRunServer } from "./server.ts";
import { parseChainSource } from "./parser-adapter.ts";
import { loadRuntimeConfig } from "./settings.ts";
import { checkChain } from "./checker-adapter.ts";

async function main(): Promise<void> {
  const config = await loadRuntimeConfig();
  const server = createRunServer(parseChainSource, checkChain, config.model, config.prices);
  const port = Number(process.env.PORT ?? "4174");
  server.listen(port, "127.0.0.1", () => {
    console.log("PromptLang runtime is at http://127.0.0.1:" + port);
    console.log("Mode: " + config.model.mode + ". The cost shown in the page is an estimate.");
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
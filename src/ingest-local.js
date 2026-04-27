import { fileURLToPath } from "node:url";
import db from "./db.js";
import { ingestAll } from "./ingest.js";

async function run() {
  const start = Date.now();
  const stats = await ingestAll(db);
  const duration = Date.now() - start;
  console.log(JSON.stringify({ durationMs: duration, stats }, null, 2));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

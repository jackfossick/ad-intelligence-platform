/**
 * Run an Apify actor and save raw output to /data/raw/
 *
 * Usage:
 *   npm run scrape -- --actor apify/facebook-ads-scraper --input scripts/inputs/facebook.json
 *
 * The --input flag is optional. If omitted, the actor will run with no input.
 */

import { ApifyClient } from "apify-client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.APIFY_TOKEN;
if (!token) {
  console.error("ERROR: APIFY_TOKEN is not set in your .env file.");
  console.error("Add it to .env: APIFY_TOKEN=your_token_here");
  process.exit(1);
}

const args = process.argv.slice(2);
const actorFlag = args.indexOf("--actor");
const inputFlag = args.indexOf("--input");

if (actorFlag === -1 || !args[actorFlag + 1]) {
  console.error("Usage: npm run scrape -- --actor ACTOR_NAME [--input input.json]");
  console.error("\nExample actors:");
  console.error("  apify/facebook-ads-scraper");
  console.error("  clockworks/tiktok-scraper");
  console.error("  apify/instagram-scraper");
  process.exit(1);
}

const actorName = args[actorFlag + 1];
let input: Record<string, unknown> = {};

if (inputFlag !== -1 && args[inputFlag + 1]) {
  const inputFile = args[inputFlag + 1];
  if (!fs.existsSync(inputFile)) {
    console.error(`ERROR: Input file not found: ${inputFile}`);
    process.exit(1);
  }
  input = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
}

async function run() {
  const client = new ApifyClient({ token });

  console.log(`\nStarting Apify actor: ${actorName}`);
  if (Object.keys(input).length > 0) {
    console.log("Input:", JSON.stringify(input, null, 2));
  }

  let run;
  try {
    run = await client.actor(actorName).call(input, { waitSecs: 300 });
  } catch (err) {
    console.error(`\nERROR: Failed to run actor "${actorName}"`);
    console.error("Check that:");
    console.error("  1. The actor name is correct (format: username/actor-name)");
    console.error("  2. Your APIFY_TOKEN has access to this actor");
    console.error("  3. You have enough Apify credits");
    console.error("\nError detail:", err);
    process.exit(1);
  }

  console.log(`\nActor finished. Status: ${run.status}`);
  console.log("Fetching results…");

  const dataset = await client.dataset(run.defaultDatasetId).listItems();
  const items = dataset.items;

  console.log(`Got ${items.length} records.`);

  if (items.length === 0) {
    console.warn("WARNING: The actor returned 0 records. Check your input settings.");
    process.exit(0);
  }

  // Save raw output
  const rawDir = path.resolve("data/raw");
  if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const actorSlug = actorName.replace("/", "--");
  const filename = `${actorSlug}--${timestamp}.json`;
  const filepath = path.join(rawDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(items, null, 2), "utf-8");
  console.log(`\nRaw data saved to: data/raw/${filename}`);

  // Log scrape run to database via the local API (if app is running)
  try {
    await fetch("http://localhost:3000/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor: actorName,
        status: "completed",
        raw_file: `data/raw/${filename}`,
        record_count: items.length,
      }),
    });
    console.log("Scrape run logged to database.");
  } catch {
    console.log("(App not running — scrape run not logged to dashboard. Start with npm run dev to track runs.)");
  }

  console.log(`\nDone! Next step: run npm run normalize to process this data.`);
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

/**
 * Export the full ad database to a CSV file in /data/exports/
 *
 * Usage:
 *   npm run export-csv
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function run() {
  console.log("\nExporting database to CSV…");

  let csv: string;
  try {
    const res = await fetch("http://localhost:3000/api/export");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csv = await res.text();
  } catch {
    console.error("ERROR: Could not connect to the app at http://localhost:3000");
    console.error("Make sure the app is running: npm run dev");
    process.exit(1);
  }

  const exportsDir = path.resolve("data/exports");
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `ads-export-${timestamp}.csv`;
  const filepath = path.join(exportsDir, filename);

  fs.writeFileSync(filepath, csv, "utf-8");
  console.log(`Exported to: data/exports/${filename}`);
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

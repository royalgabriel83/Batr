import { createClient } from "@supabase/supabase-js";

import { readFileSync, existsSync } from "node:fs";

const envPath = new URL("../apps/web/.env.local", import.meta.url);
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match && match[1] && match[2]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function main() {
  const { data: offers, error } = await supabase
    .from("offers")
    .select("id, title, category, condition, status, area, published_at, profiles:profiles!offers_owner_id_fkey(display_name), offer_photos(id, position)")
    .eq("status", "active")
    .order("published_at", { ascending: false });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Active marketplace offers: ${offers.length}\n`);
  for (const o of offers) {
    console.log(`• ${o.title}`);
    console.log(`  Category: ${o.category} | Condition: ${o.condition} | Area: ${o.area}`);
    console.log(`  Owner: ${o.profiles?.display_name || "Anonymous"} | Photos: ${o.offer_photos?.length || 0}`);
    console.log();
  }
}

main();

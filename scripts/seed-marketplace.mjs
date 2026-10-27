import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const sharp = require("sharp");

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
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase credentials in environment or apps/web/.env.local");
}

// Admin client for managing auth users
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_MEMBERS = [
  { email: "alex.trade@example.com", name: "Alex R.", password: "Password123!" },
  { email: "sarah.craft@example.com", name: "Sarah K.", password: "Password123!" },
  { email: "marcus.gear@example.com", name: "Marcus T.", password: "Password123!" },
  { email: "elena.studio@example.com", name: "Elena M.", password: "Password123!" },
];

const SAMPLE_OFFERS = [
  {
    ownerIdx: 0,
    title: "Canon AE-1 Program 35mm SLR Camera with 50mm f/1.8",
    category: "electronics",
    condition: "good",
    offering_text: "Canon AE-1 Program 35mm SLR camera with 50mm f/1.8 lens & strap.",
    wants_text: "Acoustic guitar, custom keyboard, or espresso grinder.",
    description: "Classic 1980s 35mm film camera in great vintage working order. Shutter fires crisply at all speeds with zero squeak. Metering is accurate and optics are clear of fungus and haze. Minor cosmetic brassing on baseplate.",
    area: "ibadan_bodija",
    exchange_mode: "either",
    handover_methods: ["collection", "public_meetup", "delivery"],
    photo_url: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80",
    alt_text: "Vintage black and silver 35mm SLR film camera resting on a wooden desk",
  },
  {
    ownerIdx: 2,
    title: "Keychron Q1 Pro Custom 75% Mechanical Keyboard",
    category: "electronics",
    condition: "like_new",
    offering_text: "CNC aluminum 75% mechanical keyboard with lubed Gateron Browns.",
    wants_text: "Sony ANC headphones, ergonomic chair, or 4K monitor.",
    description: "Solid CNC aluminum body with double gasket mount design. Includes hot-swappable PCB, south-facing RGB, and custom braided USB-C cable with original keycap puller. Barely used as a secondary setup.",
    area: "ibadan_jericho",
    exchange_mode: "either",
    handover_methods: ["collection", "public_meetup", "delivery"],
    photo_url: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1200&q=80",
    alt_text: "Custom mechanical keyboard with artisan keycaps on a minimal dark desk mat",
  },
  {
    ownerIdx: 3,
    title: "Audio-Technica ATH-M50x Studio Headphones",
    category: "electronics",
    condition: "like_new",
    offering_text: "Over-ear studio monitor headphones with coiled and straight cables.",
    wants_text: "Vintage film camera, USB audio interface, or camping gear.",
    description: "Outstanding neutral audio reproduction. Headband and ear pads in pristine condition with no flaking or signs of wear. Comes with original protective faux-leather carry pouch and 6.3mm adapter.",
    area: "ibadan_agodi",
    exchange_mode: "either",
    handover_methods: ["collection", "public_meetup", "delivery"],
    photo_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80",
    alt_text: "High-end studio over-ear headphones displayed against a vibrant backdrop",
  },
  {
    ownerIdx: 1,
    title: "Yamaha FG800 Solid Spruce Top Acoustic Guitar",
    category: "other",
    condition: "good",
    offering_text: "Solid Sitka spruce top acoustic guitar with padded gig bag.",
    wants_text: "54-56cm road bicycle, mechanical keyboard, or power drill set.",
    description: "Excellent resonant tone and low action, recently restrung with D'Addario Phosphor Bronze lights. Fretboard is clean and conditioned. One tiny cosmetic mark on the lower bout, completely cosmetic.",
    area: "ibadan_ring_road",
    exchange_mode: "in_person",
    handover_methods: ["collection", "public_meetup"],
    photo_url: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=1200&q=80",
    alt_text: "Close-up of an acoustic guitar's soundhole, spruce soundboard, and steel strings",
  },
  {
    ownerIdx: 3,
    title: "Arturia KeyLab Essential 49-Key MIDI Controller",
    category: "other",
    condition: "like_new",
    offering_text: "49-key velocity-sensitive MIDI controller with rotary encoders.",
    wants_text: "Mirrorless camera lens, road bike, or espresso gear.",
    description: "Complete studio control keyboard in mint condition. Keys and pitch bend/modulation wheels have firm resistance. Used only in a smoke-free home recording room. Original box included.",
    area: "ibadan_ui",
    exchange_mode: "either",
    handover_methods: ["collection", "public_meetup", "delivery"],
    photo_url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80",
    alt_text: "Black and white keys and control sliders of an electronic synthesizer keyboard",
  },
  {
    ownerIdx: 0,
    title: "Peugeot Vintage Steel Frame Road Bicycle (56cm)",
    category: "sports_outdoors",
    condition: "good",
    offering_text: "Classic 56cm lugged steel road bike, Shimano 105, new Continental tires.",
    wants_text: "Acoustic guitar, 35mm film camera kit, or lever espresso machine.",
    description: "Lovingly restored vintage road racer with smooth shifting and crisp caliper brakes. New bar tape, inner tubes, and brake cables installed last month. Rides fast and smooth on city tarmac.",
    area: "ibadan_dugbe",
    exchange_mode: "in_person",
    handover_methods: ["collection", "public_meetup"],
    photo_url: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80",
    alt_text: "Vintage road bike parked outdoors beside an urban brick wall",
  },
  {
    ownerIdx: 2,
    title: "MSR Hubba Hubba NX 2-Person Backpacking Tent",
    category: "sports_outdoors",
    condition: "like_new",
    offering_text: "Ultralight 2-person freestanding 3-season tent with rainfly & footprint.",
    wants_text: "Cycling equipment, bouldering crash pad, or power tools.",
    description: "Weighs under 1.7kg, ideal for multi-day trekking. Only pitched twice on clean grass. Seams are factory sealed and watertight; mosquito mesh is immaculate with zero tears.",
    area: "ibadan_samonda",
    exchange_mode: "either",
    handover_methods: ["collection", "public_meetup", "delivery"],
    photo_url: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=1200&q=80",
    alt_text: "Orange camping tent pitched in a clearing in the woods at dusk",
  },
  {
    ownerIdx: 1,
    title: "La Pavoni Europiccola Manual Lever Espresso Machine",
    category: "home_garden",
    condition: "good",
    offering_text: "Chrome lever espresso machine with 51mm portafilter & tamper.",
    wants_text: "Gravel bike, quality 35mm camera, or Danish armchair.",
    description: "Iconic Italian chrome lever machine capable of pulling authentic barista-quality espresso shots with rich crema. Boiler gaskets and grouphead seal were recently replaced. Heats up quickly.",
    area: "ibadan_bodija",
    exchange_mode: "in_person",
    handover_methods: ["collection", "public_meetup"],
    photo_url: "https://images.unsplash.com/photo-1517668808822-9ebb02ae2a0e?auto=format&fit=crop&w=1200&q=80",
    alt_text: "Espresso machine brewing rich espresso coffee with golden crema",
  },
  {
    ownerIdx: 1,
    title: "Mid-Century Solid Teak Lounge Armchair",
    category: "home_garden",
    condition: "good",
    offering_text: "Solid Danish-style oiled teak armchair with charcoal wool upholstery.",
    wants_text: "High-end bicycle, musical instruments, or MacBook/iPad.",
    description: "Beautiful organic sculpted teak wood frame with finger joint details. Sturdy and squeak-free. Upholstered cushions were professionally dry-cleaned. Perfect reading chair for a living room.",
    area: "ibadan_jericho",
    exchange_mode: "in_person",
    handover_methods: ["collection"],
    photo_url: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1200&q=80",
    alt_text: "Scandinavian style mid-century modern wooden armchair in an airy interior",
  },
  {
    ownerIdx: 0,
    title: "DeWalt 20V MAX XR Brushless Cordless Drill Kit",
    category: "other",
    condition: "like_new",
    offering_text: "Brushless 20V drill/driver, two 2.0Ah batteries, charger & hard case.",
    wants_text: "Camping gear, road cycling parts, or an acoustic guitar.",
    description: "High-efficiency brushless motor delivering 340 UWO. Barely used on a single shelving project. Both batteries hold 100% full charge, LED worklight and chuck run true.",
    area: "ibadan_mokola",
    exchange_mode: "either",
    handover_methods: ["collection", "public_meetup", "delivery"],
    photo_url: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=80",
    alt_text: "Yellow cordless power drill and workshop tools laid out on a workbench",
  },
];

async function seed() {
  console.log("=== Starting Marketplace Seeding via Supabase RPC ===");

  // 1. Authenticate or create demo member clients
  const memberClients = [];
  for (const m of DEMO_MEMBERS) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Sign in to get session
    let { data: authData, error: signInErr } = await userClient.auth.signInWithPassword({
      email: m.email,
      password: m.password,
    });

    if (signInErr) {
      console.log(`Creating user ${m.email}...`);
      const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
        email: m.email,
        password: m.password,
        email_confirm: true,
        user_metadata: { display_name: m.name },
      });
      if (createErr) throw createErr;
      const res = await userClient.auth.signInWithPassword({
        email: m.email,
        password: m.password,
      });
      authData = res.data;
    }

    const userId = authData.user.id;
    // Ensure display_name on public.profiles using adminClient
    await adminClient.from("profiles").upsert({ id: userId, display_name: m.name });

    console.log(`[Member Ready] ${m.name} (${m.email})`);
    memberClients.push({ client: userClient, id: userId, name: m.name });
  }

  // 2. Create, upload photos, and publish offers
  let successCount = 0;
  for (const item of SAMPLE_OFFERS) {
    const member = memberClients[item.ownerIdx];
    const client = member.client;

    console.log(`\nCreating: "${item.title}" by ${member.name}...`);

    // A. Call offer_create RPC
    const createKey = randomUUID();
    const { data: offerData, error: createErr } = await client.rpc("offer_create", {
      p_fields: {
        title: item.title,
        category: item.category,
        condition: item.condition,
        offering_text: item.offering_text,
        wants_text: item.wants_text,
        description: item.description,
        area: item.area,
        exchange_mode: item.exchange_mode,
        handover_methods: item.handover_methods,
      },
      p_idempotency_key: createKey,
    });

    if (createErr) {
      console.error(`  offer_create failed:`, createErr);
      continue;
    }

    const offerId = offerData.id;
    console.log(`  Draft created with ID: ${offerId}`);

    // B. Download and optimize image
    console.log(`  Downloading image from CDN...`);
    const imgRes = await fetch(item.photo_url);
    if (!imgRes.ok) {
      console.warn(`  Failed image fetch: ${imgRes.statusText}`);
      continue;
    }
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer());

    const displayBuffer = await sharp(rawBuffer)
      .resize(1200, 900, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const thumbBuffer = await sharp(rawBuffer)
      .resize(400, 300, { fit: "cover" })
      .webp({ quality: 75 })
      .toBuffer();

    const displayMeta = await sharp(displayBuffer).metadata();
    const photoId = randomUUID();

    const displayPath = `${member.id}/${offerId}/${photoId}-display.webp`;
    const thumbPath = `${member.id}/${offerId}/${photoId}-thumb.webp`;

    console.log(`  Uploading WebP photos to storage...`);
    const { error: upDispErr } = await client.storage
      .from("offer-photos")
      .upload(displayPath, displayBuffer, { contentType: "image/webp" });
    if (upDispErr) {
      console.error(`  Display upload error:`, upDispErr);
      continue;
    }

    const { error: upThumbErr } = await client.storage
      .from("offer-photos")
      .upload(thumbPath, thumbBuffer, { contentType: "image/webp" });
    if (upThumbErr) {
      console.error(`  Thumb upload error:`, upThumbErr);
      continue;
    }

    // C. Call offer_photo_add RPC
    const photoKey = randomUUID();
    const photoHash = createHash("sha256").update(displayBuffer).digest("hex");
    const { data: photoData, error: photoErr } = await client.rpc("offer_photo_add", {
      p_offer_id: offerId,
      p_expected_status: "draft",
      p_expected_revision: 1,
      p_photo_id: photoId,
      p_width: displayMeta.width || 1200,
      p_height: displayMeta.height || 900,
      p_request_hash: photoHash,
      p_alt_text: item.alt_text,
      p_idempotency_key: photoKey,
    });

    if (photoErr) {
      console.error(`  offer_photo_add failed:`, photoErr);
      continue;
    }

    console.log(`  Photo attached. Offer revision is now: ${photoData.revision}`);

    // D. Call offer_publish RPC
    const pubKey = randomUUID();
    const { data: pubData, error: pubErr } = await client.rpc("offer_publish", {
      p_offer_id: offerId,
      p_expected_status: "draft",
      p_expected_revision: photoData.revision,
      p_idempotency_key: pubKey,
    });

    if (pubErr) {
      console.error(`  offer_publish failed:`, pubErr);
      continue;
    }

    successCount++;
    console.log(`  ✓ LIVE & PUBLISHED: "${pubData.title}" (${offerId})`);
  }

  console.log(`\n=== Successfully seeded and published ${successCount} offers with real photos! ===`);
}

seed().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});

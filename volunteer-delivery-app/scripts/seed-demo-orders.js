/**
 * seed-demo-orders.js
 *
 * Creates realistic demo data for the FPN Delivery app:
 *   - 6 Newark, OH customer accounts (auth + customers table)
 *   - 2 volunteer accounts (auth + volunteers table)
 *   - Orders in all four status stages with real Newark addresses
 *   - Boxes and order_items linked to live menu items
 *
 * Usage:
 *   node scripts/seed-demo-orders.js
 *
 * Safe to re-run: existing demo auth users are updated in place;
 * previously seeded orders are deleted before new ones are inserted.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// ── Env ───────────────────────────────────────────────────────────────────────

const ENV_PATH = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const sep = trimmed.indexOf("=");
      if (sep <= 0) return;
      const key = trimmed.slice(0, sep).trim();
      let val = trimmed.slice(sep + 1).trim();
      if (!process.env[key]) {
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
          val = val.slice(1, -1);
        process.env[key] = val;
      }
    });
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const rnd = () => crypto.randomBytes(24).toString("hex");
const requesterEmail = (phone) => `requester+${phone}@demo.local`;
const volunteerEmail = (tag) => `volunteer+${tag}@demo.local`;
const DEMO_PASSWORD = "DemoFPN2025!";

const WORKAROUND_PREFIX = "WORKAROUND_ORDER_META::";
const SEED_MARKER = "seeded_demo";

function buildNotes(userNotes = "") {
  return `${WORKAROUND_PREFIX}${JSON.stringify({
    selectedItems: [],
    userNotes,
    tracking: null,
    [SEED_MARKER]: true,
  })}`;
}

function isoHoursAgo(h) {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}
function isoDaysAgo(d) {
  return new Date(Date.now() - d * 86_400_000).toISOString();
}

// ── Customers ────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  {
    phone: "7405550101",
    dob: "06/14/1968",
    firstName: "Maria",
    lastName: "Gonzalez",
    address: "750 W Main St, Newark, OH 43055",
  },
  {
    phone: "7405550102",
    dob: "11/03/1975",
    firstName: "James",
    lastName: "Washington",
    address: "1203 N 21st St, Newark, OH 43055",
  },
  {
    phone: "7405550103",
    dob: "02/27/1982",
    firstName: "Patricia",
    lastName: "Williams",
    address: "632 Mount Vernon Rd Apt 4, Newark, OH 43055",
  },
  {
    phone: "7405550104",
    dob: "09/19/1960",
    firstName: "Robert",
    lastName: "Johnson",
    address: "112 Hillcrest Dr, Newark, OH 43055",
  },
  {
    phone: "7405550105",
    dob: "04/08/1990",
    firstName: "Linda",
    lastName: "Thompson",
    address: "417 Cedar St, Newark, OH 43055",
  },
  {
    phone: "7405550106",
    dob: "07/22/1955",
    firstName: "Michael",
    lastName: "Davis",
    address: "819 W Church St, Newark, OH 43055",
  },
];

// ── Volunteers ────────────────────────────────────────────────────────────────

const VOLUNTEERS = [
  {
    tag: "sarah.chen",
    firstName: "Sarah",
    lastName: "Chen",
    phone: "7405559001",
    zip: "43055",
  },
  {
    tag: "marcus.brown",
    firstName: "Marcus",
    lastName: "Brown",
    phone: "7405559002",
    zip: "43056",
  },
];

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function upsertAuthUser({ email, password, metadata }) {
  // Check if user already exists by paginating auth.admin.listUsers
  let page = 1;
  let found = null;
  while (!found) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    found = data.users.find((u) => u.email === email) ?? null;
    if (found || data.users.length < 200) break;
    page++;
  }

  if (found) {
    const { data, error } = await admin.auth.admin.updateUserById(found.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
    return data.user.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

// ── Step 1: Create / update customers ────────────────────────────────────────

async function seedCustomers() {
  console.log("\n👤  Seeding customers…");
  const ids = {};

  for (const c of CUSTOMERS) {
    const email = requesterEmail(c.phone);
    const metadata = {
      role: "requester",
      first_name: c.firstName,
      last_name: c.lastName,
      phone_number: c.phone,
      username: `requester_${c.phone}`,
    };

    const uid = await upsertAuthUser({ email, password: DEMO_PASSWORD, metadata });

    await admin.from("customers").upsert(
      {
        uid,
        first_name: c.firstName,
        last_name: c.lastName,
        phone_number: c.phone,
        dob: c.dob,
        address: c.address,
        username: `requester_${c.phone}`,
        email,
        IsVolunteer: false,
      },
      { onConflict: "uid" },
    );

    ids[c.phone] = uid;
    console.log(`   ✓ ${c.firstName} ${c.lastName}  (${c.phone})`);
  }

  return ids;
}

// ── Step 2: Create / update volunteers ───────────────────────────────────────

async function seedVolunteers() {
  console.log("\n🚗  Seeding volunteers…");
  const ids = {};

  for (const v of VOLUNTEERS) {
    const email = volunteerEmail(v.tag);
    const metadata = {
      role: "volunteer",
      first_name: v.firstName,
      last_name: v.lastName,
      phone_number: v.phone,
      zip: v.zip,
      username: `volunteer_${v.tag}`,
    };

    const uid = await upsertAuthUser({ email, password: DEMO_PASSWORD, metadata });

    await admin.from("volunteers").upsert(
      {
        uid,
        first_name: v.firstName,
        last_name: v.lastName,
        phone_number: v.phone,
        email,
        zip: v.zip,
      },
      { onConflict: "uid" },
    );

    ids[v.tag] = uid;
    console.log(`   ✓ ${v.firstName} ${v.lastName}  <${email}>`);
  }

  return ids;
}

// ── Step 3: Remove stale demo orders ─────────────────────────────────────────

async function clearOldDemoOrders(customerUids) {
  console.log("\n🗑   Removing previously seeded orders…");
  const { data: old } = await admin
    .from("orders")
    .select("order_id")
    .in("customer_uid", Object.values(customerUids));

  if (!old?.length) {
    console.log("   (none found)");
    return;
  }

  const orderIds = old.map((o) => o.order_id);
  await admin.from("order_items").delete().in("box_id",
    (await admin.from("boxes").select("box_id").in("order_id", orderIds)).data?.map((b) => b.box_id) ?? [],
  );
  await admin.from("boxes").delete().in("order_id", orderIds);
  await admin.from("orders").delete().in("order_id", orderIds);
  console.log(`   Removed ${orderIds.length} order(s).`);
}

// ── Step 4: Fetch live menu items ─────────────────────────────────────────────

async function fetchItems() {
  const { data, error } = await admin
    .from("items")
    .select("id, label, category")
    .eq("active", true);
  if (error) throw new Error(`fetchItems: ${error.message}`);
  return data ?? [];
}

function pickItems(items, categories, count) {
  const pool = items.filter((i) => categories.some((c) => i.category?.toLowerCase().includes(c.toLowerCase())));
  const fallback = items;
  const source = pool.length >= count ? pool : fallback;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ── Step 5: Insert orders with boxes + items ──────────────────────────────────

async function insertOrder({ customerUid, volunteerUid, status, name, address, notes, createdAt, boxCount }) {
  const { data, error } = await admin
    .from("orders")
    .insert({
      customer_uid: customerUid,
      volunteer_uid: volunteerUid ?? null,
      status,
      name,
      delivery_address: address,
      notes,
      box_count: boxCount,
      created_at: createdAt,
    })
    .select("order_id")
    .single();
  if (error) throw new Error(`insertOrder: ${error.message}`);
  return data.order_id;
}

async function insertBoxWithItems(orderId, boxNumber, items) {
  const { data: boxData, error: boxErr } = await admin
    .from("boxes")
    .insert({ order_id: orderId, box_number: boxNumber })
    .select("box_id")
    .single();
  if (boxErr) throw new Error(`insertBox: ${boxErr.message}`);

  const boxId = boxData.box_id;

  if (items.length > 0) {
    const { error: itemErr } = await admin
      .from("order_items")
      .insert(items.map((item) => ({ box_id: boxId, item_id: item.id })));
    if (itemErr) throw new Error(`insertOrderItems: ${itemErr.message}`);
  }

  return boxId;
}

async function seedOrders(customerIds, volunteerIds, items) {
  console.log("\n📦  Seeding orders…");

  const sarah = volunteerIds["sarah.chen"];
  const marcus = volunteerIds["marcus.brown"];

  const orders = [
    // ── Pending (show in volunteer queue) ──────────────────────────────────
    {
      label: "Maria Gonzalez – pending",
      customerPhone: "7405550101",
      volunteerUid: null,
      status: "pending",
      address: "750 W Main St, Newark, OH 43055",
      notes: buildNotes("Please leave at the front door. I work nights."),
      createdAt: isoHoursAgo(1.5),
      boxes: [
        { items: pickItems(items, ["produce", "vegetable", "fruit"], 3) },
        { items: pickItems(items, ["protein", "meat", "dairy"], 2) },
      ],
    },
    {
      label: "Linda Thompson – pending",
      customerPhone: "7405550105",
      volunteerUid: null,
      status: "pending",
      address: "417 Cedar St, Newark, OH 43055",
      notes: buildNotes("Nut allergy — please no peanut butter or tree nuts."),
      createdAt: isoHoursAgo(0.5),
      boxes: [
        { items: pickItems(items, ["grain", "bread", "cereal"], 3) },
      ],
    },

    // ── Accepted (volunteer on the way to pantry) ──────────────────────────
    {
      label: "James Washington – accepted",
      customerPhone: "7405550102",
      volunteerUid: sarah,
      status: "accepted",
      address: "1203 N 21st St, Newark, OH 43055",
      notes: buildNotes("Knock loudly — hard of hearing. Side door preferred."),
      createdAt: isoHoursAgo(3),
      boxes: [
        { items: pickItems(items, ["produce", "canned"], 4) },
      ],
    },

    // ── In Transit (actively being delivered) ─────────────────────────────
    {
      label: "Patricia Williams – in_transit",
      customerPhone: "7405550103",
      volunteerUid: marcus,
      status: "in_transit",
      address: "632 Mount Vernon Rd Apt 4, Newark, OH 43055",
      notes: buildNotes("Apt 4 is on the second floor, up the exterior staircase."),
      createdAt: isoHoursAgo(5),
      boxes: [
        { items: pickItems(items, ["protein", "dairy", "meat"], 3) },
        { items: pickItems(items, ["produce", "snack"], 2) },
      ],
    },

    // ── Delivered – recent (today / yesterday) ─────────────────────────────
    {
      label: "Robert Johnson – delivered (yesterday)",
      customerPhone: "7405550104",
      volunteerUid: sarah,
      status: "delivered",
      address: "112 Hillcrest Dr, Newark, OH 43055",
      notes: buildNotes(""),
      createdAt: isoDaysAgo(1),
      boxes: [
        { items: pickItems(items, ["grain", "canned", "beverage"], 4) },
      ],
    },
    {
      label: "Michael Davis – delivered (2 days ago)",
      customerPhone: "7405550106",
      volunteerUid: marcus,
      status: "delivered",
      address: "819 W Church St, Newark, OH 43055",
      notes: buildNotes("Senior citizen — single-story home, ramp at front."),
      createdAt: isoDaysAgo(2),
      boxes: [
        { items: pickItems(items, ["produce", "dairy"], 3) },
        { items: pickItems(items, ["protein", "grain"], 2) },
      ],
    },
    {
      label: "Maria Gonzalez – delivered (4 days ago)",
      customerPhone: "7405550101",
      volunteerUid: sarah,
      status: "delivered",
      address: "750 W Main St, Newark, OH 43055",
      notes: buildNotes(""),
      createdAt: isoDaysAgo(4),
      boxes: [
        { items: pickItems(items, [], 3) },
      ],
    },
    {
      label: "James Washington – delivered (5 days ago)",
      customerPhone: "7405550102",
      volunteerUid: marcus,
      status: "delivered",
      address: "1203 N 21st St, Newark, OH 43055",
      notes: buildNotes(""),
      createdAt: isoDaysAgo(5),
      boxes: [
        { items: pickItems(items, ["produce", "protein"], 4) },
      ],
    },
  ];

  for (const o of orders) {
    const customerUid = customerIds[o.customerPhone];
    const orderId = await insertOrder({
      customerUid,
      volunteerUid: o.volunteerUid,
      status: o.status,
      name: `${CUSTOMERS.find((c) => c.phone === o.customerPhone)?.firstName ?? ""} ${CUSTOMERS.find((c) => c.phone === o.customerPhone)?.lastName ?? ""}`.trim(),
      address: o.address,
      notes: o.notes,
      createdAt: o.createdAt,
      boxCount: o.boxes.length,
    });

    for (let i = 0; i < o.boxes.length; i++) {
      await insertBoxWithItems(orderId, i + 1, o.boxes[i].items);
    }

    const statusIcon = { pending: "🟡", accepted: "🔵", in_transit: "🟣", delivered: "✅" }[o.status] ?? "⬜";
    console.log(`   ${statusIcon} ${o.label}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  FPN Demo Seed — Newark, OH");
  console.log(`    Supabase: ${SUPABASE_URL}`);

  const customerIds = await seedCustomers();
  const volunteerIds = await seedVolunteers();
  await clearOldDemoOrders(customerIds);

  const items = await fetchItems();
  console.log(`\n🍎  Found ${items.length} active menu item(s) to draw from.`);

  if (items.length === 0) {
    console.warn("   ⚠️  No active items found — boxes will be created empty.");
  }

  await seedOrders(customerIds, volunteerIds, items);

  console.log("\n✅  Seed complete.\n");
  console.log("   Customer login password (for requester flow, phone+DOB used instead):");
  console.log(`     Email pattern: requester+<phone>@demo.local`);
  console.log(`\n   Volunteer credentials (for volunteer sign-in):`);
  for (const v of VOLUNTEERS) {
    console.log(`     ${v.firstName} ${v.lastName}: ${volunteerEmail(v.tag)}  /  ${DEMO_PASSWORD}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error("\n❌  Seed failed:", err.message);
  process.exit(1);
});

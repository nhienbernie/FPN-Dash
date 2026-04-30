import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type LoadedEnv = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type OrderRecord = {
  order_id: number;
};

type BoxRecord = {
  box_id: number;
};

type RequesterAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
};

export type RequesterSeed = {
  phone: string;
  dob: string;
  firstName: string;
  lastName: string;
  address: RequesterAddress;
};

type CustomerRecord = {
  uid: string;
  first_name: string;
  last_name: string;
  address: string;
};

const WORKAROUND_PREFIX = "WORKAROUND_ORDER_META::";
const DEFAULT_REQUESTER_PASSWORD = "e2e-requester-password";

const APP_ROOT = process.cwd();
const ENV_PATH = path.join(APP_ROOT, ".env");

function loadEnvFile(filePath: string): LoadedEnv {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce<LoadedEnv>(
    (env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return env;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        return env;
      }

      const key = trimmed.slice(0, separatorIndex).trim() as keyof LoadedEnv;
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      env[key] = value;
      return env;
    },
    {},
  );
}

function createAdminClient(): SupabaseClient {
  const env = loadEnvFile(ENV_PATH);
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin env vars are required for E2E cleanup.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const adminSupabase = createAdminClient();

function buildRequesterEmail(phone: string) {
  return `requester+${phone}@demo.local`;
}

function buildRequesterUsername(phone: string) {
  return `requester_${phone}`;
}

function formatAddress(address: RequesterAddress) {
  const cityState = [address.city, address.state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, address.zip].filter(Boolean).join(" ");
  return [address.line1, address.line2, cityStateZip].filter(Boolean).join(", ");
}

function buildOrderNotes({
  selectedItems = [],
  userNotes = "",
}: {
  selectedItems?: string[];
  userNotes?: string;
}) {
  const cleanedItems = selectedItems
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  const cleanedNotes = String(userNotes ?? "").trim();

  if (cleanedItems.length === 0) {
    return cleanedNotes || null;
  }

  return `${WORKAROUND_PREFIX}${JSON.stringify({
    selectedItems: cleanedItems,
    userNotes: cleanedNotes,
  })}`;
}

async function listAuthUsersByEmail(email: string) {
  let page = 1;

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find((user) => user.email === email);
    if (match) {
      return match;
    }

    if (data.users.length < 200) {
      return null;
    }

    page += 1;
  }
}

export async function getRequesterUidByPhone(phone: string) {
  const { data, error } = await adminSupabase
    .from("customers")
    .select("uid")
    .eq("phone_number", phone)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.uid ?? null;
}

async function getRequesterByPhone(phone: string) {
  const { data, error } = await adminSupabase
    .from("customers")
    .select("uid, first_name, last_name, address")
    .eq("phone_number", phone)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as CustomerRecord | null) ?? null;
}

async function getRequesterByUid(uid: string) {
  const { data, error } = await adminSupabase
    .from("customers")
    .select("uid, first_name, last_name, address")
    .eq("uid", uid)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as CustomerRecord | null) ?? null;
}

export async function getVolunteerUidByEmail(email: string) {
  const { data, error } = await adminSupabase
    .from("volunteers")
    .select("uid")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.uid) {
    return data.uid;
  }

  const authUser = await listAuthUsersByEmail(email);
  return authUser?.id ?? null;
}

async function listOrdersByColumn(column: "customer_uid" | "volunteer_uid", uid: string) {
  const { data, error } = await adminSupabase
    .from("orders")
    .select("order_id")
    .eq(column, uid);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as OrderRecord[];
}

export async function deleteOrdersByIds(orderIds: number[]) {
  if (orderIds.length === 0) {
    return;
  }

  const { error: reportsError } = await adminSupabase
    .from("reports")
    .delete()
    .in("order_id", orderIds);

  if (reportsError) {
    throw new Error(reportsError.message);
  }

  const { data: boxes, error: boxesError } = await adminSupabase
    .from("boxes")
    .select("box_id")
    .in("order_id", orderIds);

  if (boxesError) {
    throw new Error(boxesError.message);
  }

  const boxIds = ((boxes ?? []) as BoxRecord[]).map((box) => box.box_id);

  if (boxIds.length > 0) {
    const { error: orderItemsError } = await adminSupabase
      .from("order_items")
      .delete()
      .in("box_id", boxIds);

    if (orderItemsError) {
      throw new Error(orderItemsError.message);
    }

    const { error: deleteBoxesError } = await adminSupabase
      .from("boxes")
      .delete()
      .in("box_id", boxIds);

    if (deleteBoxesError) {
      throw new Error(deleteBoxesError.message);
    }
  }

  const { error: deleteOrdersError } = await adminSupabase
    .from("orders")
    .delete()
    .in("order_id", orderIds);

  if (deleteOrdersError) {
    throw new Error(deleteOrdersError.message);
  }
}

export async function resetTestState({
  requesterPhones,
  volunteerEmail,
}: {
  requesterPhones: string[];
  volunteerEmail: string;
}) {
  const volunteerUid = await getVolunteerUidByEmail(volunteerEmail);
  const orderIds = new Set<number>();

  for (const requesterPhone of requesterPhones) {
    const requesterUid = await getRequesterUidByPhone(requesterPhone);
    if (requesterUid) {
      const requesterOrders = await listOrdersByColumn("customer_uid", requesterUid);
      requesterOrders.forEach((order) => orderIds.add(order.order_id));
    }
  }

  if (volunteerUid) {
    const volunteerOrders = await listOrdersByColumn("volunteer_uid", volunteerUid);
    volunteerOrders.forEach((order) => orderIds.add(order.order_id));
  }

  await deleteOrdersByIds([...orderIds]);
}

export async function waitForLatestRequesterOrder(
  requesterPhone: string,
  timeoutMs = 20_000,
) {
  const requesterUid = await getRequesterUidByPhone(requesterPhone);
  if (!requesterUid) {
    throw new Error(`No requester profile found for phone ${requesterPhone}.`);
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await adminSupabase
      .from("orders")
      .select("order_id, status, customer_uid")
      .eq("customer_uid", requesterUid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.order_id) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Timed out waiting for requester order to be created.");
}

export async function ensureRequesterProfile(requester: RequesterSeed) {
  const email = buildRequesterEmail(requester.phone);
  const username = buildRequesterUsername(requester.phone);
  const metadata = {
    role: "requester",
    first_name: requester.firstName,
    last_name: requester.lastName,
    phone_number: requester.phone,
    username,
  };

  const existingAuthUser = await listAuthUsersByEmail(email);
  let authUserId = existingAuthUser?.id ?? null;

  if (authUserId) {
    const { data, error } = await adminSupabase.auth.admin.updateUserById(authUserId, {
      email,
      password: DEFAULT_REQUESTER_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error || !data.user) {
      throw new Error(error?.message || "Unable to update requester auth user.");
    }

    authUserId = data.user.id;
  } else {
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password: DEFAULT_REQUESTER_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error || !data.user) {
      throw new Error(error?.message || "Unable to create requester auth user.");
    }

    authUserId = data.user.id;
  }

  const payload = {
    uid: authUserId,
    first_name: requester.firstName,
    last_name: requester.lastName,
    phone_number: requester.phone,
    dob: requester.dob,
    address: formatAddress(requester.address),
    username,
    email,
    IsVolunteer: false,
  };

  const existingCustomerByPhone = await getRequesterByPhone(requester.phone);
  const existingCustomerByUid = authUserId
    ? await getRequesterByUid(authUserId)
    : null;
  const existingCustomer = existingCustomerByPhone ?? existingCustomerByUid;

  if (existingCustomer) {
    const { error } = await adminSupabase
      .from("customers")
      .update(payload)
      .eq("uid", existingCustomer.uid);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { error } = await adminSupabase.from("customers").insert(payload);

    if (error) {
      throw new Error(error.message);
    }
  }

  return getRequesterByPhone(requester.phone);
}

export async function createPendingOrderForRequester(
  requester: RequesterSeed,
  {
    selectedItems = [],
    userNotes = "",
    boxCount = 1,
  }: {
    selectedItems?: string[];
    userNotes?: string;
    boxCount?: number;
  } = {},
) {
  const customer = await ensureRequesterProfile(requester);
  if (!customer?.uid) {
    throw new Error(`Requester profile missing for phone ${requester.phone}.`);
  }

  const { data, error } = await adminSupabase
    .from("orders")
    .insert({
      customer_uid: customer.uid,
      name: customer.first_name,
      delivery_address: customer.address,
      status: "pending",
      notes: buildOrderNotes({ selectedItems, userNotes }),
      box_count: boxCount,
    })
    .select("order_id, status, customer_uid")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to create pending order.");
  }

  return data;
}

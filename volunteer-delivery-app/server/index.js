const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 4000;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const OTP_CODE_LENGTH = 6;
const DEMO_REQUESTER = {
  phone: "1234567890",
  dob: "01/01/2001",
  code: "123456",
};

const DATA_PATH = path.join(__dirname, "data", "pantry-users.json");
const ENV_PATH = path.join(__dirname, "..", ".env");
const pendingVerifications = new Map();

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const sep = trimmed.indexOf("=");
    if (sep <= 0) return;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if (!process.env[key]) {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
};

loadEnvFile(ENV_PATH);

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseServerConfig = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY
);

const adminSupabase = hasSupabaseServerConfig
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const authSupabase = hasSupabaseServerConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;


// ── Helpers ───────────────────────────────────────────────────────────────────
const normalizePhone = (value = "") => String(value).replace(/\D/g, "");
const normalizeDob = (value = "") => {
  const trimmed = String(value).trim();
  return /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed) ? trimmed : null;
};
const buildVerificationKey = (phone, dob) => `${phone}:${dob}`;
const formatAddress = (address = {}) => {
  const cityState = [address.city, address.state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, address.zip].filter(Boolean).join(" ");
  return [address.line1, address.line2, cityStateZip].filter(Boolean).join(", ");
};
const buildRequesterEmail = (phone) => `requester+${phone}@demo.local`;
const buildRequesterUsername = (phone) => `requester_${phone}`;
const buildSessionPayload = (session) => ({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  token_type: session.token_type,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
});
const buildRandomPassword = () => crypto.randomBytes(24).toString("hex");
const buildVerificationCode = () =>
  crypto.randomInt(0, 10 ** OTP_CODE_LENGTH).toString().padStart(OTP_CODE_LENGTH, "0");
const maskPhone = (phone = "") =>
  phone.length >= 4 ? `***-***-${phone.slice(-4)}` : phone;
const isDemoRequester = (phone, dob) =>
  phone === DEMO_REQUESTER.phone && dob === DEMO_REQUESTER.dob;

const loadPantryUsers = () => {
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const users = JSON.parse(raw);
  if (!Array.isArray(users)) throw new Error("pantry-users.json must be an array.");
  return users.map((user, i) => {
    const phone = normalizePhone(user.phone);
    const dob = normalizeDob(user.dob);
    if (phone.length !== 10)
      throw new Error(`Row ${i + 1}: invalid phone.`);
    if (!dob) throw new Error(`Row ${i + 1}: invalid dob.`);
    return { ...user, phone, dob };
  });
};

const pantryUsers = loadPantryUsers();
const findPantryUser = (phone, dob) =>
  pantryUsers.find((u) => u.phone === phone && u.dob === dob) ?? null;

const findCustomerByPhone = async (phone) => {
  const { data, error } = await adminSupabase
    .from("customers")
    .select("uid, phone_number, dob, username, email, address, IsVolunteer")
    .eq("phone_number", phone)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

const findAuthUserByEmail = async (email) => {
  let page = 1;
  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email === email);
    if (match) return match;
    if (data.users.length < 200) return null;
    page++;
  }
};

const resolveAuthUserId = async (existingUid, email) => {
  if (existingUid) {
    const { data, error } = await adminSupabase.auth.admin.getUserById(existingUid);
    if (!error && data.user) return data.user.id;
  }
  const authUser = await findAuthUserByEmail(email);
  return authUser?.id ?? null;
};

const ensureRequesterAuthSession = async ({ phone, pantryUser, existingCustomer }) => {
  const email = buildRequesterEmail(phone);
  const username = buildRequesterUsername(phone);
  const password = buildRandomPassword();
  const userMetadata = {
    role: "requester",
    first_name: pantryUser.firstName,
    last_name: pantryUser.lastName,
    phone_number: phone,
    username,
  };

  const existingAuthUserId = await resolveAuthUserId(existingCustomer?.uid, email);
  let authUserId = existingAuthUserId;

  if (authUserId) {
    const { data, error } = await adminSupabase.auth.admin.updateUserById(
      authUserId,
      { email, password, email_confirm: true, user_metadata: userMetadata }
    );
    if (error || !data.user) throw new Error(error?.message || "Failed to update auth user.");
    authUserId = data.user.id;
  } else {
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error || !data.user) throw new Error(error?.message || "Failed to create auth user.");
    authUserId = data.user.id;
  }

  const { data: signInData, error: signInError } =
    await authSupabase.auth.signInWithPassword({ email, password });
  if (signInError || !signInData.session)
    throw new Error(signInError?.message || "Failed to create session.");

  return { authUserId, session: signInData.session };
};

const syncCustomerProfile = async ({
  authUserId, existingCustomer, phone, dob, pantryUser,
}) => {
  const payload = {
    uid: authUserId,
    first_name: pantryUser.firstName,
    last_name: pantryUser.lastName,
    phone_number: phone,
    dob,
    address: formatAddress(pantryUser.address),
    username: buildRequesterUsername(phone),
    email: buildRequesterEmail(phone),
    IsVolunteer: false,
  };
  if (existingCustomer) {
    const { error } = await adminSupabase
      .from("customers")
      .update(payload)
      .eq("phone_number", phone);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await adminSupabase.from("customers").insert(payload);
    if (error) throw new Error(error.message);
  }
};

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

const TEXTBELT_KEY = process.env.TEXTBELT_KEY || "textbelt";

const sendSms = async ({ to, message }) => {
  if (!to || !message) {
    throw new Error("Both 'to' and 'message' are required.");
  }

  const normalised = normalizePhone(to);
  if (normalised.length < 10) {
    throw new Error("Phone number must be at least 10 digits.");
  }

  const phone = normalised.length === 10 ? `+1${normalised}` : `+${normalised}`;

  const tbRes = await fetch("https://textbelt.com/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, message, key: TEXTBELT_KEY }),
  });
  const tbData = await tbRes.json();

  if (!tbData.success) {
    throw new Error(tbData.error || "Unable to send verification code.");
  }

  console.log(
    `[sms] SMS sent to ${phone}, quota remaining: ${tbData.quotaRemaining}`
  );

  return { to: phone, quotaRemaining: tbData.quotaRemaining };
};

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    authConfigured: hasSupabaseServerConfig,
    smsConfigured: Boolean(TEXTBELT_KEY),
  });
});

// Send an SMS notification
// Body: { to: "15550001234", message: "Your order was accepted!" }
app.post("/api/notify/sms", async (req, res) => {
  const { to, message } = req.body ?? {};

  try {
    const result = await sendSms({ to, message });
    return res.json({ status: "sent", to: result.to });
  } catch (err) {
    const messageText = err.message || "Unable to send SMS.";
    const status = messageText.includes("required") || messageText.includes("digits")
      ? 400
      : 500;
    return res.status(status).json({
      status: "error",
      message: messageText,
    });
  }
});

app.post("/api/food-signup/start", async (req, res) => {
  const phoneInput = req.body?.phone;
  const dobInput = req.body?.dob;

  if (typeof phoneInput !== "string" || !phoneInput.trim())
    return res.status(400).json({ status: "invalid_request", message: "Phone is required." });
  if (typeof dobInput !== "string" || !dobInput.trim())
    return res.status(400).json({ status: "invalid_request", message: "Date of birth is required." });

  const normalizedPhone = normalizePhone(phoneInput);
  const normalizedDob = normalizeDob(dobInput);

  if (normalizedPhone.length !== 10)
    return res.status(400).json({ status: "invalid_phone", message: "Phone must be 10 digits." });
  if (!normalizedDob)
    return res.status(400).json({ status: "invalid_dob", message: "Use MM/DD/YYYY." });

  const pantryUser = findPantryUser(normalizedPhone, normalizedDob);
  if (!pantryUser)
    return res.status(404).json({
      status: "not_found",
      message: "We could not match that phone number and date of birth to a pantry record.",
    });

  const demoRequester = isDemoRequester(normalizedPhone, normalizedDob);
  const code = demoRequester ? DEMO_REQUESTER.code : buildVerificationCode();
  const key = buildVerificationKey(normalizedPhone, normalizedDob);
  pendingVerifications.set(key, {
    code,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attemptsRemaining: MAX_VERIFY_ATTEMPTS,
  });

  if (demoRequester) {
    return res.json({
      status: "demo_verification_ready",
      message:
        "Demo sign-in is ready. SMS was skipped and the default code 123456 will be used automatically.",
      normalizedPhone,
      demoCode: DEMO_REQUESTER.code,
    });
  }

  try {
    await sendSms({
      to: normalizedPhone,
      message: `Your Food Pantry Network verification code is ${code}. It expires in 10 minutes.`,
    });
  } catch (error) {
    pendingVerifications.delete(key);
    console.error("[sms] Failed to send signup verification code:", error.message);
    return res.status(500).json({
      status: "sms_error",
      message:
        error.message ||
        "Unable to send the verification code by SMS right now.",
    });
  }

  return res.json({
    status: "verification_required",
    message: `Verification code sent to ${maskPhone(normalizedPhone)}.`,
    normalizedPhone,
  });
});

app.post("/api/food-signup/verify", async (req, res) => {
  const phoneInput = req.body?.phone;
  const dobInput = req.body?.dob;
  const codeInput = req.body?.code;

  if (typeof phoneInput !== "string" || !phoneInput.trim())
    return res.status(400).json({ status: "invalid_request", message: "Phone is required." });
  if (typeof dobInput !== "string" || !dobInput.trim())
    return res.status(400).json({ status: "invalid_request", message: "Date of birth is required." });
  if (typeof codeInput !== "string" || !codeInput.trim())
    return res.status(400).json({ status: "invalid_request", message: "Verification code is required." });

  const normalizedPhone = normalizePhone(phoneInput);
  const normalizedDob = normalizeDob(dobInput);
  const trimmedCode = codeInput.trim();

  if (normalizedPhone.length !== 10)
    return res.status(400).json({ status: "invalid_phone", message: "Phone must be 10 digits." });
  if (!normalizedDob)
    return res.status(400).json({ status: "invalid_dob", message: "Use MM/DD/YYYY." });
  if (!/^\d{6}$/.test(trimmedCode))
    return res.status(401).json({ status: "invalid_code", message: "Code must be 6 digits." });

  const pantryUser = findPantryUser(normalizedPhone, normalizedDob);
  if (!pantryUser)
    return res.status(404).json({ status: "not_found", message: "No matching pantry record." });

  const key = buildVerificationKey(normalizedPhone, normalizedDob);
  const verification = pendingVerifications.get(key);
  const demoRequester = isDemoRequester(normalizedPhone, normalizedDob);

  if (!verification && !(demoRequester && trimmedCode === DEMO_REQUESTER.code))
    return res.status(400).json({ status: "start_required", message: "Call /api/food-signup/start first." });
  if (verification && verification.expiresAt < Date.now()) {
    pendingVerifications.delete(key);
    return res.status(401).json({ status: "expired_code", message: "Code expired. Request a new one." });
  }
  if (verification && trimmedCode !== verification.code) {
    verification.attemptsRemaining -= 1;
    if (verification.attemptsRemaining <= 0) {
      pendingVerifications.delete(key);
      return res.status(429).json({ status: "too_many_attempts", message: "Too many attempts. Request a new code." });
    }
    pendingVerifications.set(key, verification);
    return res.status(401).json({ status: "invalid_code", message: "Invalid code." });
  }

  if (verification) {
    pendingVerifications.delete(key);
  }

  if (!hasSupabaseServerConfig)
    return res.status(500).json({
      status: "auth_error",
      message: "Server missing Supabase credentials.",
    });

  try {
    const existingCustomer = await findCustomerByPhone(normalizedPhone);
    if (existingCustomer && existingCustomer.dob !== normalizedDob)
      return res.status(409).json({ status: "data_conflict", message: "Record mismatch. Contact support." });

    const { authUserId, session } = await ensureRequesterAuthSession({
      phone: normalizedPhone,
      pantryUser,
      existingCustomer,
    });

    await syncCustomerProfile({
      authUserId, existingCustomer, phone: normalizedPhone,
      dob: normalizedDob, pantryUser,
    });

    return res.json({
      status: "verified",
      normalizedPhone,
      firstName: pantryUser.firstName,
      lastName: pantryUser.lastName,
      address: pantryUser.address,
      deliveryRestriction: "You can only request delivery to this registered address.",
      session: buildSessionPayload(session),
    });
  } catch (error) {
    return res.status(500).json({ status: "auth_error", message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Demo API listening on http://localhost:${PORT}`);
});

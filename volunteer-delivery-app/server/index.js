const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 4000;
const DEMO_CODE = "123456";
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

const DATA_PATH = path.join(__dirname, "data", "pantry-users.json");
const ENV_PATH = path.join(__dirname, "..", ".env");
const pendingVerifications = new Map();

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

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

const loadPantryUsers = () => {
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const users = JSON.parse(raw);

  if (!Array.isArray(users)) {
    throw new Error("pantry-users.json must contain an array.");
  }

  return users.map((user, index) => {
    const normalizedPhone = normalizePhone(user.phone);
    const normalizedDob = normalizeDob(user.dob);

    if (normalizedPhone.length !== 10) {
      throw new Error(`pantry-users.json row ${index + 1} has an invalid phone.`);
    }

    if (!normalizedDob) {
      throw new Error(`pantry-users.json row ${index + 1} has an invalid dob.`);
    }

    return {
      ...user,
      phone: normalizedPhone,
      dob: normalizedDob,
    };
  });
};

loadEnvFile(ENV_PATH);

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
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

const authSupabase = hasSupabaseServerConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

const pantryUsers = loadPantryUsers();

const findPantryUser = (phone, dob) =>
  pantryUsers.find((user) => user.phone === phone && user.dob === dob) ?? null;

const findCustomerByPhone = async (phone) => {
  const { data, error } = await adminSupabase
    .from("customers")
    .select("uid, phone_number, dob, username, email, address, IsVolunteer")
    .eq("phone_number", phone)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const findAuthUserByEmail = async (email) => {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message);
    }

    const matchedUser = data.users.find((user) => user.email === email);
    if (matchedUser) {
      return matchedUser;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
};

const resolveAuthUserId = async (existingUid, email) => {
  if (existingUid) {
    const { data, error } = await adminSupabase.auth.admin.getUserById(existingUid);

    if (!error && data.user) {
      return data.user.id;
    }
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
      {
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      }
    );

    if (error || !data.user) {
      throw new Error(error?.message || "Failed to update auth user.");
    }

    authUserId = data.user.id;
  } else {
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (error || !data.user) {
      throw new Error(error?.message || "Failed to create auth user.");
    }

    authUserId = data.user.id;
  }

  const { data: signInData, error: signInError } =
    await authSupabase.auth.signInWithPassword({
      email,
      password,
    });

  if (signInError || !signInData.session || !signInData.user) {
    throw new Error(signInError?.message || "Failed to create user session.");
  }

  return {
    authUserId,
    session: signInData.session,
  };
};

const syncCustomerProfile = async ({
  authUserId,
  existingCustomer,
  phone,
  dob,
  pantryUser,
}) => {
  const customerPayload = {
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
      .update(customerPayload)
      .eq("phone_number", phone);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await adminSupabase.from("customers").insert(customerPayload);

  if (error) {
    throw new Error(error.message);
  }
};

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    authConfigured: hasSupabaseServerConfig,
  });
});

app.post("/api/food-signup/start", (req, res) => {
  const phoneInput = req.body?.phone;
  const dobInput = req.body?.dob;

  if (typeof phoneInput !== "string" || phoneInput.trim() === "") {
    return res.status(400).json({
      status: "invalid_request",
      message: "Phone is required.",
    });
  }

  if (typeof dobInput !== "string" || dobInput.trim() === "") {
    return res.status(400).json({
      status: "invalid_request",
      message: "Date of birth is required.",
    });
  }

  const normalizedPhone = normalizePhone(phoneInput);
  const normalizedDob = normalizeDob(dobInput);

  if (normalizedPhone.length !== 10) {
    return res.status(400).json({
      status: "invalid_phone",
      message: "Phone must contain exactly 10 digits.",
    });
  }

  if (!normalizedDob) {
    return res.status(400).json({
      status: "invalid_dob",
      message: "Date of birth must use MM/DD/YYYY.",
    });
  }

  const pantryUser = findPantryUser(normalizedPhone, normalizedDob);

  if (!pantryUser) {
    return res.status(404).json({
      status: "not_found",
      message:
        "We could not match that phone number and date of birth to a pantry record.",
    });
  }

  const verificationKey = buildVerificationKey(normalizedPhone, normalizedDob);
  pendingVerifications.set(verificationKey, {
    code: DEMO_CODE,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attemptsRemaining: MAX_VERIFY_ATTEMPTS,
  });

  return res.status(200).json({
    status: "verification_required",
    message: "Verification code sent.",
    normalizedPhone,
  });
});

app.post("/api/food-signup/verify", async (req, res) => {
  const phoneInput = req.body?.phone;
  const dobInput = req.body?.dob;
  const codeInput = req.body?.code;

  if (typeof phoneInput !== "string" || phoneInput.trim() === "") {
    return res.status(400).json({
      status: "invalid_request",
      message: "Phone is required.",
    });
  }

  if (typeof dobInput !== "string" || dobInput.trim() === "") {
    return res.status(400).json({
      status: "invalid_request",
      message: "Date of birth is required.",
    });
  }

  if (typeof codeInput !== "string" || codeInput.trim() === "") {
    return res.status(400).json({
      status: "invalid_request",
      message: "Verification code is required.",
    });
  }

  const normalizedPhone = normalizePhone(phoneInput);
  const normalizedDob = normalizeDob(dobInput);
  const trimmedCode = codeInput.trim();

  if (normalizedPhone.length !== 10) {
    return res.status(400).json({
      status: "invalid_phone",
      message: "Phone must contain exactly 10 digits.",
    });
  }

  if (!normalizedDob) {
    return res.status(400).json({
      status: "invalid_dob",
      message: "Date of birth must use MM/DD/YYYY.",
    });
  }

  if (!/^\d{6}$/.test(trimmedCode)) {
    return res.status(401).json({
      status: "invalid_code",
      message: "Verification code must be 6 digits.",
    });
  }

  const pantryUser = findPantryUser(normalizedPhone, normalizedDob);

  if (!pantryUser) {
    return res.status(404).json({
      status: "not_found",
      message:
        "We could not match that phone number and date of birth to a pantry record.",
    });
  }

  const verificationKey = buildVerificationKey(normalizedPhone, normalizedDob);
  const verification = pendingVerifications.get(verificationKey);

  if (!verification) {
    return res.status(400).json({
      status: "start_required",
      message: "Call /api/food-signup/start before verifying this record.",
    });
  }

  if (verification.expiresAt < Date.now()) {
    pendingVerifications.delete(verificationKey);

    return res.status(401).json({
      status: "expired_code",
      message: "Verification code expired. Please request a new code.",
    });
  }

  if (trimmedCode !== verification.code) {
    verification.attemptsRemaining -= 1;

    if (verification.attemptsRemaining <= 0) {
      pendingVerifications.delete(verificationKey);

      return res.status(429).json({
        status: "too_many_attempts",
        message: "Too many incorrect codes. Please request a new code.",
      });
    }

    pendingVerifications.set(verificationKey, verification);

    return res.status(401).json({
      status: "invalid_code",
      message: "Invalid verification code.",
    });
  }

  pendingVerifications.delete(verificationKey);

  if (!hasSupabaseServerConfig) {
    return res.status(500).json({
      status: "auth_error",
      message:
        "Demo server is missing Supabase server credentials. Add SUPABASE_SERVICE_ROLE_KEY to continue.",
    });
  }

  try {
    const existingCustomer = await findCustomerByPhone(normalizedPhone);

    if (existingCustomer && existingCustomer.dob !== normalizedDob) {
      return res.status(409).json({
        status: "data_conflict",
        message: "Your pantry record could not be matched. Please contact support.",
      });
    }

    const { authUserId, session } = await ensureRequesterAuthSession({
      phone: normalizedPhone,
      pantryUser,
      existingCustomer,
    });

    await syncCustomerProfile({
      authUserId,
      existingCustomer,
      phone: normalizedPhone,
      dob: normalizedDob,
      pantryUser,
    });

    return res.status(200).json({
      status: "verified",
      normalizedPhone,
      firstName: pantryUser.firstName,
      lastName: pantryUser.lastName,
      address: pantryUser.address,
      deliveryRestriction:
        "You can only request delivery to this registered address.",
      session: buildSessionPayload(session),
    });
  } catch (error) {
    return res.status(500).json({
      status: "auth_error",
      message: error.message || "Unable to finish demo sign-in.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Demo API listening on http://localhost:${PORT}`);
});

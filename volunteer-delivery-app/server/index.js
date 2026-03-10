const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 4000;
const DEMO_CODE = "123456";
const pendingVerifications = new Set();

const DATA_PATH = path.join(__dirname, "data", "pantry-users.json");

const normalizePhone = (value = "") => String(value).replace(/\D/g, "");

const loadPantryUsers = () => {
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const users = JSON.parse(raw);

  if (!Array.isArray(users)) {
    throw new Error("pantry-users.json must contain an array.");
  }

  return users;
};

const pantryUsers = loadPantryUsers();
const userByPhone = new Map(
  pantryUsers.map((user) => [normalizePhone(user.phone), user])
);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

app.post("/api/food-signup/start", (req, res) => {
  const phoneInput = req.body?.phone;

  if (typeof phoneInput !== "string" || phoneInput.trim() === "") {
    return res.status(400).json({
      status: "invalid_request",
      message: "Phone is required.",
    });
  }

  const normalizedPhone = normalizePhone(phoneInput);

  if (normalizedPhone.length !== 10) {
    return res.status(400).json({
      status: "invalid_phone",
      message: "Phone must contain exactly 10 digits.",
    });
  }

  const user = userByPhone.get(normalizedPhone);

  if (!user) {
    return res.status(404).json({
      status: "not_found",
      message:
        "This phone number is not in the pantry database. Please complete pantry onboarding first.",
    });
  }

  pendingVerifications.add(normalizedPhone);

  return res.status(200).json({
    status: "verification_required",
    message: "Verification code sent. For demo, use 123456.",
    normalizedPhone,
  });
});

app.post("/api/food-signup/verify", (req, res) => {
  const phoneInput = req.body?.phone;
  const codeInput = req.body?.code;

  if (typeof phoneInput !== "string" || phoneInput.trim() === "") {
    return res.status(400).json({
      status: "invalid_request",
      message: "Phone is required.",
    });
  }

  if (typeof codeInput !== "string" || codeInput.trim() === "") {
    return res.status(400).json({
      status: "invalid_request",
      message: "Verification code is required.",
    });
  }

  const normalizedPhone = normalizePhone(phoneInput);

  if (normalizedPhone.length !== 10) {
    return res.status(400).json({
      status: "invalid_phone",
      message: "Phone must contain exactly 10 digits.",
    });
  }

  const user = userByPhone.get(normalizedPhone);

  if (!user) {
    return res.status(404).json({
      status: "not_found",
      message:
        "This phone number is not in the pantry database. Please complete pantry onboarding first.",
    });
  }

  if (!pendingVerifications.has(normalizedPhone)) {
    return res.status(400).json({
      status: "start_required",
      message: "Call /api/food-signup/start before verifying this phone.",
    });
  }

  if (codeInput !== DEMO_CODE) {
    return res.status(401).json({
      status: "invalid_code",
      message: "Invalid verification code.",
    });
  }

  pendingVerifications.delete(normalizedPhone);

  return res.status(200).json({
    status: "verified",
    address: user.address,
    deliveryRestriction:
      "You can only request delivery to this registered address.",
  });
});

app.listen(PORT, () => {
  console.log(`Demo API listening on http://localhost:${PORT}`);
});

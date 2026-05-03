import { chromium } from "playwright";
import path from "path";

const BASE = "http://127.0.0.1:19006";
const OUT  = "/sessions/eloquent-relaxed-gauss/mnt/outputs/screenshots";
import fs from "fs";
fs.mkdirSync(OUT, { recursive: true });

// Mobile viewport — app is built mobile-first
const VIEWPORT = { width: 390, height: 844 };

const browser = await chromium.launch({ executablePath: "/sessions/eloquent-relaxed-gauss/.cache/ms-playwright/chromium-1217/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function shot(name, setup) {
  await setup(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: false });
  console.log("✓", name);
}

// ── 1. Landing / Mode Select ──────────────────────────────────────────────
await shot("01_mode_select", async (p) => {
  await p.goto(BASE + "/mode-select");
  await p.waitForLoadState("networkidle");
});

// ── 2. Requester login (phone entry) ──────────────────────────────────────
await shot("02_requester_login", async (p) => {
  await p.goto(BASE + "/requester");
  await p.waitForLoadState("networkidle");
  // dismiss disclaimer if present
  const accept = p.getByTestId("requester-disclaimer-accept");
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await p.waitForTimeout(400);
});

// ── 3. Requester — fill in phone & DOB to show form in-use ────────────────
await shot("03_requester_login_filled", async (p) => {
  await p.goto(BASE + "/requester");
  await p.waitForLoadState("networkidle");
  const accept = p.getByTestId("requester-disclaimer-accept");
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await p.waitForTimeout(300);
  await p.getByTestId("requester-phone").fill("1234567890");
  await p.getByTestId("requester-dob").fill("01/01/2001");
  await p.waitForTimeout(300);
});

// ── 4. Order food (item selection) ────────────────────────────────────────
await shot("04_order_food", async (p) => {
  // sign in as demo requester first
  await p.goto(BASE + "/requester");
  await p.waitForLoadState("networkidle");
  const accept = p.getByTestId("requester-disclaimer-accept");
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await p.getByTestId("requester-phone").fill("1234567890");
  await p.getByTestId("requester-dob").fill("01/01/2001");
  await p.getByTestId("requester-send-code").click();
  await p.waitForURL(/\/order-food$/, { timeout: 15000 });
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(800);
});

// ── 5. Order status (ETA tracking) ────────────────────────────────────────
await shot("05_order_status", async (p) => {
  await p.goto(BASE + "/order-status");
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(600);
});

// ── 6. Volunteer sign-in ──────────────────────────────────────────────────
await shot("06_volunteer_signin", async (p) => {
  await p.goto(BASE + "/volunteer-signin");
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(400);
});

// ── 7. Volunteer dashboard (orders list) ─────────────────────────────────
await shot("07_volunteer_dashboard", async (p) => {
  // sign in as test volunteer
  await p.goto(BASE + "/volunteer-signin");
  await p.waitForLoadState("networkidle");
  const emailField = p.getByPlaceholder(/email/i).first();
  const passField  = p.getByPlaceholder(/password/i).first();
  if (await emailField.isVisible().catch(() => false)) {
    await emailField.fill("test@example.com");
    await passField.fill("testexample");
    await p.getByRole("button", { name: /sign in/i }).first().click();
    await p.waitForTimeout(4000);
  }
  await p.goto(BASE + "/volunteer-dashboard");
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(1000);
});

// ── 8. Admin dashboard ────────────────────────────────────────────────────
await shot("08_admin_dashboard", async (p) => {
  await p.goto(BASE + "/admin-dashboard");
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(600);
  // log in if auth wall is visible
  const userField = p.getByPlaceholder(/username/i);
  if (await userField.isVisible().catch(() => false)) {
    await userField.fill("admin");
    await p.getByPlaceholder(/password/i).fill("password");
    await p.getByRole("button", { name: /log in/i }).click();
    await p.waitForTimeout(1500);
  }
});

// ── 9. Admin dashboard — complaints tab ───────────────────────────────────
await shot("09_admin_complaints", async (p) => {
  // already logged in from previous
  await p.goto(BASE + "/admin-dashboard");
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(600);
  const userField = p.getByPlaceholder(/username/i);
  if (await userField.isVisible().catch(() => false)) {
    await userField.fill("admin");
    await p.getByPlaceholder(/password/i).fill("password");
    await p.getByRole("button", { name: /log in/i }).click();
    await p.waitForTimeout(1500);
  }
  // click complaints tab
  const tab = p.getByText(/complaint/i).first();
  if (await tab.isVisible().catch(() => false)) await tab.click();
  await p.waitForTimeout(800);
});

await browser.close();
console.log("\nAll screenshots saved to", OUT);

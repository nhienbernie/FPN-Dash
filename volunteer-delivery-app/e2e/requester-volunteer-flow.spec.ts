import { expect, test, type Page } from "@playwright/test";
import { resetTestState, waitForLatestRequesterOrder } from "./helpers/backend";

const REQUESTER = {
  phone: "1234567890",
  dob: "01/01/2001",
};

const VOLUNTEER = {
  email: "test@example.com",
  password: "testexample",
};

async function dismissRequesterDisclaimer(page: Page) {
  const button = page.getByTestId("requester-disclaimer-accept");
  if (await button.isVisible()) {
    await button.click();
  }
}

async function signInRequester(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/requester`);
  await dismissRequesterDisclaimer(page);
  await page.getByTestId("requester-phone").fill(REQUESTER.phone);
  await page.getByTestId("requester-dob").fill(REQUESTER.dob);
  await page.getByTestId("requester-send-code").click();
  await expect(page).toHaveURL(/\/order-food$/);
}

async function signInVolunteer(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/mode-select`);
  await page.getByTestId("mode-select-volunteer").click();
  await page.getByTestId("volunteer-options-signin").click();
  await page.getByTestId("volunteer-signin-identifier").fill(VOLUNTEER.email);
  await page.getByTestId("volunteer-signin-password").fill(VOLUNTEER.password);
  await page.getByTestId("volunteer-signin-submit").click();
  await expect(page).toHaveURL(/\/volunteer-dashboard$/);
}

test.describe("requester and volunteer e2e flows", () => {
  test.beforeEach(async () => {
    await resetTestState({
      requesterPhone: REQUESTER.phone,
      volunteerEmail: VOLUNTEER.email,
    });
  });

  test.afterEach(async () => {
    await resetTestState({
      requesterPhone: REQUESTER.phone,
      volunteerEmail: VOLUNTEER.email,
    });
  });

  test("validates requester phone and DOB before requesting access", async ({ page }) => {
    await page.goto("/requester");
    await dismissRequesterDisclaimer(page);

    await page.getByTestId("requester-phone").fill("123");
    await page.getByTestId("requester-dob").fill("0101");
    await page.getByTestId("requester-send-code").click();

    await expect(page.getByText("Phone number must be 10 digits.")).toBeVisible();
    await expect(page.getByText("Enter a valid date (MM/DD/YYYY).")).toBeVisible();
  });

  test("requester can place an order that a volunteer accepts and completes", async ({
    browser,
    baseURL,
  }) => {
    const requesterContext = await browser.newContext();
    const volunteerContext = await browser.newContext({
      geolocation: { latitude: 39.9612, longitude: -82.9988 },
      permissions: ["geolocation"],
    });

    const requesterPage = await requesterContext.newPage();
    const volunteerPage = await volunteerContext.newPage();
    const orderNote = `E2E order ${Date.now()}`;
    requesterPage.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    try {
      await signInRequester(requesterPage, baseURL!);
      await requesterPage.getByTestId("order-food-start-order").click();
      await expect(requesterPage).toHaveURL(/\/order-boxes$/);

      await requesterPage.getByTestId("order-boxes-continue").click();
      await expect(requesterPage).toHaveURL(/\/order-items/);

      const firstItem = requesterPage.locator('[data-testid^="order-items-box-1-item-"]').first();
      await expect(firstItem).toBeVisible();
      await firstItem.click();
      await requesterPage.getByTestId("order-items-continue").click();

      await expect(requesterPage).toHaveURL(/\/order-review/);
      await requesterPage.getByTestId("order-review-notes").fill(orderNote);
      await requesterPage.getByTestId("order-review-confirm").click();

      await expect(requesterPage).toHaveURL(/\/order-status$/);
      await expect(requesterPage.getByTestId("order-status-current-status")).toContainText(
        "Pending",
      );

      const createdOrder = await waitForLatestRequesterOrder(REQUESTER.phone);

      await signInVolunteer(volunteerPage, baseURL!);

      const acceptButton = volunteerPage.getByTestId(
        `volunteer-dashboard-open-accept-${createdOrder.order_id}`,
      );
      await expect(acceptButton).toBeVisible();
      await acceptButton.click();

      await expect(volunteerPage.getByText(orderNote)).toBeVisible();
      await volunteerPage.getByTestId("volunteer-dashboard-confirm-accept").click();
      await expect(
        volunteerPage.getByTestId("volunteer-dashboard-active-status"),
      ).toContainText("Accepted");

      await requesterPage.getByTestId("order-status-refresh").click();
      await expect(requesterPage.getByTestId("order-status-current-status")).toContainText(
        "Accepted",
      );

      await volunteerPage.getByTestId("volunteer-dashboard-start-delivery").click();
      await expect(
        volunteerPage.getByTestId("volunteer-dashboard-active-status"),
      ).toContainText("In Transit");

      await requesterPage.getByTestId("order-status-refresh").click();
      await expect(requesterPage.getByTestId("order-status-current-status")).toContainText(
        "In Transit",
      );

      await volunteerPage.getByTestId("volunteer-dashboard-mark-delivered").click();

      await requesterPage.getByTestId("order-status-refresh").click();
      await expect(requesterPage.getByTestId("order-status-current-status")).toContainText(
        "Delivered",
      );
    } finally {
      await requesterContext.close();
      await volunteerContext.close();
    }
  });
});

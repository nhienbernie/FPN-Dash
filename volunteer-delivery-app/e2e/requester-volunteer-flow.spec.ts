import { expect, test, type Page } from "@playwright/test";
import {
  createPendingOrderForRequester,
  resetTestState,
  type RequesterSeed,
  waitForLatestRequesterOrder,
} from "./helpers/backend";

const REQUESTER: RequesterSeed = {
  phone: "1234567890",
  dob: "01/01/2001",
  firstName: "Testy",
  lastName: "McTestFace",
  address: {
    line1: "1035 Brice St",
    city: "Newark",
    state: "OH",
    zip: "43055",
  },
};

const SECOND_REQUESTER: RequesterSeed = {
  phone: "5550000001",
  dob: "01/15/1970",
  firstName: "Demo",
  lastName: "UserOne",
  address: {
    line1: "4974 Cadogan Pl",
    city: "New Albany",
    state: "OH",
    zip: "43054",
  },
};

const VOLUNTEER = {
  email: "test@example.com",
  password: "testexample",
};

function attachAutoAcceptDialogs(page: Page) {
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
}

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

async function startOrder(page: Page, boxCount = 1) {
  await page.getByTestId("order-food-start-order").click();
  await expect(page).toHaveURL(/\/order-boxes$/);

  for (let index = 1; index < boxCount; index += 1) {
    await page.getByTestId("order-boxes-increment").click();
  }

  await page.getByTestId("order-boxes-continue").click();
  await expect(page).toHaveURL(/\/order-items/);
}

async function selectItemForBox(page: Page, boxNumber: number, preferredIndex = 0) {
  const rows = page.locator(`[data-testid^="order-items-box-${boxNumber}-item-"]`);
  const count = await rows.count();
  const itemIndex = Math.min(preferredIndex, Math.max(count - 1, 0));
  const row = rows.nth(itemIndex);

  await expect(row).toBeVisible();
  const label = (await row.textContent())?.replace("✓", "").trim() || `box-${boxNumber}-item`;
  await row.click();
  await page.getByTestId("order-items-continue").last().click();
  return label;
}

async function submitOrderFromReview(page: Page, note: string) {
  await expect(page).toHaveURL(/\/order-review/);
  await page.getByTestId("order-review-notes").fill(note);
  await page.getByTestId("order-review-confirm").click();
  await expect(page).toHaveURL(/\/order-status$/);
}

async function placeSingleBoxOrder(page: Page, note: string, itemIndex = 0) {
  await startOrder(page, 1);
  const itemLabel = await selectItemForBox(page, 1, itemIndex);
  await submitOrderFromReview(page, note);
  return { itemLabel, note };
}

async function acceptLatestRequesterOrder(volunteerPage: Page, orderId: number, note: string) {
  const acceptButton = volunteerPage.getByTestId(
    `volunteer-dashboard-open-accept-${orderId}`,
  );
  await expect(acceptButton).toBeVisible();
  await acceptButton.click();
  await expect(volunteerPage.getByText(note)).toBeVisible();
  await volunteerPage.getByTestId("volunteer-dashboard-confirm-accept").click();
  await expect(
    volunteerPage.getByTestId("volunteer-dashboard-active-status"),
  ).toContainText("Accepted");
}

test.describe("requester and volunteer e2e flows", () => {
  test.beforeEach(async () => {
    await resetTestState({
      requesterPhones: [REQUESTER.phone, SECOND_REQUESTER.phone],
      volunteerEmail: VOLUNTEER.email,
    });
  });

  test.afterEach(async () => {
    await resetTestState({
      requesterPhones: [REQUESTER.phone, SECOND_REQUESTER.phone],
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

  test("requester can place a multi-box order", async ({ browser, baseURL }) => {
    const requesterContext = await browser.newContext();
    const requesterPage = await requesterContext.newPage();
    const orderNote = `Multi-box order ${Date.now()}`;

    attachAutoAcceptDialogs(requesterPage);

    try {
      await signInRequester(requesterPage, baseURL!);
      await startOrder(requesterPage, 2);

      const firstBoxLabel = await selectItemForBox(requesterPage, 1, 0);
      const secondBoxLabel = await selectItemForBox(requesterPage, 2, 1);

      await expect(requesterPage.getByText("Box 1", { exact: true }).last()).toBeVisible();
      await expect(requesterPage.getByText("Box 2", { exact: true }).last()).toBeVisible();
      await expect(requesterPage.getByText(firstBoxLabel).last()).toBeVisible();
      await expect(requesterPage.getByText(secondBoxLabel).last()).toBeVisible();

      await submitOrderFromReview(requesterPage, orderNote);

      await expect(requesterPage.getByTestId("order-status-current-status")).toContainText(
        "Pending",
      );
      await expect(requesterPage.getByText("Box 1", { exact: true }).last()).toBeVisible();
      await expect(requesterPage.getByText("Box 2", { exact: true }).last()).toBeVisible();
      await expect(requesterPage.getByText(firstBoxLabel).last()).toBeVisible();
      await expect(requesterPage.getByText(secondBoxLabel).last()).toBeVisible();
    } finally {
      await requesterContext.close();
    }
  });

  test("requester with an active pending order is redirected back to status and can cancel it", async ({
    browser,
    baseURL,
  }) => {
    const requesterContext = await browser.newContext();
    const requesterPage = await requesterContext.newPage();
    const orderNote = `Pending cancel order ${Date.now()}`;

    attachAutoAcceptDialogs(requesterPage);

    try {
      await signInRequester(requesterPage, baseURL!);
      await placeSingleBoxOrder(requesterPage, orderNote);

      await expect(requesterPage.getByTestId("order-status-current-status")).toContainText(
        "Pending",
      );

      await requesterPage.goto(`${baseURL}/order-food`);
      await expect(requesterPage).toHaveURL(/\/order-status$/);

      await requesterPage.getByTestId("order-status-cancel").click();
      await expect(requesterPage).toHaveURL(/\/order-food$/);
      await expect(requesterPage.getByTestId("order-food-start-order")).toBeVisible();
    } finally {
      await requesterContext.close();
    }
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

    attachAutoAcceptDialogs(requesterPage);

    try {
      await signInRequester(requesterPage, baseURL!);
      await placeSingleBoxOrder(requesterPage, orderNote);
      const createdOrder = await waitForLatestRequesterOrder(REQUESTER.phone);

      await signInVolunteer(volunteerPage, baseURL!);
      await acceptLatestRequesterOrder(volunteerPage, createdOrder.order_id, orderNote);

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

  test("volunteer can cancel an accepted delivery from the confirm delivery screen", async ({
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
    const orderNote = `Cancel accepted order ${Date.now()}`;

    attachAutoAcceptDialogs(requesterPage);

    try {
      await signInRequester(requesterPage, baseURL!);
      await placeSingleBoxOrder(requesterPage, orderNote);
      const createdOrder = await waitForLatestRequesterOrder(REQUESTER.phone);

      await signInVolunteer(volunteerPage, baseURL!);
      await acceptLatestRequesterOrder(volunteerPage, createdOrder.order_id, orderNote);

      await volunteerPage.getByTestId("volunteer-dashboard-view-delivery-details").click();
      await expect(volunteerPage).toHaveURL(/\/confirm-delivery/);

      await volunteerPage.getByTestId("confirm-delivery-open-cancel").click();
      await volunteerPage.getByTestId("confirm-delivery-cancel-yes").click();

      await expect(volunteerPage).toHaveURL(/\/volunteer-dashboard$/);
      await expect(
        volunteerPage.getByText("You do not have an active delivery right now.").last(),
      ).toBeVisible();
      await expect(
        volunteerPage.getByTestId(`volunteer-dashboard-open-accept-${createdOrder.order_id}`).last(),
      ).toBeVisible();

      await requesterPage.getByTestId("order-status-refresh").click();
      await expect(requesterPage.getByTestId("order-status-current-status")).toContainText(
        "Pending",
      );
    } finally {
      await requesterContext.close();
      await volunteerContext.close();
    }
  });

  test("volunteer with an active delivery cannot accept another pending order", async ({
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
    const activeOrderNote = `Primary active order ${Date.now()}`;
    const secondOrderNote = `Second pending order ${Date.now()}`;

    attachAutoAcceptDialogs(requesterPage);

    try {
      await signInRequester(requesterPage, baseURL!);
      await placeSingleBoxOrder(requesterPage, activeOrderNote);
      const activeOrder = await waitForLatestRequesterOrder(REQUESTER.phone);

      await signInVolunteer(volunteerPage, baseURL!);
      await acceptLatestRequesterOrder(volunteerPage, activeOrder.order_id, activeOrderNote);

      const secondOrder = await createPendingOrderForRequester(SECOND_REQUESTER, {
        selectedItems: ["Shelf-stable pasta"],
        userNotes: secondOrderNote,
        boxCount: 1,
      });

      await volunteerPage.reload();
      const secondAcceptButton = volunteerPage.getByTestId(
        `volunteer-dashboard-open-accept-${secondOrder.order_id}`,
      );

      await expect(secondAcceptButton).toBeVisible();
      await expect(secondAcceptButton).toContainText("Finish active delivery first");
      await expect(
        volunteerPage.getByTestId("volunteer-dashboard-active-status"),
      ).toContainText("Accepted");
    } finally {
      await requesterContext.close();
      await volunteerContext.close();
    }
  });
});

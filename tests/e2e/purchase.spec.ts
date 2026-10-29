import { expect, test } from "@playwright/test";
test("a signed offer becomes a verified report and survives reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Create demo wallet" }).click();
  await expect(
    page.getByRole("heading", { name: "What do you need?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get signed offers" }).click();
  await expect(
    page.getByRole("button", { name: "Select →" }).first(),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Select →" }).first().click();
  await expect(
    page.getByRole("button", { name: "Review & sign payment" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review & sign payment" }).click();
  await expect(
    page.getByRole("heading", { name: "Agreement kept. Report verified." }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("proofbid-report.json");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Agreement kept. Report verified." }),
  ).toBeVisible();
  await expect(
    page.getByText("Real chain settlement", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/proofbid-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("blocks receiving-agent price drift before signing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create demo wallet" }).click();
  await page.getByText("Attack lab", { exact: false }).click();
  await page.getByLabel("Attack scenario").selectOption("price");
  await page.getByRole("button", { name: "Get signed offers" }).click();
  await expect(
    page.getByRole("button", { name: "Select →" }).first(),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Select →" }).first().click();
  await expect(page.getByText("× Conditions changed")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review & sign payment" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Choose another eligible offer. No funds were reserved."),
  ).toBeVisible();
});
test("reconciles lost payment response without another approval", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create demo wallet" }).click();
  await page.getByText("Attack lab", { exact: false }).click();
  await page.getByLabel("Attack scenario").selectOption("unknown");
  await page.getByRole("button", { name: "Get signed offers" }).click();
  await expect(
    page.getByRole("button", { name: "Select →" }).first(),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Select →" }).first().click();
  await page.getByRole("button", { name: "Review & sign payment" }).click();
  await expect(
    page.getByRole("heading", { name: "Agreement kept. Report verified." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review & sign payment" }),
  ).toHaveCount(0);
});

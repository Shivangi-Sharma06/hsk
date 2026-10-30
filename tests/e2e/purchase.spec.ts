import { readFile } from "node:fs/promises";
import { verifyBundle } from "../../packages/domain/src/proof.js";
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
  let resumeRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    resumeRefresh = resolve;
  });
  const runId = new URL(page.url()).pathname.split("/").pop();
  await page.route(`**/api/rfqs/${runId}`, async (route) => {
    await refreshGate;
    await route.continue();
  });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("proofbid-report.json");
  await expect(
    page.getByRole("button", { name: "Export private proof" }),
  ).toBeDisabled();
  resumeRefresh();
  const proofEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export private proof" }).click();
  const proofDownload = await proofEvent;
  const bundle = JSON.parse(
    await readFile((await proofDownload.path())!, "utf8"),
  );
  expect(await verifyBundle(bundle)).toMatchObject({
    quoteSignatureValid: true,
    deliverySignatureValid: true,
    chainVerified: false,
    payerAuthorizationVerified: false,
  });
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

test("stops before signing when the reserved payment differs from the review", async ({
  page,
}) => {
  let authorizations = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/authorize")) authorizations++;
  });
  await page.route("**/api/rfqs/*/approve", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.prepared.payerMaxDebitBaseUnits = String(
      BigInt(body.prepared.payerMaxDebitBaseUnits) + 1n,
    );
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create demo wallet" }).click();
  await page.getByRole("button", { name: "Get signed offers" }).click();
  await page.getByRole("button", { name: "Select →" }).first().click();
  await page.getByRole("button", { name: "Review & sign payment" }).click();
  await expect(page.getByRole("alert")).toContainText("Payment review changed");
  expect(authorizations).toBe(0);
  await expect(
    page.getByRole("button", { name: "Resume payment signature" }),
  ).toBeVisible();
});

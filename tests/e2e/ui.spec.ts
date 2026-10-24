// UI smoke test for the driver flow, the trace page and the demo county portal.
// @playwright/test is not installed, so this uses the `playwright` library directly.
// Run against a dev server started with NEXT_PUBLIC_UI_FIXTURE=1 (or a live backend):
//   npx tsx tests/e2e/ui.spec.ts
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";

async function answerAllQuestions(page: Page): Promise<void> {
  // The live agent may still be streaming questions, and the sheet animates between them,
  // so each click is short-lived and retried until the result appears.
  const heading = page.getByTestId("result-heading");
  for (let i = 0; i < 120 && !(await heading.count()); i++) {
    const all = page.getByTestId("answer-all");
    const option = page.locator("[data-option=driving]");
    const target = (await all.count()) ? all : option.first();
    if (await option.count()) await target.click({ timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
}

async function driverFlow(page: Page): Promise<string> {
  await page.goto(`${BASE}/?lang=en`);
  await assert.doesNotReject(page.locator("h1").waitFor());
  await page.getByTestId("use-demo").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radiogroup").first().waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("build-proof").click();
  await page.waitForURL(/\/case\//, { timeout: 20_000 });

  await page.locator("[data-option]").first().waitFor({ timeout: 30_000 });
  await answerAllQuestions(page);

  const heading = page.getByTestId("result-heading");
  await heading.waitFor({ timeout: 60_000 });
  const text = (await heading.textContent()) ?? "";
  assert.match(text, /months? look/i, "result heading speaks in 'looks like', not a verdict");
  assert.doesNotMatch(await page.locator("main").innerText(), /you are (compliant|exempt)/i);
  assert.equal(await page.locator("[data-month]").count() > 0, true, "month rows render");

  await page.getByRole("button", { name: /Show source 1/ }).click();
  await page.locator("#citation-card").waitFor();

  return page.url().split("/case/")[1].split("?")[0];
}

async function portalAgent(page: Page, id: string): Promise<void> {
  await page.goto(`${BASE}/case/${id}/portal?lang=en`);
  const submit = page.getByTestId("user-submit");
  await submit.waitFor({ timeout: 60_000 });
  // Nothing is submitted until the user taps the button.
  assert.equal(await page.getByTestId("confirmation").count(), 0);
  await submit.click();
  await page.getByTestId("confirmation").waitFor({ timeout: 30_000 });
}

async function trace(page: Page, id: string): Promise<void> {
  await page.goto(`${BASE}/trace/${id}?lang=en`);
  await page.locator("tbody tr").first().waitFor({ timeout: 30_000 });
  assert.ok((await page.locator('tr[data-decided-by="claude"]').count()) > 0);
  assert.ok((await page.locator('tr[data-decided-by="code"]').count()) > 0);
}

async function demoPortal(page: Page): Promise<void> {
  await page.goto(`${BASE}/portal-demo`);
  assert.match(await page.locator("[role=note]").innerText(), /not a real government site/i);
  await page.click("#login-continue");
  await page.fill("#full_name", "Test Driver");
  await page.fill("#case_number", "DEMO-0001");
  await page.fill("#report_month", "2026-11");
  await page.fill("#income_amount", "612.40");
  await page.fill("#hours_worked", "34");
  await page.fill("#platforms", "Uber, Lyft");
  await page.click("#report-next");
  await page.click("#upload-next");
  assert.equal(await page.locator("#review-income_amount").innerText(), "612.40");
  assert.equal(await page.locator("#review-report_month").innerText(), "2026-11");
  await page.click("#portal-submit");
  assert.match(await page.locator("#confirmation-number").innerText(), /^DEMO-CONF-\d{6}$/);
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 1440, height: 900 },
    ]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const id = await driverFlow(page);
      await portalAgent(page, id);
      await trace(page, id);
      await demoPortal(page);
      assert.deepEqual(errors, [], `no page errors at ${viewport.width}px`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `no horizontal scroll at ${viewport.width}px`);
      await context.close();
      process.stdout.write(`ok ${viewport.width}px\n`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

// The ONLY code path that clicks the portal's Submit button. Called by our API route when the human
// taps Submit. It re-reads the form and refuses if anything differs from the packet.
import { computeDiff, diffOk } from "./diff";
import { byId, closePortalSession, getPortalSession, isOnReviewPage, readFormValues } from "./executor";
import { PORTAL_IDS } from "./types";

const CONFIRMATION_TIMEOUT_MS = 10_000;

export class PortalSubmitError extends Error {}

export async function submitPortal(sessionId: string): Promise<{ confirmation: string }> {
  const session = getPortalSession(sessionId);
  if (!session) throw new PortalSubmitError("No open portal session. Run the portal agent again.");
  if (session.status !== "ready_to_submit" || !session.expected || !session.diff) {
    throw new PortalSubmitError("The form is not ready to submit yet.");
  }
  if (!diffOk(session.diff)) throw new PortalSubmitError("Some fields do not match your packet. Fix them before submitting.");

  // Re-check live: the page may have changed since the agent stopped.
  const live = computeDiff(session.expected, await readFormValues(session.page), session.packetPath, await isOnReviewPage(session.page));
  session.diff = live;
  if (!diffOk(live)) throw new PortalSubmitError("The form changed and no longer matches your packet. Submission refused.");

  await session.page.locator(byId(PORTAL_IDS.submit)).first().click();
  const conf = session.page.locator(byId(PORTAL_IDS.confirmation)).first();
  await conf.waitFor({ state: "visible", timeout: CONFIRMATION_TIMEOUT_MS });
  const confirmation = ((await conf.textContent()) ?? "").trim();
  if (!confirmation) throw new PortalSubmitError("The portal did not show a confirmation number.");
  session.status = "submitted";
  await closePortalSession(sessionId);
  return { confirmation };
}

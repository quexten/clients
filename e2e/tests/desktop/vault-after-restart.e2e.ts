import { rmSync } from "node:fs";
import { resolve } from "node:path";

import { _electron, ElectronApplication, expect, Page, test } from "@playwright/test";

import { account } from "../../src/credentials";
import { LockScreen } from "../../src/lock-screen";
import { LoginPage } from "../../src/login";
import { DESKTOP_BUILD_DIR, E2E_STATE_DIR } from "../../src/paths";
import { IS_DEV_SERVER } from "../../src/server";

const VAULT_URL = /#\/vault/;
// A row of the vault list: `vault-items-table` under VFO1, apps/desktop vault-v3's own otherwise.
const CIPHER_ROW = "[vaultItemsTableRowContextMenu], tr[appVaultCipherRow]";
const RENDER_TIMEOUT_MS = 2 * 60_000;
const TEST_TIMEOUT_MS = 10 * 60_000;

// Kept across both launches, so the second one starts logged in and locked.
const APPDATA_DIR = resolve(E2E_STATE_DIR, "desktop-restart-profile");
async function launch(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await _electron.launch({
    args: [
      DESKTOP_BUILD_DIR,
      "--no-sandbox",
      ...(IS_DEV_SERVER ? ["--ignore-certificate-errors"] : []),
    ],
    env: {
      ...process.env,
      BITWARDEN_APPDATA_DIR: APPDATA_DIR,
      BITWARDEN_IPC_SOCKET_DIR: E2E_STATE_DIR,
      NODE_ENV: "development",
    },
  });
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.waitForLoadState("domcontentloaded");
  return { app, window };
}

async function expectVaultListed(window: Page, phase: string) {
  try {
    await window.waitForURL(VAULT_URL, { timeout: RENDER_TIMEOUT_MS });
    await expect(window.locator(CIPHER_ROW).first()).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
  } catch (error) {
    await window.screenshot({ path: test.info().outputPath(`${phase}.png`) });
    throw error;
  }
}

test.beforeAll(() => rmSync(APPDATA_DIR, { recursive: true, force: true }));

test("lists the vault after the first unlock of a restarted app", async () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  // Given a user who logged in, so the app keeps their account
  await test.step("log in", async () => {
    const first = await launch();
    await new LoginPage(first.window).logIn();
    await expectVaultListed(first.window, "after-login");
    await first.app.close();
  });

  // When the app starts again, locked, and the user unlocks for the first time
  // Then the vault list shows the user's items
  await test.step("restart and unlock", async () => {
    const second = await launch();
    const lockScreen = new LockScreen(second.window);
    await lockScreen.waitUntilShown();
    await lockScreen.unlockWithMasterPassword(account().password);
    await expectVaultListed(second.window, "after-restart-unlock");
    await second.app.close();
  });
});

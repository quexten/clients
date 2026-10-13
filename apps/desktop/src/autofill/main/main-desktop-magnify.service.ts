import * as path from "path";

import { app, ipcMain, globalShortcut, BrowserWindow, screen } from "electron";
import { filter, firstValueFrom, map, switchMap } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { DomainSettingsService } from "@bitwarden/common/autofill/services/domain-settings.service";
import { DefaultBillingAccountProfileStateService } from "@bitwarden/common/billing/services/account/billing-account-profile-state.service";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { SdkService } from "@bitwarden/common/platform/abstractions/sdk/sdk.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums/cipher-type";
import { buildCipherIcon } from "@bitwarden/common/vault/icon/build-cipher-icon";
import type { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { TotpService } from "@bitwarden/common/vault/services/totp.service";
import { CipherViewLikeUtils } from "@bitwarden/common/vault/utils/cipher-view-like-utils";
import { LogService } from "@bitwarden/logging";
import type { TotpResponse } from "@bitwarden/sdk-internal";
import { StateProvider } from "@bitwarden/state";
import { UserId } from "@bitwarden/user-core";

import { WindowMain } from "../../main/window.main";
import { MAGNIFY_IPC_CHANNELS } from "../models/ipc-channels";
import {
  DEFAULT_CARD_EXPIRATION_FORMAT,
  MagnifyAuthStatus,
  MagnifyCommand,
  MagnifyCommandRequest,
  MagnifyCommandResponse,
  MagnifyErrorCode,
} from "../models/magnify-commands";
import { MagnifyItem } from "../models/magnify-items";

/**
 * Removes accents/diacritics so e.g. "café" matches "cafe", mirroring the basic search behavior
 * in `SearchService.searchCiphersBasic`.
 */
function normalizeSearchQuery(query: string): string {
  return query?.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export class MainDesktopMagnifyService {
  private MAGNIFY_KEYBOARD_SHORTCUT = "CommandOrControl+Shift+Space";

  // allows only a single instance of the window to be opened regardless of how many times the hotkey to open it is pressed.
  private magnifyWindow: BrowserWindow | null = null;

  private readonly totpService: TotpService;
  private readonly billingAccountProfileStateService: DefaultBillingAccountProfileStateService;

  constructor(
    private logService: LogService,
    private windowMain: WindowMain,
    private authService: AuthService,
    private accountService: AccountService,
    private cipherService: CipherService,
    private environmentService: EnvironmentService,
    private domainSettingsService: DomainSettingsService,
    sdkService: SdkService,
    stateProvider: StateProvider,
  ) {
    this.totpService = new TotpService(sdkService);
    this.billingAccountProfileStateService = new DefaultBillingAccountProfileStateService(
      stateProvider,
    );
  }

  async init(): Promise<void> {
    await this.registerIpcListeners();
  }

  /*
    Register various IPC listeners

    Before changing IPC, please read:
    https://www.electronjs.org/docs/latest/tutorial/ipc
  */
  async registerIpcListeners() {
    // BW render process -> main process: toggle magnify on/off
    ipcMain.on(MAGNIFY_IPC_CHANNELS.TOGGLE, async (_event, enable: boolean) => {
      if (enable) {
        await this.enableMagnify();
      } else {
        this.disableMagnify();
      }
    });

    // Magnify render process -> main process: execute a command and return its response.
    // Commands are served by the main process directly (not relayed through the BW renderer)
    // so they keep working while the BW renderer is torn down (running in the tray).
    ipcMain.handle(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND, (event, command) =>
      this.commandHandler(event, command),
    );

    // Magnify render process -> main process: resize the magnify window
    ipcMain.on(MAGNIFY_IPC_CHANNELS.MAGNIFY_RESIZE, (_event, height: number) => {
      if (this.magnifyWindow != null && !this.magnifyWindow.isDestroyed()) {
        this.magnifyWindow.setSize(640, height, false);
      }
    });

    // Magnify render process -> main process: focus the main BW window and close Magnify
    ipcMain.on(MAGNIFY_IPC_CHANNELS.MAGNIFY_FOCUS_BITWARDEN, async () => {
      this.magnifyWindow?.close();
      // The BW renderer may have been torn down while running in the background; recreate it
      // before showing so `win` is never null.
      await this.windowMain.ensureRenderer();
      this.windowMain.win.show();
      this.windowMain.win.focus();
    });

    // Magnify render process -> main process: dismiss Magnify and return focus to the previous app
    ipcMain.on(MAGNIFY_IPC_CHANNELS.MAGNIFY_DISMISS, () => {
      this.dismissMagnify();
    });

    // Close the magnify window if the main BW window is closed
    this.windowMain.win.on("closed", () => {
      this.magnifyWindow?.close();
    });
  }

  // Deregister the keyboard shortcut if registered.
  disableMagnify() {
    if (globalShortcut.isRegistered(this.MAGNIFY_KEYBOARD_SHORTCUT)) {
      globalShortcut.unregister(this.MAGNIFY_KEYBOARD_SHORTCUT);
      this.logService.debug("Magnify disabled.");
    } else {
      this.logService.debug("Magnify is not registered, implicitly disabled.");
    }
  }

  dispose() {
    ipcMain.removeAllListeners(MAGNIFY_IPC_CHANNELS.TOGGLE);
    ipcMain.removeHandler(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND);
    ipcMain.removeAllListeners(MAGNIFY_IPC_CHANNELS.MAGNIFY_RESIZE);
    ipcMain.removeAllListeners(MAGNIFY_IPC_CHANNELS.MAGNIFY_FOCUS_BITWARDEN);
    ipcMain.removeAllListeners(MAGNIFY_IPC_CHANNELS.MAGNIFY_DISMISS);

    // Also unregister the global shortcut
    this.disableMagnify();
  }

  // Register the current keyboard shortcut if not already registered
  private async enableMagnify() {
    if (globalShortcut.isRegistered(this.MAGNIFY_KEYBOARD_SHORTCUT)) {
      this.logService.debug(
        "Magnify is already enabled with this keyboard shortcut: " + this.MAGNIFY_KEYBOARD_SHORTCUT,
      );
      return;
    }

    const result = globalShortcut.register(this.MAGNIFY_KEYBOARD_SHORTCUT, async () => {
      await this.triggerMagnify();
    });

    result
      ? this.logService.debug("Magnify enabled.")
      : this.logService.error("Failed to enable Magnify.");
  }

  private async triggerMagnify() {
    // if already open: close the window
    if (this.magnifyWindow != null && !this.magnifyWindow.isDestroyed()) {
      this.dismissMagnify();
      return;
    }

    // otherwise: create the window
    const win = new BrowserWindow({
      width: 640,
      height: 56,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, "magnify", "preload.js"),
        sandbox: true,
        contextIsolation: true,
      },
    });

    win.on("closed", () => {
      this.magnifyWindow = null;
    });

    // emitted when the window loses focus
    win.on("blur", () => {
      win.close();
    });

    // The application menu registers accelerators that collide with Magnify's shortcuts: ⌘C ("copy")
    // and ⌘X ("cut") as role accelerators, and ⌘⇧C ("New card"). On macOS the native NSMenu handles
    // those before the renderer's keydown fires, so Magnify's own ⌘C/⌘⇧C/⌘X copy shortcuts would be
    // swallowed. Intercept every Magnify shortcut here — before-input-event fires before the menu
    // accelerator — and relay it to the renderer, whose dispatch matches the selected item type.
    // preventDefault() stops both the menu accelerator and the page keydown. Other menu accelerators
    // (⌘⇧L "New login", ⌘P "Copy password", …) are left alone and keep working.
    win.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") {
        return;
      }

      // close the window when ESC pressed
      if (input.key === "Escape") {
        this.dismissMagnify();
        return;
      }

      const shortcut = this.magnifyShortcutFor(input);
      if (shortcut != null) {
        event.preventDefault();
        win.webContents.send(MAGNIFY_IPC_CHANNELS.MAGNIFY_SHORTCUT, shortcut);
      }
    });

    this.magnifyWindow = win;

    await win.loadFile(path.join(__dirname, "magnify", "index.html"));

    // Position magnify window after loading to ensure it's properly rendered
    this.positionMagnifyWindow(win);

    // Show the window and steal keyboard focus from the previously-focused app (e.g. Chrome)
    if (process.platform === "darwin") {
      app.show();
    }
    win.show();
    win.focus();
    if (process.platform === "darwin") {
      app.focus({ steal: true });
    }
  }

  /*
    Position the magnify window at the center of the display where the mouse cursor is.
    This is more reliable than checking focused windows since the global shortcut can
    shift focus to the Bitwarden window.
  */
  private positionMagnifyWindow(win: BrowserWindow) {
    // Get the display where the mouse cursor is currently located
    const mousePoint = screen.getCursorScreenPoint();
    const targetDisplay = screen.getDisplayNearestPoint(mousePoint);

    // Set the magnify position on the screen
    const x = targetDisplay.bounds.x + (targetDisplay.bounds.width - 640) / 2;
    const y = targetDisplay.bounds.y + (targetDisplay.bounds.height - 56) / 4;

    win.setPosition(Math.round(x), Math.round(y));
  }

  /*
    Closes the magnify window and returns focus to the previously-focused app.
    On macOS, when the main Bitwarden window is hidden (running in the background),
    deactivating the app via app.hide() makes macOS reactivate the app that had
    focus before Magnify opened.
  */
  private dismissMagnify(): void {
    if (this.magnifyWindow != null && !this.magnifyWindow.isDestroyed()) {
      this.magnifyWindow.close();
    }
    if (
      process.platform === "darwin" &&
      this.windowMain.win != null &&
      !this.windowMain.win.isDestroyed() &&
      !this.windowMain.win.isVisible()
    ) {
      app.hide();
    }
  }

  /*
    Returns the Magnify shortcut combination for a CommandOrControl key event that collides with an
    application menu accelerator — ⌘C ("copy"), ⌘⇧C ("New card") and ⌘X ("cut") — or null for any
    other key. ⌥⌘T (copy TOTP) is relayed too so the renderer remains the single dispatcher. CmdOrCtrl
    collapses to "CommandOrControl" so the renderer can match the combination against MAGNIFY_ACTIONS.
    The primary key follows the logical key (input.key) so shortcuts match the user's keyboard layout;
    Option-composed keys (⌥⌘T) fall back to the physical key (input.code).
  */
  private magnifyShortcutFor(input: Electron.Input): string[] | null {
    if (!input.control && !input.meta) {
      return null;
    }

    // Prefer the logical key (input.key) so shortcuts follow the user's keyboard layout — ⌘C means
    // "the key that types C", not the physical QWERTY-C position. Option-composed keys (⌥⌘T yields
    // "†") fall back to the physical key (input.code).
    const primaryKey = /^[A-Za-z]$/.test(input.key)
      ? input.key.toUpperCase()
      : /^Key[A-Z]$/.test(input.code)
        ? input.code.slice(3)
        : null;
    if (primaryKey == null) {
      return null;
    }

    // Only the combinations Magnify actually handles: ⌘C/⌘⇧C (primary "C"), ⌥⌘T (alt "T"), and ⌘X
    // (primary "X"). Everything else belongs to the application menu and must fall through.
    const isMagnifyShortcut =
      (primaryKey === "C" && !input.alt) ||
      (primaryKey === "T" && input.alt && !input.shift) ||
      (primaryKey === "X" && !input.shift && !input.alt);
    if (!isMagnifyShortcut) {
      return null;
    }

    const combination: string[] = ["CommandOrControl"];
    if (input.shift) {
      combination.push("Shift");
    }
    if (input.alt) {
      combination.push("Alt");
    }
    combination.push(primaryKey);
    return combination;
  }

  /*
    Executes a Magnify command from the magnify render process and returns its response.
    Everything except ViewInBitwarden is served by the main process, which owns the session
    and the decrypted vault keys, so search and copy keep working even when the BW renderer
    has been torn down (running in the background/tray).
  */
  private async commandHandler(
    _event: Electron.IpcMainInvokeEvent,
    command: MagnifyCommandRequest,
  ): Promise<MagnifyCommandResponse> {
    const authStatus = await firstValueFrom(this.authService.activeAccountStatus$);

    // GetAuthStatus always returns a successful response regardless of auth state
    if (command.type === MagnifyCommand.GetAuthStatus) {
      let status: MagnifyAuthStatus;
      if (authStatus === AuthenticationStatus.LoggedOut) {
        status = MagnifyAuthStatus.LoggedOut;
      } else if (authStatus === AuthenticationStatus.Locked) {
        status = MagnifyAuthStatus.Locked;
      } else {
        status = MagnifyAuthStatus.Unlocked;
      }
      return { type: MagnifyCommand.GetAuthStatus, status };
    }

    // All other commands require an unlocked vault
    if (authStatus === AuthenticationStatus.LoggedOut) {
      throw new Error(MagnifyErrorCode.LoggedOut);
    }

    if (authStatus === AuthenticationStatus.Locked) {
      throw new Error(MagnifyErrorCode.VaultLocked);
    }

    switch (command.type) {
      case MagnifyCommand.SearchVault:
        return await this.searchVault(command.input);

      case MagnifyCommand.CopyPassword:
        return await this.copyPassword(command.itemId);

      case MagnifyCommand.CopyTotp:
        return await this.copyTotp(command.itemId);

      case MagnifyCommand.ViewInBitwarden:
        return await this.viewInBitwarden(command.itemId);

      case MagnifyCommand.CopyCardNumber:
        return await this.copyCardNumber(command.itemId);

      case MagnifyCommand.CopyCardExpiration:
        return await this.copyCardExpiration(
          command.itemId,
          command.format ?? DEFAULT_CARD_EXPIRATION_FORMAT,
        );

      case MagnifyCommand.CopyCardCode:
        return await this.copyCardCode(command.itemId);
    }
  }

  /*
    Searches the vault for Login and Card ciphers matching the input string and returns
    them as Magnify search results.
  */
  private async searchVault(input: string): Promise<MagnifyCommandResponse> {
    const q = input.trim().toLowerCase();

    const ciphers = await firstValueFrom(
      this.accountService.activeAccount$.pipe(
        map((account) => account?.id),
        filter((userId): userId is UserId => userId != null),
        switchMap((userId) => this.cipherService.cipherViews$(userId)),
      ),
    );

    const matched = ciphers.filter((c) => {
      if (c.type !== CipherType.Login && c.type !== CipherType.Card) {
        return false;
      }
      if (c.isDeleted || c.isArchived) {
        return false;
      }

      // Basic search: split the query into whitespace-separated terms and require every term to
      // match at least one field (name, subtitle, login URI hostname, notes, or id for long terms).
      const terms = normalizeSearchQuery(q).split(/\s+/).filter(Boolean);
      return terms.every((term) => {
        if (c.name != null && normalizeSearchQuery(c.name.toLowerCase()).includes(term)) {
          return true;
        }
        if (term.length >= 8 && c.id.startsWith(term)) {
          return true;
        }
        const subtitle = CipherViewLikeUtils.subtitle(c);
        if (subtitle != null && normalizeSearchQuery(subtitle.toLowerCase()).includes(term)) {
          return true;
        }
        const login = CipherViewLikeUtils.getLogin(c);
        if (
          login?.uris?.some((loginUri) => {
            if (!loginUri?.uri) {
              return false;
            }
            const hostname = CipherViewLikeUtils.getUriHostname(loginUri);
            if (!hostname) {
              return false;
            }
            return normalizeSearchQuery(hostname.toLowerCase()).includes(term);
          })
        ) {
          return true;
        }
        const notes = CipherViewLikeUtils.getNotes(c);
        if (notes && normalizeSearchQuery(notes.toLowerCase()).includes(term)) {
          return true;
        }
        return false;
      });
    });

    matched.sort((a, b) => {
      const aStarts = a.name?.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name?.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    });

    const env = await firstValueFrom(this.environmentService.environment$);
    const iconsUrl = env.getIconsUrl();
    const showFavicons = await firstValueFrom(this.domainSettingsService.showFavicons$);

    const activeAccount = await firstValueFrom(this.accountService.activeAccount$);
    const hasPremium = activeAccount?.id
      ? await firstValueFrom(
          this.billingAccountProfileStateService.hasPremiumFromAnySource$(activeAccount.id),
        )
      : false;

    const response: MagnifyCommandResponse = {
      type: MagnifyCommand.SearchVault,
      results: matched.map((c) => {
        if (c.type === CipherType.Card) {
          return {
            itemType: MagnifyItem.Card,
            id: c.id,
            name: c.name,
            brand: c.card?.brand ?? undefined,
          };
        }
        return {
          itemType: MagnifyItem.Login,
          id: c.id,
          name: c.name,
          username: c.login?.username ?? "",
          iconUrl: buildCipherIcon(iconsUrl, c, showFavicons).image ?? null,
          hasTotp: !!c.login?.hasTotp && (c.organizationUseTotp || hasPremium),
        };
      }),
    };

    return response;
  }

  private async findCipher(itemId: string): Promise<CipherView> {
    const ciphers = await firstValueFrom(
      this.accountService.activeAccount$.pipe(
        map((account) => account?.id),
        filter((userId): userId is UserId => userId != null),
        switchMap((userId) => this.cipherService.cipherViews$(userId)),
      ),
    );

    const cipher = ciphers.find((c) => c.id === itemId && c.deletedDate == null);

    if (!cipher) {
      throw new Error(`Cipher with id ${itemId} not found.`);
    }

    return cipher;
  }

  /*
    Returns the password for a specific Login cipher.
  */
  private async copyPassword(itemId: string): Promise<MagnifyCommandResponse> {
    const cipher = await this.findCipher(itemId);
    return { type: MagnifyCommand.CopyPassword, result: cipher.login?.password ?? "" };
  }

  /*
    Returns the current TOTP code for a specific Login cipher.
  */
  private async copyTotp(itemId: string): Promise<MagnifyCommandResponse> {
    const cipher = await this.findCipher(itemId);
    return { type: MagnifyCommand.CopyTotp, result: await this.getTotpCode(cipher) };
  }

  private async getTotpCode(cipher: CipherView): Promise<string> {
    const totpSecret = cipher.login?.totp;
    if (!totpSecret) {
      return "";
    }
    if (!cipher.organizationUseTotp && !(await this.userHasPremium())) {
      return "";
    }
    const totp = await firstValueFrom(this.totpService.getCode$(totpSecret)).catch(
      (): TotpResponse | null => null,
    );
    return totp?.code ?? "";
  }

  private async userHasPremium(): Promise<boolean> {
    const account = await firstValueFrom(this.accountService.activeAccount$);
    if (!account?.id) {
      return false;
    }
    return firstValueFrom(
      this.billingAccountProfileStateService.hasPremiumFromAnySource$(account.id),
    );
  }

  /*
    Returns the card number for a specific Card vault item.
  */
  private async copyCardNumber(itemId: string): Promise<MagnifyCommandResponse> {
    const cipher = await this.findCipher(itemId);
    return { type: MagnifyCommand.CopyCardNumber, result: cipher.card?.number ?? "" };
  }

  /*
    Returns the expiration date for a specific Card vault item.
    The format parameter controls the output format, where "MM" is replaced
    with the zero-padded month and "YYYY" with the four-digit year.
  */
  private async copyCardExpiration(
    itemId: string,
    format: string,
  ): Promise<MagnifyCommandResponse> {
    const cipher = await this.findCipher(itemId);

    const month = (cipher.card?.expMonth ?? "").padStart(2, "0");
    const year = cipher.card?.expYear ?? "";
    return {
      type: MagnifyCommand.CopyCardExpiration,
      result: format.replace("MM", month).replace("YYYY", year),
    };
  }

  /*
    Returns the CVV/security code for a specific Card vault item.
  */
  private async copyCardCode(itemId: string): Promise<MagnifyCommandResponse> {
    const cipher = await this.findCipher(itemId);
    return { type: MagnifyCommand.CopyCardCode, result: cipher.card?.code ?? "" };
  }

  /*
    Navigates the main Bitwarden window to the specified item. Unlike the other commands this
    still needs the BW renderer (the navigation happens in the Angular UI), so the renderer is
    recreated and waited on before the command is relayed to it.
  */
  private async viewInBitwarden(itemId: string): Promise<MagnifyCommandResponse> {
    await this.windowMain.ensureRendererReady();

    const response = await new Promise<MagnifyCommandResponse>((resolve, reject) => {
      const onResponse = (_event: Electron.IpcMainEvent, response: MagnifyCommandResponse) => {
        ipcMain.removeListener(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RELAY_ERROR, onError);
        resolve(response);
      };
      const onError = (_event: Electron.IpcMainEvent, errorMessage: string) => {
        ipcMain.removeListener(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RESPONSE, onResponse);
        reject(new Error(errorMessage));
      };

      ipcMain.once(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RESPONSE, onResponse);
      ipcMain.once(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RELAY_ERROR, onError);

      this.windowMain.win.webContents.send(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RELAY, {
        type: MagnifyCommand.ViewInBitwarden,
        itemId,
      });
    });

    this.magnifyWindow?.close();
    this.windowMain.win.show();

    return response;
  }
}

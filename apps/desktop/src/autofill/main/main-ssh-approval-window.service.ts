import * as path from "path";

import { app, BrowserWindow, ipcMain, screen } from "electron";
import { filter, firstValueFrom } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/logging";

import { MainMiniUnlockService } from "../../key-management/unlock/main-mini-unlock.service";
import { WindowMain } from "../../main/window.main";
import { DesktopSettingsService } from "../../platform/services/desktop-settings.service";
import { isDev } from "../../utils";
import { SSH_APPROVAL_IPC_CHANNELS } from "../models/ipc-channels";
import {
  MiniUnlockMethod,
  MiniUnlockResult,
  SshApprovalMode,
  SshApprovalRequest,
  SshApprovalState,
  SshApprovalStrings,
} from "../models/ssh-approval";

const WINDOW_WIDTH = 400;
const INITIAL_HEIGHT = 240;

// The Rust agent gives up on a request after 60 s (APPROVAL_CALLBACK_TIMEOUT), so a prompt must
// never outlive it.
const SESSION_TIMEOUT_MS = 60_000;

const BIOMETRICS_BUTTON_KEYS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "unlockWithTouchId",
  win32: "unlockWithWindowsHello",
  linux: "unlockWithPolkit",
};

/** Asks the user something inside an open session. Each call resolves with their answer. */
export interface SshApprovalPrompt {
  /** Resolves true once the active account is unlocked, false when dismissed or timed out. */
  unlock(): Promise<boolean>;
  /** Resolves true when the user authorizes the request. */
  approve(request: SshApprovalRequest): Promise<boolean>;
}

/**
 * Small, always-on-top window that unlocks the vault and approves SSH agent requests without
 * surfacing the full app. Modeled on Magnify, but talks only to the main process: main owns the
 * session, so no renderer relay is needed.
 *
 *   MainSshAgentService ──session()──▶ this ◀──ipc──▶ ssh-approval renderer
 *                                       │
 *                                       └──▶ MainMiniUnlockService
 */
export class MainSshApprovalWindowService {
  private win: BrowserWindow | null = null;
  private state: SshApprovalState | null = null;

  // Settles the prompt on screen; null when nothing is asked.
  private answer: ((value: boolean) => void) | null = null;
  private expired = false;

  // Serializes sessions so only one request prompts at a time.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly logService: LogService,
    private readonly windowMain: WindowMain,
    private readonly accountService: AccountService,
    private readonly authService: AuthService,
    private readonly miniUnlockService: MainMiniUnlockService,
    private readonly desktopSettingsService: DesktopSettingsService,
    private readonly i18nService: I18nService,
  ) {}

  init(): void {
    ipcMain.handle(SSH_APPROVAL_IPC_CHANNELS.GET_STATE, (event) => {
      this.assertSender(event);
      return this.state;
    });

    ipcMain.handle(
      SSH_APPROVAL_IPC_CHANNELS.UNLOCK,
      (event, method: MiniUnlockMethod, secret?: string) => {
        this.assertSender(event);
        return this.unlockActive(method, secret);
      },
    );

    ipcMain.handle(SSH_APPROVAL_IPC_CHANNELS.RESPOND, (event, accepted: boolean) => {
      this.assertSender(event);
      if (this.state?.mode === SshApprovalMode.Approve) {
        this.settle(accepted === true);
      }
    });

    ipcMain.on(SSH_APPROVAL_IPC_CHANNELS.RESIZE, (event, height: number) => {
      if (this.win == null || event.sender !== this.win.webContents) {
        return;
      }
      this.win.setSize(WINDOW_WIDTH, Math.round(height), false);
    });
  }

  dispose(): void {
    ipcMain.removeHandler(SSH_APPROVAL_IPC_CHANNELS.GET_STATE);
    ipcMain.removeHandler(SSH_APPROVAL_IPC_CHANNELS.UNLOCK);
    ipcMain.removeHandler(SSH_APPROVAL_IPC_CHANNELS.RESPOND);
    ipcMain.removeAllListeners(SSH_APPROVAL_IPC_CHANNELS.RESIZE);
    this.close();
  }

  /**
   * Runs `fn` as one prompt session. The window opens on the first prompt, stays open across
   * prompts (unlock, then approve) and closes when `fn` settles or the session times out.
   */
  session<T>(fn: (prompt: SshApprovalPrompt) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => this.runSession(fn));
    this.queue = run.catch((): void => undefined);
    return run;
  }

  /** Brings the window to the front. Returns false when no prompt is open. */
  focus(): boolean {
    if (this.win == null || this.win.isDestroyed()) {
      return false;
    }
    this.show(this.win);
    return true;
  }

  private async runSession<T>(fn: (prompt: SshApprovalPrompt) => Promise<T>): Promise<T> {
    this.expired = false;
    const timer = setTimeout(() => {
      this.expired = true;
      this.settle(false);
    }, SESSION_TIMEOUT_MS);

    try {
      return await fn({
        unlock: () => this.promptUnlock(),
        approve: (request) => this.promptApprove(request),
      });
    } finally {
      clearTimeout(timer);
      this.close();
    }
  }

  private async promptUnlock(): Promise<boolean> {
    const account = await firstValueFrom(this.accountService.activeAccount$);
    if (account == null || this.expired) {
      return false;
    }

    const status = await firstValueFrom(this.authService.activeAccountStatus$);
    if (status === AuthenticationStatus.Unlocked) {
      return true;
    }

    const unlockOptions = await this.miniUnlockService.options(account.id);

    // Unlocking anywhere (this window or the full app) satisfies the prompt.
    const answered = this.ask({ mode: SshApprovalMode.Unlock, request: null, unlockOptions });
    const unlocked = this.authService.activeAccountStatus$
      .pipe(filter((s) => s === AuthenticationStatus.Unlocked))
      .subscribe(() => this.settle(true));

    try {
      return await answered;
    } finally {
      unlocked.unsubscribe();
    }
  }

  private promptApprove(request: SshApprovalRequest): Promise<boolean> {
    if (this.expired) {
      return Promise.resolve(false);
    }
    return this.ask({ mode: SshApprovalMode.Approve, request, unlockOptions: null });
  }

  /** Shows `state` in the window and resolves with the user's answer. */
  private ask(state: Omit<SshApprovalState, "strings">): Promise<boolean> {
    this.settle(false);
    this.state = { ...state, strings: this.strings(state.request) };

    const answered = new Promise<boolean>((resolve) => {
      this.answer = resolve;
    });

    if (this.win != null && !this.win.isDestroyed()) {
      this.win.webContents.send(SSH_APPROVAL_IPC_CHANNELS.STATE_CHANGED, this.state);
      this.show(this.win);
    } else {
      void this.open();
    }

    return answered;
  }

  private settle(value: boolean): void {
    const answer = this.answer;
    this.answer = null;
    answer?.(value);
  }

  private async unlockActive(method: MiniUnlockMethod, secret?: string): Promise<MiniUnlockResult> {
    const account = await firstValueFrom(this.accountService.activeAccount$);
    if (account == null || this.state?.mode !== SshApprovalMode.Unlock) {
      return MiniUnlockResult.Error;
    }

    const result = await this.miniUnlockService.unlock(account.id, method, secret);
    if (result === MiniUnlockResult.TooManyAttempts) {
      this.settle(false);
    }
    return result;
  }

  private async open(): Promise<void> {
    const win = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: INITIAL_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, "ssh-approval", "preload.js"),
        sandbox: true,
        contextIsolation: true,
        devTools: isDev(),
      },
    });
    this.win = win;

    // Closing the window (Esc, OS close) denies whatever is asked. Blur does not: the OS
    // biometric prompt takes focus while unlocking.
    win.on("closed", () => {
      if (this.win === win) {
        this.win = null;
      }
      this.settle(false);
    });
    win.webContents.on("before-input-event", (_event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        win.close();
      }
    });

    // The window only ever shows its bundled page.
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event) => event.preventDefault());
    win.setContentProtection(await firstValueFrom(this.desktopSettingsService.preventScreenshots$));

    try {
      await win.loadFile(path.join(__dirname, "ssh-approval", "index.html"));
    } catch (e) {
      this.logService.error("[SshApproval] Failed to load the approval window", e);
      win.destroy();
      return;
    }

    if (win.isDestroyed()) {
      return;
    }
    this.position(win);
    this.show(win);
  }

  private close(): void {
    this.state = null;
    this.settle(false);

    if (this.win == null || this.win.isDestroyed()) {
      return;
    }
    this.win.close();
    this.win = null;

    // On macOS, hiding the app hands focus back to the app that made the request (e.g. a
    // terminal) when the full Bitwarden window is not showing.
    const main = this.windowMain.win;
    if (
      process.platform === "darwin" &&
      (main == null || main.isDestroyed() || !main.isVisible())
    ) {
      app.hide();
    }
  }

  private show(win: BrowserWindow): void {
    if (process.platform === "darwin") {
      app.show();
    }
    win.show();
    win.focus();
    if (process.platform === "darwin") {
      app.focus({ steal: true });
    }
  }

  /** Centers the window horizontally on the display under the cursor, a quarter down. */
  private position(win: BrowserWindow): void {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const [, height] = win.getSize();
    const x = display.bounds.x + (display.bounds.width - WINDOW_WIDTH) / 2;
    const y = display.bounds.y + (display.bounds.height - height) / 4;
    win.setPosition(Math.round(x), Math.round(y));
  }

  private strings(request: SshApprovalRequest | null): SshApprovalStrings {
    const t = (key: string) => this.i18nService.t(key);
    return {
      title: t("sshkeyApprovalTitle"),
      forwardingWarningTitle: t("agentForwardingWarningTitle"),
      forwardingWarningText: t("agentForwardingWarningText"),
      messageInfix: t("sshkeyApprovalMessageInfix"),
      messageSuffix: t("sshkeyApprovalMessageSuffix"),
      action: t(MainSshApprovalWindowService.actionKey(request?.namespace)),
      authorize: t("authorize"),
      deny: t("deny"),
      locked: t("yourVaultIsLockedV2"),
      unlockRequired: t("sshAgentUnlockRequired"),
      masterPassword: t("masterPass"),
      pin: t("pin"),
      unlock: t("unlock"),
      unlockWithBiometrics: t(BIOMETRICS_BUTTON_KEYS[process.platform] ?? "unlockWithBiometrics"),
      invalidMasterPassword: t("invalidMasterPassword"),
      invalidPin: t("invalidPin"),
      tooManyAttempts: t("tooManyInvalidPinEntryAttemptsLoggingOut"),
      errorOccurred: t("errorOccurred"),
    };
  }

  /** e.g. "git" -> sign a commit, "" -> log in, anything else -> generic sign. */
  private static actionKey(namespace?: string): string {
    if (namespace === "git") {
      return "sshActionGitSign";
    }
    if (namespace != null && namespace !== "") {
      return "sshActionSign";
    }
    return "sshActionLogin";
  }

  private assertSender(event: Electron.IpcMainInvokeEvent): void {
    if (this.win == null || event.sender !== this.win.webContents) {
      throw new Error("Rejected SSH approval IPC from an unknown sender");
    }
  }
}

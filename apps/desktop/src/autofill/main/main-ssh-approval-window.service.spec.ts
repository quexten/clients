import { BrowserWindow, ipcMain } from "electron";
import { mock } from "jest-mock-extended";
import { BehaviorSubject, of } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/logging";
import { UserId } from "@bitwarden/user-core";

import { MainMiniUnlockService } from "../../key-management/unlock/main-mini-unlock.service";
import { WindowMain } from "../../main/window.main";
import { DesktopSettingsService } from "../../platform/services/desktop-settings.service";
import { SSH_APPROVAL_IPC_CHANNELS } from "../models/ipc-channels";
import { MiniUnlockMethod, MiniUnlockResult } from "../models/mini-unlock";
import { SshApprovalMode, SshApprovalRequest } from "../models/ssh-approval";

import { MainSshApprovalWindowService } from "./main-ssh-approval-window.service";

type Handler = (...args: unknown[]) => unknown;

class FakeWindow {
  private handlers = new Map<string, Handler[]>();
  private destroyed = false;

  webContents = {
    send: jest.fn(),
    on: jest.fn(),
    setWindowOpenHandler: jest.fn(),
  };
  loadFile = jest.fn().mockResolvedValue(undefined);
  show = jest.fn();
  focus = jest.fn();
  setSize = jest.fn();
  setPosition = jest.fn();
  getSize = jest.fn().mockReturnValue([400, 240]);
  setContentProtection = jest.fn();
  isDestroyed = () => this.destroyed;

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  close = jest.fn(() => {
    this.destroyed = true;
    this.handlers.get("closed")?.forEach((h) => h());
  });

  destroy = jest.fn(() => (this.destroyed = true));
}

let windows: FakeWindow[] = [];

jest.mock("electron", () => ({
  app: { show: jest.fn(), focus: jest.fn(), hide: jest.fn() },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeHandler: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  screen: {
    getCursorScreenPoint: jest.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: jest.fn(() => ({
      bounds: { x: 0, y: 0, width: 1600, height: 1000 },
    })),
  },
  BrowserWindow: jest.fn(),
}));

jest.mock("../../utils", () => ({ isDev: () => false }));

/** Flush pending microtasks and one macrotask cycle. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

describe("MainSshApprovalWindowService", () => {
  const userId = "user-1" as UserId;
  const request: SshApprovalRequest = {
    cipherName: "My Key",
    application: "ssh",
    isAgentForwarding: false,
    namespace: "",
  };

  let handlers: Map<string, Handler>;
  let status$: BehaviorSubject<AuthenticationStatus>;
  let miniUnlockService: ReturnType<typeof mock<MainMiniUnlockService>>;
  let service: MainSshApprovalWindowService;

  const win = () => windows[windows.length - 1];
  const fromWindow = () => ({ sender: win().webContents });
  const respond = (accepted: boolean) =>
    handlers.get(SSH_APPROVAL_IPC_CHANNELS.RESPOND)!(fromWindow(), accepted);

  beforeEach(() => {
    jest.clearAllMocks();
    windows = [];
    handlers = new Map();

    (BrowserWindow as unknown as jest.Mock).mockImplementation(() => {
      const w = new FakeWindow();
      windows.push(w);
      return w;
    });
    (ipcMain.handle as jest.Mock).mockImplementation((channel: string, h: Handler) =>
      handlers.set(channel, h),
    );

    status$ = new BehaviorSubject<AuthenticationStatus>(AuthenticationStatus.Unlocked);
    const accountService = mock<AccountService>();
    accountService.activeAccount$ = of({ id: userId }) as never;
    const authService = mock<AuthService>();
    authService.activeAccountStatus$ = status$;
    const desktopSettingsService = mock<DesktopSettingsService>();
    desktopSettingsService.preventScreenshots$ = of(false);
    const i18nService = mock<I18nService>();
    i18nService.t.mockImplementation((key: string) => key);

    miniUnlockService = mock<MainMiniUnlockService>();
    miniUnlockService.strings.mockReturnValue({ locked: "yourVaultIsLockedV2" } as never);
    miniUnlockService.options.mockResolvedValue({
      masterPassword: true,
      pin: false,
      biometrics: true,
    });

    // Full app window torn down (running in the background).
    const windowMain = mock<WindowMain>();
    windowMain.win = null as never;

    service = new MainSshApprovalWindowService(
      mock<LogService>(),
      windowMain,
      accountService,
      authService,
      miniUnlockService,
      desktopSettingsService,
      i18nService,
    );
    service.init();
  });

  it("does not open a window when already unlocked", async () => {
    expect(await service.session((p) => p.unlock())).toBe(true);
    expect(windows).toHaveLength(0);
  });

  it("resolves with the user's answer and closes the window", async () => {
    const result = service.session((p) => p.approve(request));
    await flush();

    expect(windows).toHaveLength(1);
    const state = await handlers.get(SSH_APPROVAL_IPC_CHANNELS.GET_STATE)!(fromWindow());
    expect(state).toEqual(
      expect.objectContaining({
        mode: SshApprovalMode.Approve,
        request,
        strings: expect.objectContaining({ action: "sshActionLogin" }),
      }),
    );

    await respond(true);

    expect(await result).toBe(true);
    expect(win().close).toHaveBeenCalled();
  });

  it("rejects IPC from any other sender", async () => {
    const result = service.session((p) => p.approve(request));
    await flush();

    expect(() => handlers.get(SSH_APPROVAL_IPC_CHANNELS.RESPOND)!({ sender: {} }, true)).toThrow();

    await respond(false);
    expect(await result).toBe(false);
  });

  it("denies when the window is closed", async () => {
    const result = service.session((p) => p.approve(request));
    await flush();

    win().close();

    expect(await result).toBe(false);
  });

  it("unlocks in the window, then asks for approval in the same window", async () => {
    status$.next(AuthenticationStatus.Locked);
    miniUnlockService.unlock.mockImplementation(async () => {
      status$.next(AuthenticationStatus.Unlocked);
      return MiniUnlockResult.Success;
    });

    const result = service.session(async (p) => (await p.unlock()) && p.approve(request));
    await flush();

    const state = await handlers.get(SSH_APPROVAL_IPC_CHANNELS.GET_STATE)!(fromWindow());
    expect(state).toEqual(expect.objectContaining({ mode: SshApprovalMode.Unlock }));

    expect(
      await handlers.get(SSH_APPROVAL_IPC_CHANNELS.UNLOCK)!(
        fromWindow(),
        MiniUnlockMethod.MasterPassword,
        "hunter2",
      ),
    ).toBe(MiniUnlockResult.Success);
    expect(miniUnlockService.unlock).toHaveBeenCalledWith(
      userId,
      MiniUnlockMethod.MasterPassword,
      "hunter2",
    );
    await flush();

    expect(win().webContents.send).toHaveBeenCalledWith(
      SSH_APPROVAL_IPC_CHANNELS.STATE_CHANGED,
      expect.objectContaining({ mode: SshApprovalMode.Approve, request }),
    );

    await respond(true);
    expect(await result).toBe(true);
    expect(windows).toHaveLength(1);
  });

  it("gives up the unlock prompt after too many wrong PINs", async () => {
    status$.next(AuthenticationStatus.Locked);
    miniUnlockService.unlock.mockResolvedValue(MiniUnlockResult.TooManyAttempts);

    const result = service.session((p) => p.unlock());
    await flush();
    await handlers.get(SSH_APPROVAL_IPC_CHANNELS.UNLOCK)!(fromWindow(), MiniUnlockMethod.Pin, "0");

    expect(await result).toBe(false);
  });

  it("shows one session at a time", async () => {
    const first = service.session((p) => p.approve(request));
    const second = service.session((p) => p.approve({ ...request, cipherName: "Other" }));
    await flush();

    expect(windows).toHaveLength(1);
    await respond(true);
    expect(await first).toBe(true);
    await flush();

    expect(windows).toHaveLength(2);
    const state = await handlers.get(SSH_APPROVAL_IPC_CHANNELS.GET_STATE)!(fromWindow());
    expect(state).toEqual(
      expect.objectContaining({ request: expect.objectContaining({ cipherName: "Other" }) }),
    );
    await respond(false);
    expect(await second).toBe(false);
  });

  it("denies once the session times out", async () => {
    jest.useFakeTimers();
    try {
      const result = service.session((p) => p.approve(request));
      await jest.advanceTimersByTimeAsync(60_000);

      expect(await result).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

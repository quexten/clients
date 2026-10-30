import { BrowserWindow, globalShortcut, ipcMain } from "electron";
import { mock } from "jest-mock-extended";
import { BehaviorSubject, of } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { LogService } from "@bitwarden/logging";
import { UserId } from "@bitwarden/user-core";

import { MainMiniUnlockService } from "../../key-management/unlock/main-mini-unlock.service";
import { WindowMain } from "../../main/window.main";
import { MAGNIFY_IPC_CHANNELS } from "../models/ipc-channels";
import { MagnifyAuthStatus, MagnifyCommand } from "../models/magnify-commands";
import { MiniUnlockMethod, MiniUnlockResult } from "../models/mini-unlock";

import { MainDesktopMagnifyService } from "./main-desktop-magnify.service";

type Handler = (...args: unknown[]) => unknown;

class FakeWindow {
  handlers = new Map<string, Handler>();
  webContents = { on: jest.fn() };
  loadFile = jest.fn().mockResolvedValue(undefined);
  show = jest.fn();
  focus = jest.fn();
  setPosition = jest.fn();
  isDestroyed = () => false;
  close = jest.fn();
  on(event: string, handler: Handler) {
    this.handlers.set(event, handler);
  }
}

jest.mock("electron", () => ({
  app: { show: jest.fn(), focus: jest.fn(), hide: jest.fn() },
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  globalShortcut: { isRegistered: jest.fn(), register: jest.fn(), unregister: jest.fn() },
  screen: {
    getCursorScreenPoint: jest.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: jest.fn(() => ({
      bounds: { x: 0, y: 0, width: 1600, height: 1000 },
    })),
  },
  BrowserWindow: jest.fn(),
}));

describe("MainDesktopMagnifyService", () => {
  const userId = "user-1" as UserId;

  let handlers: Map<string, Handler>;
  let listeners: Map<string, Handler>;
  let magnifyWindow: FakeWindow;
  let status$: BehaviorSubject<AuthenticationStatus>;
  let windowMain: ReturnType<typeof mock<WindowMain>>;
  let miniUnlockService: ReturnType<typeof mock<MainMiniUnlockService>>;

  const fromMagnify = () => ({ sender: magnifyWindow.webContents });

  /** Opens Magnify the way the global shortcut does. */
  async function openMagnify(): Promise<void> {
    (globalShortcut.isRegistered as jest.Mock).mockReturnValue(false);
    listeners.get(MAGNIFY_IPC_CHANNELS.TOGGLE)!({}, true);
    await Promise.resolve();
    const trigger = (globalShortcut.register as jest.Mock).mock.calls[0][1] as () => Promise<void>;
    await trigger();
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    handlers = new Map();
    listeners = new Map();
    magnifyWindow = new FakeWindow();

    (BrowserWindow as unknown as jest.Mock).mockImplementation(() => magnifyWindow);
    (ipcMain.handle as jest.Mock).mockImplementation((channel: string, h: Handler) =>
      handlers.set(channel, h),
    );
    (ipcMain.on as jest.Mock).mockImplementation((channel: string, h: Handler) =>
      listeners.set(channel, h),
    );

    status$ = new BehaviorSubject<AuthenticationStatus>(AuthenticationStatus.Locked);
    const accountService = mock<AccountService>();
    accountService.activeAccount$ = of({ id: userId }) as never;
    const authService = mock<AuthService>();
    authService.activeAccountStatus$ = status$;
    windowMain = mock<WindowMain>();
    windowMain.win = mock<BrowserWindow>() as never;
    miniUnlockService = mock<MainMiniUnlockService>();

    const service = new MainDesktopMagnifyService(
      mock<LogService>(),
      windowMain,
      accountService,
      authService,
      miniUnlockService,
    );
    await service.init();
  });

  it("answers auth status in main without surfacing the full app", async () => {
    const response = await handlers.get(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND)!(
      {},
      { type: MagnifyCommand.GetAuthStatus },
    );

    expect(response).toEqual({
      type: MagnifyCommand.GetAuthStatus,
      status: MagnifyAuthStatus.Locked,
    });
    expect(windowMain.ensureRenderer).not.toHaveBeenCalled();
  });

  it("unlocks the active account from the Magnify window", async () => {
    await openMagnify();
    miniUnlockService.unlock.mockResolvedValue(MiniUnlockResult.Success);

    const result = await handlers.get(MAGNIFY_IPC_CHANNELS.MAGNIFY_UNLOCK)!(
      fromMagnify(),
      MiniUnlockMethod.Pin,
      "1234",
    );

    expect(result).toBe(MiniUnlockResult.Success);
    expect(miniUnlockService.unlock).toHaveBeenCalledWith(userId, MiniUnlockMethod.Pin, "1234");
  });

  it("rejects unlock requests from any other sender", async () => {
    await openMagnify();

    expect(() =>
      handlers.get(MAGNIFY_IPC_CHANNELS.MAGNIFY_UNLOCK)!({ sender: {} }, MiniUnlockMethod.Pin, "1"),
    ).toThrow();
    expect(miniUnlockService.unlock).not.toHaveBeenCalled();
  });

  it("stays open when the biometric prompt takes focus", async () => {
    await openMagnify();
    miniUnlockService.unlock.mockImplementation(async () => {
      magnifyWindow.handlers.get("blur")!();
      return MiniUnlockResult.Success;
    });

    await handlers.get(MAGNIFY_IPC_CHANNELS.MAGNIFY_UNLOCK)!(
      fromMagnify(),
      MiniUnlockMethod.Biometrics,
    );

    expect(magnifyWindow.close).not.toHaveBeenCalled();
  });

  it("still closes on blur when not unlocking", async () => {
    await openMagnify();

    magnifyWindow.handlers.get("blur")!();

    expect(magnifyWindow.close).toHaveBeenCalled();
  });
});

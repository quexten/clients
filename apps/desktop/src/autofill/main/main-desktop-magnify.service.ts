import * as path from "path";

import { app, ipcMain, globalShortcut, BrowserWindow, screen } from "electron";
import { firstValueFrom } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { KeyService } from "@bitwarden/key-management";
import { LogService } from "@bitwarden/logging";

import { WindowMain } from "../../main/window.main";
import { MAGNIFY_IPC_CHANNELS } from "../models/ipc-channels";
import {
  MagnifyCommand,
  MagnifyCommandRequest,
  MagnifyCommandResponse,
} from "../models/magnify-commands";

export class MainDesktopMagnifyService {
  private MAGNIFY_KEYBOARD_SHORTCUT = "CommandOrControl+Shift+Space";

  // allows only a single instance of the window to be opened regardless of how many times the hotkey to open it is pressed.
  private magnifyWindow: BrowserWindow | null = null;

  // Set by the BW render process once its magnify command listener is registered. It is cleared
  // when the renderer is recreated so commands wait for the freshly booted renderer instead of
  // racing it and being silently dropped.
  private magnifyListenerReady = false;

  constructor(
    private logService: LogService,
    private windowMain: WindowMain,
    private accountService: AccountService,
    private keyService: KeyService,
  ) {}

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

    // Magnify render process -> main process -> BW render process ->
    // main process -> Magnify render process
    ipcMain.handle(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND, (event, command) =>
      this.commandHandler(event, command),
    );

    // BW render process -> main process: its magnify command listener is registered.
    ipcMain.on(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_LISTENER_READY, () => {
      this.magnifyListenerReady = true;
    });

    // Magnify render process -> main process: resize the magnify window
    ipcMain.on(MAGNIFY_IPC_CHANNELS.MAGNIFY_RESIZE, (_event, height: number) => {
      if (this.magnifyWindow != null && !this.magnifyWindow.isDestroyed()) {
        this.magnifyWindow.setSize(640, height, false);
      }
    });

    // Magnify render process -> main process: focus the main BW window and close Magnify
    ipcMain.on(MAGNIFY_IPC_CHANNELS.MAGNIFY_FOCUS_BITWARDEN, () => {
      this.magnifyWindow?.close();
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
    ipcMain.removeAllListeners(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_LISTENER_READY);
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

    // close the window when ESC pressed
    win.webContents.on("before-input-event", (_event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        this.dismissMagnify();
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
    Receives a command from the magnify render process, relays it
    to the BW render process, waits for the response, and returns it
    back to the magnify render process via the resolved invoke Promise.
  */
  private async commandHandler(
    _event: Electron.IpcMainInvokeEvent,
    command: MagnifyCommandRequest,
  ): Promise<MagnifyCommandResponse> {
    // The BW renderer may have been torn down for background operation. Recreate it and wait for
    // its magnify command listener to be registered before relaying, otherwise the relay would be
    // silently dropped (or throw when the window is gone) and the invoke would hang. Surface the
    // window only when the vault is locked, so the user can unlock it.
    const previousWin = this.windowMain.win;
    await this.windowMain.ensureRenderer(await this.shouldShowRenderer());
    if (this.windowMain.win !== previousWin) {
      this.magnifyListenerReady = false;
    }
    await this.waitForMagnifyListenerReady();

    return new Promise<MagnifyCommandResponse>((resolve, reject) => {
      const onResponse = (
        _responseEvent: Electron.IpcMainEvent,
        response: MagnifyCommandResponse,
      ) => {
        ipcMain.removeListener(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RELAY_ERROR, onError);
        resolve(response);
      };

      const onError = (_responseEvent: Electron.IpcMainEvent, errorMessage: string) => {
        ipcMain.removeListener(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RESPONSE, onResponse);
        reject(new Error(errorMessage));
      };

      ipcMain.once(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RESPONSE, onResponse);
      ipcMain.once(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RELAY_ERROR, onError);

      this.windowMain.win.webContents.send(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RELAY, command);
    }).then((response) => {
      if (command.type === MagnifyCommand.ViewInBitwarden) {
        this.magnifyWindow?.close();
        this.windowMain.win.show();
      }
      return response;
    });
  }

  /*
    Resolves once the BW renderer has registered its magnify command listener. Polling avoids
    tracking per-window readiness while still guarding against a command arriving before the
    renderer finishes booting.
  */
  private waitForMagnifyListenerReady(): Promise<void> {
    if (this.magnifyListenerReady) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 10_000;
      const poll = () => {
        if (this.magnifyListenerReady) {
          resolve();
          return;
        }

        if (Date.now() >= deadline) {
          reject(new Error("Timed out waiting for the Bitwarden renderer to become ready."));
          return;
        }

        setTimeout(poll, 100);
      };
      poll();
    });
  }

  /*
    Whether the main window must be surfaced for the current command. It is shown when the active
    account is locked so the user can unlock; when there is no active account, or the vault is
    already unlocked, the renderer can be (re)created hidden and magnify stays in the background.
  */
  private async shouldShowRenderer(): Promise<boolean> {
    const activeAccount = await firstValueFrom(this.accountService.activeAccount$);
    if (activeAccount == null) {
      return false;
    }

    const userKey = await firstValueFrom(this.keyService.userKey$(activeAccount.id));
    return userKey == null;
  }
}

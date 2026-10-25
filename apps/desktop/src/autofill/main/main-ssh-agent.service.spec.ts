import { Notification } from "electron";
import { mock } from "jest-mock-extended";
import { BehaviorSubject, of } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { sshagent } from "@bitwarden/desktop-napi";

import { WindowMain } from "../../main/window.main";
import { DesktopSettingsService } from "../../platform/services/desktop-settings.service";
import { SshAgentPromptType } from "../models/ssh-agent-setting";

import { MainSshAgentService } from "./main-ssh-agent.service";
import {
  MainSshApprovalWindowService,
  SshApprovalPrompt,
} from "./main-ssh-approval-window.service";

jest.mock("electron", () => ({
  Notification: jest.fn(),
}));

jest.mock("@bitwarden/desktop-napi", () => ({
  sshagent: {
    SshAgentState: {
      serve: jest.fn(),
    },
  },
}));

type IpcHandler = (...args: unknown[]) => unknown;

function makeSshCipher(id: string, name: string, privateKey: string): CipherView {
  return {
    id,
    name,
    type: CipherType.SshKey,
    isDeleted: false,
    isArchived: false,
    sshKey: { privateKey },
  } as unknown as CipherView;
}

/** Flush pending microtasks and one macrotask cycle so async RxJS pipelines settle. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

describe("MainSshAgentService", () => {
  const userId = "user-1" as UserId;

  let logService: ReturnType<typeof mock<LogService>>;
  let cipherService: ReturnType<typeof mock<CipherService>>;
  let authService: ReturnType<typeof mock<AuthService>>;
  let accountService: ReturnType<typeof mock<AccountService>>;
  let desktopSettingsService: ReturnType<typeof mock<DesktopSettingsService>>;
  let i18nService: ReturnType<typeof mock<I18nService>>;
  let windowMain: ReturnType<typeof mock<WindowMain>>;
  let approvalWindow: ReturnType<typeof mock<MainSshApprovalWindowService>>;
  let prompt: { unlock: jest.Mock; approve: jest.Mock };

  let activeAccount$: BehaviorSubject<unknown>;
  let activeAccountStatus$: BehaviorSubject<AuthenticationStatus>;
  let sshAgentEnabled$: BehaviorSubject<boolean>;
  let sshAgentPromptBehavior$: BehaviorSubject<SshAgentPromptType>;

  let agentState: { isRunning: jest.Mock; replace: jest.Mock; stop: jest.Mock };
  let shownNotification: { on: jest.Mock; show: jest.Mock };
  let capturedSignCb: (err: Error | null, data: sshagent.SignRequestData) => Promise<boolean>;
  let capturedListCb: (err: Error | null) => Promise<boolean>;

  let service: MainSshAgentService;

  beforeEach(() => {
    jest.clearAllMocks();

    logService = mock<LogService>();
    cipherService = mock<CipherService>();
    authService = mock<AuthService>();
    accountService = mock<AccountService>();
    desktopSettingsService = mock<DesktopSettingsService>();
    i18nService = mock<I18nService>();
    windowMain = mock<WindowMain>();
    approvalWindow = mock<MainSshApprovalWindowService>();
    prompt = {
      unlock: jest.fn().mockResolvedValue(true),
      approve: jest.fn().mockResolvedValue(true),
    };
    approvalWindow.session.mockImplementation((fn) =>
      (fn as (p: SshApprovalPrompt) => Promise<unknown>)(prompt),
    );

    activeAccount$ = new BehaviorSubject<unknown>({ id: userId });
    activeAccountStatus$ = new BehaviorSubject<AuthenticationStatus>(AuthenticationStatus.Unlocked);
    sshAgentEnabled$ = new BehaviorSubject<boolean>(true);
    sshAgentPromptBehavior$ = new BehaviorSubject<SshAgentPromptType>(SshAgentPromptType.Always);

    accountService.activeAccount$ = activeAccount$ as never;
    authService.activeAccountStatus$ = activeAccountStatus$;
    authService.authStatusFor$.mockReturnValue(of(AuthenticationStatus.Unlocked));
    desktopSettingsService.sshAgentEnabled$ = sshAgentEnabled$;
    desktopSettingsService.sshAgentPromptBehavior$ = sshAgentPromptBehavior$;
    cipherService.cipherViews$.mockReturnValue(of([]));
    cipherService.getAllDecrypted.mockResolvedValue([]);
    i18nService.t.mockImplementation((key: string, ...args: string[]) => {
      if (key === "unknownApplication") {
        return "Unknown application";
      }
      if (key === "sshAgentApprovalNotificationTitle") {
        return "SSH key request";
      }
      if (key === "sshAgentApprovalNotificationBody") {
        return `${args[0]} requests ${args[1]}`;
      }
      if (key === "close") {
        return "Close";
      }
      return key;
    });

    agentState = {
      isRunning: jest.fn().mockReturnValue(true),
      replace: jest.fn(),
      stop: jest.fn(),
    };
    shownNotification = { on: jest.fn(), show: jest.fn() };

    (Notification as unknown as jest.Mock).mockImplementation(() => shownNotification);
    (sshagent.SshAgentState.serve as jest.Mock).mockImplementation(
      (sign: IpcHandler, list: IpcHandler) => {
        capturedSignCb = sign as (
          err: Error | null,
          data: sshagent.SignRequestData,
        ) => Promise<boolean>;
        capturedListCb = list as (err: Error | null) => Promise<boolean>;
        return Promise.resolve(agentState);
      },
    );

    service = new MainSshAgentService(
      logService,
      cipherService,
      authService,
      accountService,
      desktopSettingsService,
      i18nService,
      windowMain,
      approvalWindow,
    );
  });

  describe("key provisioning", () => {
    it("starts the agent and pushes SSH-key ciphers when enabled and unlocked", async () => {
      cipherService.cipherViews$.mockReturnValue(
        of([makeSshCipher("c1", "Key 1", "pk-1"), makeSshCipher("c2", "Key 2", "pk-2")]),
      );

      service.init();
      await flush();

      expect(sshagent.SshAgentState.serve).toHaveBeenCalled();
      expect(agentState.replace).toHaveBeenCalledWith([
        { name: "Key 1", privateKey: "pk-1", cipherId: "c1" },
        { name: "Key 2", privateKey: "pk-2", cipherId: "c2" },
      ]);
    });

    it("stops the agent when the ssh agent is disabled", async () => {
      service.init();
      await flush();

      sshAgentEnabled$.next(false);
      await flush();

      expect(agentState.stop).toHaveBeenCalled();
    });

    it("excludes non-SSH-key, deleted, and archived ciphers", async () => {
      const ciphers = [
        makeSshCipher("c1", "Key 1", "pk-1"),
        { id: "c2", name: "Login", type: CipherType.Login, isDeleted: false, isArchived: false },
        { ...makeSshCipher("c3", "Deleted", "pk-3"), isDeleted: true },
        { ...makeSshCipher("c4", "Archived", "pk-4"), isArchived: true },
      ] as unknown as CipherView[];

      cipherService.cipherViews$.mockReturnValue(of(ciphers));

      service.init();
      await flush();

      expect(agentState.replace).toHaveBeenCalledWith([
        { name: "Key 1", privateKey: "pk-1", cipherId: "c1" },
      ]);
    });
  });

  describe("requestSign", () => {
    const cipher = makeSshCipher("cipher-1", "My Key", "pk-1");

    function signData(overrides: Partial<sshagent.SignRequest> = {}): sshagent.SignRequestData {
      return {
        cipherId: "cipher-1",
        signRequest: {
          publicKey: { alg: "ssh-ed25519", blob: [] },
          processName: "ssh",
          isForwarding: false,
          namespace: "ssh",
          hostFingerprint: "SHA256:abc",
          ...overrides,
        },
      } as unknown as sshagent.SignRequestData;
    }

    beforeEach(async () => {
      cipherService.getAllDecrypted.mockResolvedValue([cipher]);
      cipherService.cipherViews$.mockReturnValue(of([cipher]));

      // Trigger `serve` so the sign/list callbacks are captured.
      service.init();
      await flush();
    });

    it("returns false when the ssh agent is disabled", async () => {
      sshAgentEnabled$.next(false);

      expect(await capturedSignCb(null, signData())).toBe(false);
    });

    it("returns false when the requested cipher is not in the active vault", async () => {
      cipherService.getAllDecrypted.mockResolvedValue([]);

      expect(await capturedSignCb(null, signData())).toBe(false);
      expect(logService.error).toHaveBeenCalled();
    });

    it("shows an OS notification for every sign request", async () => {
      sshAgentPromptBehavior$.next(SshAgentPromptType.Never);

      await capturedSignCb(null, signData());

      expect(Notification).toHaveBeenCalledWith({
        title: "SSH key request",
        body: "ssh requests My Key",
        closeButtonText: "Close",
      });
      expect(shownNotification.show).toHaveBeenCalled();
    });

    it("approves without prompting when the prompt behavior is Never", async () => {
      sshAgentPromptBehavior$.next(SshAgentPromptType.Never);

      expect(await capturedSignCb(null, signData())).toBe(true);
      expect(prompt.approve).not.toHaveBeenCalled();
    });

    it("asks the approval window when Always", async () => {
      sshAgentPromptBehavior$.next(SshAgentPromptType.Always);

      expect(await capturedSignCb(null, signData())).toBe(true);
      expect(prompt.approve).toHaveBeenCalledWith({
        cipherName: "My Key",
        application: "ssh",
        isAgentForwarding: false,
        namespace: "ssh",
      });
    });

    it("resolves false when the user denies", async () => {
      sshAgentPromptBehavior$.next(SshAgentPromptType.Always);
      prompt.approve.mockResolvedValue(false);

      expect(await capturedSignCb(null, signData())).toBe(false);
    });

    it("resolves false without decrypting when unlock is not completed", async () => {
      prompt.unlock.mockResolvedValue(false);

      expect(await capturedSignCb(null, signData())).toBe(false);
      expect(cipherService.getAllDecrypted).not.toHaveBeenCalled();
      expect(prompt.approve).not.toHaveBeenCalled();
    });

    it("does not open a session when the ssh agent is disabled", async () => {
      sshAgentEnabled$.next(false);

      await capturedSignCb(null, signData());

      expect(approvalWindow.session).not.toHaveBeenCalled();
    });

    describe("RememberUntilLock", () => {
      beforeEach(() => {
        sshAgentPromptBehavior$.next(SshAgentPromptType.RememberUntilLock);
      });

      it("prompts on the first request and then approves the remembered host", async () => {
        expect(await capturedSignCb(null, signData())).toBe(true);
        expect(prompt.approve).toHaveBeenCalledTimes(1);

        expect(await capturedSignCb(null, signData())).toBe(true);
        expect(prompt.approve).toHaveBeenCalledTimes(1);
      });

      it("does not remember a denied host", async () => {
        prompt.approve.mockResolvedValue(false);
        await capturedSignCb(null, signData());
        await capturedSignCb(null, signData());

        expect(prompt.approve).toHaveBeenCalledTimes(2);
      });

      it("prompts again for a different host", async () => {
        await capturedSignCb(null, signData());
        await capturedSignCb(null, signData({ hostFingerprint: "SHA256:def" }));

        expect(prompt.approve).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("requestListKeys", () => {
    beforeEach(async () => {
      cipherService.getAllDecrypted.mockResolvedValue([makeSshCipher("c1", "Key", "pk")]);

      service.init();
      await flush();
    });

    it("replaces the agent keys with the decrypted SSH ciphers", async () => {
      expect(await capturedListCb(null)).toBe(true);

      expect(agentState.replace).toHaveBeenCalledWith([
        { name: "Key", privateKey: "pk", cipherId: "c1" },
      ]);
    });

    it("returns false when unlock is not completed", async () => {
      prompt.unlock.mockResolvedValue(false);

      expect(await capturedListCb(null)).toBe(false);
    });
  });

  describe("authorization reset", () => {
    const cipher = makeSshCipher("cipher-1", "My Key", "pk-1");

    function signData(): sshagent.SignRequestData {
      return {
        cipherId: "cipher-1",
        signRequest: {
          publicKey: { alg: "ssh-ed25519", blob: [] },
          processName: "ssh",
          isForwarding: false,
          namespace: "ssh",
          hostFingerprint: "SHA256:abc",
        },
      } as unknown as sshagent.SignRequestData;
    }

    beforeEach(async () => {
      cipherService.getAllDecrypted.mockResolvedValue([cipher]);
      cipherService.cipherViews$.mockReturnValue(of([cipher]));
      sshAgentPromptBehavior$.next(SshAgentPromptType.RememberUntilLock);

      service.init();
      await flush();
    });

    it("forgets remembered hosts when the vault locks", async () => {
      await capturedSignCb(null, signData());
      expect(prompt.approve).toHaveBeenCalledTimes(1);

      activeAccountStatus$.next(AuthenticationStatus.Locked);
      activeAccountStatus$.next(AuthenticationStatus.Unlocked);
      await flush();

      await capturedSignCb(null, signData());
      expect(prompt.approve).toHaveBeenCalledTimes(2);
    });
  });
});

import { mock } from "jest-mock-extended";
import { of } from "rxjs";

import { UserDecryptionOptionsServiceAbstraction } from "@bitwarden/auth/common";
import { PinServiceAbstraction } from "@bitwarden/common/key-management/pin/pin.service.abstraction";
import { MessageSender } from "@bitwarden/common/platform/messaging";
import {
  BiometricsService,
  BiometricsStatus,
  BiometricStateService,
} from "@bitwarden/key-management";
import { LogService } from "@bitwarden/logging";
import { UnlockService } from "@bitwarden/unlock";
import { UserId } from "@bitwarden/user-core";

import { MiniUnlockMethod, MiniUnlockResult } from "../../autofill/models/ssh-approval";

import { MainMiniUnlockService } from "./main-mini-unlock.service";

describe("MainMiniUnlockService", () => {
  const userId = "user-1" as UserId;

  const unlockService = mock<UnlockService>();
  const biometricsService = mock<BiometricsService>();
  const biometricStateService = mock<BiometricStateService>();
  const userDecryptionOptionsService = mock<UserDecryptionOptionsServiceAbstraction>();
  const pinService = mock<PinServiceAbstraction>();
  const messagingService = mock<MessageSender>();

  let service: MainMiniUnlockService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new MainMiniUnlockService(
      unlockService,
      biometricsService,
      biometricStateService,
      userDecryptionOptionsService,
      pinService,
      messagingService,
      mock<LogService>(),
    );
  });

  describe("options", () => {
    it("reports each method the user can use", async () => {
      biometricsService.getBiometricsStatusForUser.mockResolvedValue(BiometricsStatus.Available);
      userDecryptionOptionsService.hasMasterPasswordById$.mockReturnValue(of(true));
      pinService.isPinDecryptionAvailable.mockResolvedValue(true);

      expect(await service.options(userId)).toEqual({
        masterPassword: true,
        pin: true,
        biometrics: true,
      });
    });

    it("disables biometrics unless they are available", async () => {
      biometricsService.getBiometricsStatusForUser.mockResolvedValue(BiometricsStatus.UnlockNeeded);
      userDecryptionOptionsService.hasMasterPasswordById$.mockReturnValue(of(true));
      pinService.isPinDecryptionAvailable.mockResolvedValue(false);

      expect(await service.options(userId)).toEqual({
        masterPassword: true,
        pin: false,
        biometrics: false,
      });
    });
  });

  describe("master password", () => {
    it("unlocks and resets the cancelled biometric prompt", async () => {
      expect(await service.unlock(userId, MiniUnlockMethod.MasterPassword, "hunter2")).toBe(
        MiniUnlockResult.Success,
      );
      expect(unlockService.unlockWithMasterPassword).toHaveBeenCalledWith(userId, "hunter2");
      expect(biometricStateService.resetUserPromptCancelled).toHaveBeenCalledWith(userId);
    });

    it("reports a wrong password as invalid", async () => {
      unlockService.unlockWithMasterPassword.mockRejectedValue(new Error("bad password"));

      expect(await service.unlock(userId, MiniUnlockMethod.MasterPassword, "wrong")).toBe(
        MiniUnlockResult.Invalid,
      );
    });

    it("rejects an empty password without calling unlock", async () => {
      expect(await service.unlock(userId, MiniUnlockMethod.MasterPassword, "")).toBe(
        MiniUnlockResult.Invalid,
      );
      expect(unlockService.unlockWithMasterPassword).not.toHaveBeenCalled();
    });
  });

  describe("pin", () => {
    it("unlocks with the PIN", async () => {
      expect(await service.unlock(userId, MiniUnlockMethod.Pin, "1234")).toBe(
        MiniUnlockResult.Success,
      );
      expect(unlockService.unlockWithPin).toHaveBeenCalledWith(userId, "1234");
    });

    it("logs out after five wrong PINs", async () => {
      unlockService.unlockWithPin.mockRejectedValue(new Error("bad pin"));

      for (let i = 0; i < 4; i++) {
        expect(await service.unlock(userId, MiniUnlockMethod.Pin, "0000")).toBe(
          MiniUnlockResult.Invalid,
        );
      }
      expect(messagingService.send).not.toHaveBeenCalled();

      expect(await service.unlock(userId, MiniUnlockMethod.Pin, "0000")).toBe(
        MiniUnlockResult.TooManyAttempts,
      );
      expect(messagingService.send).toHaveBeenCalledWith("logout", { userId });
    });

    it("resets the attempt count after a successful unlock", async () => {
      unlockService.unlockWithPin.mockRejectedValue(new Error("bad pin"));
      for (let i = 0; i < 4; i++) {
        await service.unlock(userId, MiniUnlockMethod.Pin, "0000");
      }

      unlockService.unlockWithPin.mockResolvedValueOnce();
      await service.unlock(userId, MiniUnlockMethod.Pin, "1234");

      expect(await service.unlock(userId, MiniUnlockMethod.Pin, "0000")).toBe(
        MiniUnlockResult.Invalid,
      );
      expect(messagingService.send).not.toHaveBeenCalled();
    });
  });

  describe("biometrics", () => {
    it("marks the prompt cancelled before prompting, then unlocks", async () => {
      expect(await service.unlock(userId, MiniUnlockMethod.Biometrics)).toBe(
        MiniUnlockResult.Success,
      );

      const cancelledOrder =
        biometricStateService.setUserPromptCancelled.mock.invocationCallOrder[0];
      const unlockOrder = unlockService.unlockWithBiometrics.mock.invocationCallOrder[0];
      expect(cancelledOrder).toBeLessThan(unlockOrder);
      expect(biometricStateService.resetUserPromptCancelled).toHaveBeenCalledWith(userId);
    });

    it("reports a dismissed prompt as cancelled", async () => {
      unlockService.unlockWithBiometrics.mockRejectedValue(new Error("cancelled"));

      expect(await service.unlock(userId, MiniUnlockMethod.Biometrics)).toBe(
        MiniUnlockResult.Cancelled,
      );
      expect(biometricStateService.resetUserPromptCancelled).not.toHaveBeenCalled();
    });
  });
});

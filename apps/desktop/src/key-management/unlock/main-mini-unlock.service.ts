import { firstValueFrom } from "rxjs";

import { UserDecryptionOptionsServiceAbstraction } from "@bitwarden/auth/common";
import { PinServiceAbstraction } from "@bitwarden/common/key-management/pin/pin.service.abstraction";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { MessageSender } from "@bitwarden/common/platform/messaging";
import {
  BiometricsService,
  BiometricsStatus,
  BiometricStateService,
} from "@bitwarden/key-management";
import { LogService } from "@bitwarden/logging";
import { UnlockService } from "@bitwarden/unlock";
import { UserId } from "@bitwarden/user-core";

import {
  MiniUnlockMethod,
  MiniUnlockOptions,
  MiniUnlockResult,
  MiniUnlockStrings,
} from "../../autofill/models/mini-unlock";

// Matches the lock screen: too many wrong PINs logs the user out.
const MAX_PIN_ATTEMPTS = 5;

const BIOMETRICS_BUTTON_KEYS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "unlockWithTouchId",
  win32: "unlockWithWindowsHello",
  linux: "unlockWithPolkit",
};

/**
 * Unlocks the session owned by the main process on behalf of a mini window, without the full
 * renderer. Mirrors the lock screen's master password, PIN and biometrics paths.
 */
export class MainMiniUnlockService {
  private pinAttempts = new Map<UserId, number>();

  constructor(
    private readonly unlockService: UnlockService,
    private readonly biometricsService: BiometricsService,
    private readonly biometricStateService: BiometricStateService,
    private readonly userDecryptionOptionsService: UserDecryptionOptionsServiceAbstraction,
    private readonly pinService: PinServiceAbstraction,
    private readonly messagingService: MessageSender,
    private readonly i18nService: I18nService,
    private readonly logService: LogService,
  ) {}

  /** Localized strings for the mini unlock. `unlockRequired` is left empty for the host to set. */
  strings(): MiniUnlockStrings {
    const t = (key: string) => this.i18nService.t(key);
    return {
      locked: t("yourVaultIsLockedV2"),
      unlockRequired: "",
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

  /** Unlock methods available to the user, as the desktop lock screen computes them. */
  async options(userId: UserId): Promise<MiniUnlockOptions> {
    const [biometricsStatus, masterPassword, pin] = await Promise.all([
      this.biometricsService.getBiometricsStatusForUser(userId),
      firstValueFrom(this.userDecryptionOptionsService.hasMasterPasswordById$(userId)),
      this.pinService.isPinDecryptionAvailable(userId),
    ]);

    return {
      masterPassword,
      pin,
      biometrics: biometricsStatus === BiometricsStatus.Available,
    };
  }

  async unlock(
    userId: UserId,
    method: MiniUnlockMethod,
    secret?: string,
  ): Promise<MiniUnlockResult> {
    switch (method) {
      case MiniUnlockMethod.MasterPassword:
        return this.withPassword(userId, secret);
      case MiniUnlockMethod.Pin:
        return this.withPin(userId, secret);
      case MiniUnlockMethod.Biometrics:
        return this.withBiometrics(userId);
      default:
        return MiniUnlockResult.Error;
    }
  }

  private async withPassword(userId: UserId, password?: string): Promise<MiniUnlockResult> {
    if (!password) {
      return MiniUnlockResult.Invalid;
    }

    try {
      await this.unlockService.unlockWithMasterPassword(userId, password);
    } catch {
      return MiniUnlockResult.Invalid;
    }

    return this.succeeded(userId);
  }

  private async withPin(userId: UserId, pin?: string): Promise<MiniUnlockResult> {
    if (!pin) {
      return MiniUnlockResult.Invalid;
    }

    try {
      await this.unlockService.unlockWithPin(userId, pin);
    } catch {
      return this.failedPin(userId);
    }

    return this.succeeded(userId);
  }

  private async withBiometrics(userId: UserId): Promise<MiniUnlockResult> {
    // Marks the prompt cancelled until unlock succeeds, so the lock screen does not auto-prompt
    // again behind this window.
    await this.biometricStateService.setUserPromptCancelled(userId);

    try {
      await this.unlockService.unlockWithBiometrics(userId);
    } catch (e) {
      this.logService.info("[MiniUnlock] Biometric unlock failed or was cancelled", e);
      return MiniUnlockResult.Cancelled;
    }

    return this.succeeded(userId);
  }

  private failedPin(userId: UserId): MiniUnlockResult {
    const attempts = (this.pinAttempts.get(userId) ?? 0) + 1;
    this.pinAttempts.set(userId, attempts);
    if (attempts < MAX_PIN_ATTEMPTS) {
      return MiniUnlockResult.Invalid;
    }

    this.pinAttempts.delete(userId);
    this.messagingService.send("logout", { userId });
    return MiniUnlockResult.TooManyAttempts;
  }

  private async succeeded(userId: UserId): Promise<MiniUnlockResult> {
    this.pinAttempts.delete(userId);
    await this.biometricStateService.resetUserPromptCancelled(userId);
    return MiniUnlockResult.Success;
  }
}

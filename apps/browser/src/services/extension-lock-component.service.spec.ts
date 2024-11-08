import { TestBed } from "@angular/core/testing";
import { mock, MockProxy } from "jest-mock-extended";
import { firstValueFrom, of } from "rxjs";

import { BiometricsDisableReason, UnlockOptions } from "@bitwarden/auth/angular";
import {
  PinServiceAbstraction,
  UserDecryptionOptionsServiceAbstraction,
} from "@bitwarden/auth/common";
import { VaultTimeoutSettingsService } from "@bitwarden/common/abstractions/vault-timeout/vault-timeout-settings.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { UserId } from "@bitwarden/common/types/guid";
import { KeyService, BiometricsService } from "@bitwarden/key-management";

import { BrowserRouterService } from "../platform/popup/services/browser-router.service";

import { ExtensionLockComponentService } from "./extension-lock-component.service";

describe("ExtensionLockComponentService", () => {
  let service: ExtensionLockComponentService;

  let userDecryptionOptionsService: MockProxy<UserDecryptionOptionsServiceAbstraction>;
  let platformUtilsService: MockProxy<PlatformUtilsService>;
  let biometricsService: MockProxy<BiometricsService>;
  let pinService: MockProxy<PinServiceAbstraction>;
  let vaultTimeoutSettingsService: MockProxy<VaultTimeoutSettingsService>;
  let keyService: MockProxy<KeyService>;
  let routerService: MockProxy<BrowserRouterService>;

  beforeEach(() => {
    userDecryptionOptionsService = mock<UserDecryptionOptionsServiceAbstraction>();
    platformUtilsService = mock<PlatformUtilsService>();
    biometricsService = mock<BiometricsService>();
    pinService = mock<PinServiceAbstraction>();
    vaultTimeoutSettingsService = mock<VaultTimeoutSettingsService>();
    keyService = mock<KeyService>();
    routerService = mock<BrowserRouterService>();

    TestBed.configureTestingModule({
      providers: [
        ExtensionLockComponentService,
        {
          provide: UserDecryptionOptionsServiceAbstraction,
          useValue: userDecryptionOptionsService,
        },
        {
          provide: PlatformUtilsService,
          useValue: platformUtilsService,
        },
        {
          provide: BiometricsService,
          useValue: biometricsService,
        },
        {
          provide: PinServiceAbstraction,
          useValue: pinService,
        },
        {
          provide: VaultTimeoutSettingsService,
          useValue: vaultTimeoutSettingsService,
        },
        {
          provide: KeyService,
          useValue: keyService,
        },
        {
          provide: BrowserRouterService,
          useValue: routerService,
        },
      ],
    });

    service = TestBed.inject(ExtensionLockComponentService);
  });

  it("instantiates", () => {
    expect(service).not.toBeFalsy();
  });

  describe("getPreviousUrl", () => {
    it("returns the previous URL", () => {
      routerService.getPreviousUrl.mockReturnValue("previousUrl");
      expect(service.getPreviousUrl()).toBe("previousUrl");
    });
  });

  describe("getBiometricsError", () => {
    it("returns a biometric error description when given a valid error type", () => {
      expect(
        service.getBiometricsError({
          message: "startDesktop",
        }),
      ).toBe("startDesktopDesc");
    });

    it("returns null when given an invalid error type", () => {
      expect(
        service.getBiometricsError({
          message: "invalidError",
        }),
      ).toBeNull();
    });

    it("returns null when given a null input", () => {
      expect(service.getBiometricsError(null)).toBeNull();
    });
  });

  describe("isWindowVisible", () => {
    it("throws an error", async () => {
      await expect(service.isWindowVisible()).rejects.toThrow("Method not implemented.");
    });
  });

  describe("getBiometricsUnlockBtnText", () => {
    it("returns the biometric unlock button text", () => {
      expect(service.getBiometricsUnlockBtnText()).toBe("unlockWithBiometrics");
    });
  });

  describe("getAvailableUnlockOptions$", () => {
    interface MockInputs {
      hasMasterPassword: boolean;
      osSupportsBiometric: boolean;
      biometricLockSet: boolean;
      hasBiometricEncryptedUserKeyStored: boolean;
      platformSupportsSecureStorage: boolean;
      pinDecryptionAvailable: boolean;
    }

    const table: [MockInputs, UnlockOptions][] = [
      [
        // MP + PIN + Biometrics available
        {
          hasMasterPassword: true,
          osSupportsBiometric: true,
          biometricLockSet: true,
          hasBiometricEncryptedUserKeyStored: true,
          platformSupportsSecureStorage: true,
          pinDecryptionAvailable: true,
        },
        {
          masterPassword: {
            enabled: true,
          },
          pin: {
            enabled: true,
          },
          biometrics: {
            enabled: true,
            disableReason: null,
          },
        },
      ],
      [
        // PIN + Biometrics available
        {
          hasMasterPassword: false,
          osSupportsBiometric: true,
          biometricLockSet: true,
          hasBiometricEncryptedUserKeyStored: true,
          platformSupportsSecureStorage: true,
          pinDecryptionAvailable: true,
        },
        {
          masterPassword: {
            enabled: false,
          },
          pin: {
            enabled: true,
          },
          biometrics: {
            enabled: true,
            disableReason: null,
          },
        },
      ],
      [
        // Biometrics available: user key stored with no secure storage
        {
          hasMasterPassword: false,
          osSupportsBiometric: true,
          biometricLockSet: true,
          hasBiometricEncryptedUserKeyStored: true,
          platformSupportsSecureStorage: false,
          pinDecryptionAvailable: false,
        },
        {
          masterPassword: {
            enabled: false,
          },
          pin: {
            enabled: false,
          },
          biometrics: {
            enabled: true,
            disableReason: null,
          },
        },
      ],
      [
        // Biometrics available: no user key stored with no secure storage
        {
          hasMasterPassword: false,
          osSupportsBiometric: true,
          biometricLockSet: true,
          hasBiometricEncryptedUserKeyStored: false,
          platformSupportsSecureStorage: false,
          pinDecryptionAvailable: false,
        },
        {
          masterPassword: {
            enabled: false,
          },
          pin: {
            enabled: false,
          },
          biometrics: {
            enabled: true,
            disableReason: null,
          },
        },
      ],
      [
        // Biometrics not available: biometric lock not set
        {
          hasMasterPassword: false,
          osSupportsBiometric: true,
          biometricLockSet: false,
          hasBiometricEncryptedUserKeyStored: true,
          platformSupportsSecureStorage: true,
          pinDecryptionAvailable: false,
        },
        {
          masterPassword: {
            enabled: false,
          },
          pin: {
            enabled: false,
          },
          biometrics: {
            enabled: false,
            disableReason: BiometricsDisableReason.EncryptedKeysUnavailable,
          },
        },
      ],
      [
        // Biometrics not available: user key not stored
        {
          hasMasterPassword: false,
          osSupportsBiometric: true,
          biometricLockSet: true,
          hasBiometricEncryptedUserKeyStored: false,
          platformSupportsSecureStorage: true,
          pinDecryptionAvailable: false,
        },
        {
          masterPassword: {
            enabled: false,
          },
          pin: {
            enabled: false,
          },
          biometrics: {
            enabled: false,
            disableReason: BiometricsDisableReason.EncryptedKeysUnavailable,
          },
        },
      ],
      [
        // Biometrics not available: OS doesn't support
        {
          hasMasterPassword: false,
          osSupportsBiometric: false,
          biometricLockSet: true,
          hasBiometricEncryptedUserKeyStored: true,
          platformSupportsSecureStorage: true,
          pinDecryptionAvailable: false,
        },
        {
          masterPassword: {
            enabled: false,
          },
          pin: {
            enabled: false,
          },
          biometrics: {
            enabled: false,
            disableReason: BiometricsDisableReason.NotSupportedOnOperatingSystem,
          },
        },
      ],
    ];

    test.each(table)("returns unlock options", async (mockInputs, expectedOutput) => {
      const userId = "userId" as UserId;
      const userDecryptionOptions = {
        hasMasterPassword: mockInputs.hasMasterPassword,
      };

      // MP
      userDecryptionOptionsService.userDecryptionOptionsById$.mockReturnValue(
        of(userDecryptionOptions),
      );

      // Biometrics
      biometricsService.supportsBiometric.mockResolvedValue(mockInputs.osSupportsBiometric);
      vaultTimeoutSettingsService.isBiometricLockSet.mockResolvedValue(mockInputs.biometricLockSet);
      keyService.hasUserKeyStored.mockResolvedValue(mockInputs.hasBiometricEncryptedUserKeyStored);
      platformUtilsService.supportsSecureStorage.mockReturnValue(
        mockInputs.platformSupportsSecureStorage,
      );

      //  PIN
      pinService.isPinDecryptionAvailable.mockResolvedValue(mockInputs.pinDecryptionAvailable);

      const unlockOptions = await firstValueFrom(service.getAvailableUnlockOptions$(userId));

      expect(unlockOptions).toEqual(expectedOutput);
    });
  });
});

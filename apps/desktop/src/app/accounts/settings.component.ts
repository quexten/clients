import { Component, OnDestroy, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { BehaviorSubject, Observable, Subject, firstValueFrom } from "rxjs";
import { concatMap, debounceTime, filter, map, switchMap, takeUntil, tap } from "rxjs/operators";

import { PinServiceAbstraction } from "@bitwarden/auth/common";
import { VaultTimeoutSettingsService } from "@bitwarden/common/abstractions/vault-timeout/vault-timeout-settings.service";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { PolicyType } from "@bitwarden/common/admin-console/enums";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { UserVerificationService as UserVerificationServiceAbstraction } from "@bitwarden/common/auth/abstractions/user-verification/user-verification.service.abstraction";
import { AutofillSettingsServiceAbstraction } from "@bitwarden/common/autofill/services/autofill-settings.service";
import { DomainSettingsService } from "@bitwarden/common/autofill/services/domain-settings.service";
import { DeviceType } from "@bitwarden/common/enums";
import { VaultTimeoutAction } from "@bitwarden/common/enums/vault-timeout-action.enum";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { KeySuffixOptions, ThemeType } from "@bitwarden/common/platform/enums";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { ThemeStateService } from "@bitwarden/common/platform/theming/theme-state.service";
import { UserId } from "@bitwarden/common/types/guid";
import {
  VaultTimeout,
  VaultTimeoutOption,
  VaultTimeoutStringType,
} from "@bitwarden/common/types/vault-timeout.type";
import { DialogService } from "@bitwarden/components";
import { KeyService, BiometricsService, BiometricStateService } from "@bitwarden/key-management";

import { SetPinComponent } from "../../auth/components/set-pin.component";
import { DesktopAutofillSettingsService } from "../../autofill/services/desktop-autofill-settings.service";
import { DesktopSettingsService } from "../../platform/services/desktop-settings.service";
import { NativeMessagingManifestService } from "../services/native-messaging-manifest.service";

@Component({
  selector: "app-settings",
  templateUrl: "settings.component.html",
})
// eslint-disable-next-line rxjs-angular/prefer-takeuntil
export class SettingsComponent implements OnInit, OnDestroy {
  // For use in template
  protected readonly VaultTimeoutAction = VaultTimeoutAction;

  showMinToTray = false;
  vaultTimeoutOptions: VaultTimeoutOption[] = [];
  localeOptions: any[];
  themeOptions: any[];
  clearClipboardOptions: any[];
  supportsBiometric: boolean;
  showAlwaysShowDock = false;
  requireEnableTray = false;
  showDuckDuckGoIntegrationOption = false;
  isWindows: boolean;
  isLinux: boolean;

  enableTrayText: string;
  enableTrayDescText: string;
  enableMinToTrayText: string;
  enableMinToTrayDescText: string;
  enableCloseToTrayText: string;
  enableCloseToTrayDescText: string;
  startToTrayText: string;
  startToTrayDescText: string;

  showSecurity = true;
  showAccountPreferences = true;
  showAppPreferences = true;

  currentUserEmail: string;
  currentUserId: UserId;

  availableVaultTimeoutActions$: Observable<VaultTimeoutAction[]>;
  vaultTimeoutPolicyCallout: Observable<{
    timeout: { hours: number; minutes: number };
    action: "lock" | "logOut";
  }>;
  previousVaultTimeout: VaultTimeout = null;

  userHasMasterPassword: boolean;
  userHasPinSet: boolean;

  form = this.formBuilder.group({
    // Security
    vaultTimeout: [null as VaultTimeout | null],
    vaultTimeoutAction: [VaultTimeoutAction.Lock],
    pin: [null as boolean | null],
    biometric: false,
    autoPromptBiometrics: false,
    requirePasswordOnStart: false,
    // Account Preferences
    clearClipboard: [null],
    minimizeOnCopyToClipboard: false,
    enableFavicons: false,
    // App Settings
    enableTray: false,
    enableMinToTray: false,
    enableCloseToTray: false,
    startToTray: false,
    openAtLogin: false,
    alwaysShowDock: false,
    enableBrowserIntegration: false,
    enableBrowserIntegrationFingerprint: this.formBuilder.control<boolean>({
      value: false,
      disabled: true,
    }),
    enableHardwareAcceleration: true,
    enableDuckDuckGoBrowserIntegration: false,
    theme: [null as ThemeType | null],
    locale: [null as string | null],
  });

  private refreshTimeoutSettings$ = new BehaviorSubject<void>(undefined);
  private destroy$ = new Subject<void>();

  constructor(
    private accountService: AccountService,
    private policyService: PolicyService,
    private formBuilder: FormBuilder,
    private i18nService: I18nService,
    private platformUtilsService: PlatformUtilsService,
    private vaultTimeoutSettingsService: VaultTimeoutSettingsService,
    private stateService: StateService,
    private autofillSettingsService: AutofillSettingsServiceAbstraction,
    private messagingService: MessagingService,
    private keyService: KeyService,
    private themeStateService: ThemeStateService,
    private domainSettingsService: DomainSettingsService,
    private dialogService: DialogService,
    private userVerificationService: UserVerificationServiceAbstraction,
    private desktopSettingsService: DesktopSettingsService,
    private biometricStateService: BiometricStateService,
    private biometricsService: BiometricsService,
    private desktopAutofillSettingsService: DesktopAutofillSettingsService,
    private pinService: PinServiceAbstraction,
    private logService: LogService,
    private nativeMessagingManifestService: NativeMessagingManifestService,
  ) {
    const isMac = this.platformUtilsService.getDevice() === DeviceType.MacOsDesktop;

    // Workaround to avoid ghosting trays https://github.com/electron/electron/issues/17622
    this.requireEnableTray = this.platformUtilsService.getDevice() === DeviceType.LinuxDesktop;

    const trayKey = isMac ? "enableMenuBar" : "enableTray";
    this.enableTrayText = this.i18nService.t(trayKey);
    this.enableTrayDescText = this.i18nService.t(trayKey + "Desc");

    const minToTrayKey = isMac ? "enableMinToMenuBar" : "enableMinToTray";
    this.enableMinToTrayText = this.i18nService.t(minToTrayKey);
    this.enableMinToTrayDescText = this.i18nService.t(minToTrayKey + "Desc");

    const closeToTrayKey = isMac ? "enableCloseToMenuBar" : "enableCloseToTray";
    this.enableCloseToTrayText = this.i18nService.t(closeToTrayKey);
    this.enableCloseToTrayDescText = this.i18nService.t(closeToTrayKey + "Desc");

    const startToTrayKey = isMac ? "startToMenuBar" : "startToTray";
    this.startToTrayText = this.i18nService.t(startToTrayKey);
    this.startToTrayDescText = this.i18nService.t(startToTrayKey + "Desc");

    // DuckDuckGo browser is only for macos initially
    this.showDuckDuckGoIntegrationOption = isMac;

    const localeOptions: any[] = [];
    this.i18nService.supportedTranslationLocales.forEach((locale) => {
      let name = locale;
      if (this.i18nService.localeNames.has(locale)) {
        name += " - " + this.i18nService.localeNames.get(locale);
      }
      localeOptions.push({ name: name, value: locale });
    });
    localeOptions.sort(Utils.getSortFunction(this.i18nService, "name"));
    localeOptions.splice(0, 0, { name: this.i18nService.t("default"), value: null });
    this.localeOptions = localeOptions;

    this.themeOptions = [
      { name: this.i18nService.t("default"), value: ThemeType.System },
      { name: this.i18nService.t("light"), value: ThemeType.Light },
      { name: this.i18nService.t("dark"), value: ThemeType.Dark },
      { name: "Nord", value: ThemeType.Nord },
    ];

    this.clearClipboardOptions = [
      { name: this.i18nService.t("never"), value: null },
      { name: this.i18nService.t("tenSeconds"), value: 10 },
      { name: this.i18nService.t("twentySeconds"), value: 20 },
      { name: this.i18nService.t("thirtySeconds"), value: 30 },
      { name: this.i18nService.t("oneMinute"), value: 60 },
      { name: this.i18nService.t("twoMinutes"), value: 120 },
      { name: this.i18nService.t("fiveMinutes"), value: 300 },
    ];
  }

  async ngOnInit() {
    this.vaultTimeoutOptions = await this.generateVaultTimeoutOptions();
    const activeAccount = await firstValueFrom(this.accountService.activeAccount$);
    this.isLinux = (await this.platformUtilsService.getDevice()) === DeviceType.LinuxDesktop;

    if (activeAccount == null || activeAccount.id == null) {
      return;
    }
    this.userHasMasterPassword = await this.userVerificationService.hasMasterPassword();

    this.isWindows = this.platformUtilsService.getDevice() === DeviceType.WindowsDesktop;

    this.currentUserEmail = activeAccount.email;
    this.currentUserId = activeAccount.id;

    this.availableVaultTimeoutActions$ = this.refreshTimeoutSettings$.pipe(
      switchMap(() =>
        this.vaultTimeoutSettingsService.availableVaultTimeoutActions$(activeAccount.id),
      ),
    );

    // Load timeout policy
    this.vaultTimeoutPolicyCallout = this.policyService.get$(PolicyType.MaximumVaultTimeout).pipe(
      filter((policy) => policy != null),
      map((policy) => {
        let timeout;
        if (policy.data?.minutes) {
          timeout = {
            hours: Math.floor(policy.data?.minutes / 60),
            minutes: policy.data?.minutes % 60,
          };
        }
        return { timeout: timeout, action: policy.data?.action };
      }),
      tap((policy) => {
        if (policy.action) {
          this.form.controls.vaultTimeoutAction.disable({ emitEvent: false });
        } else {
          this.form.controls.vaultTimeoutAction.enable({ emitEvent: false });
        }
      }),
    );

    // Load initial values
    this.userHasPinSet = await this.pinService.isPinSet(activeAccount.id);

    const initialValues = {
      vaultTimeout: await firstValueFrom(
        this.vaultTimeoutSettingsService.getVaultTimeoutByUserId$(activeAccount.id),
      ),
      vaultTimeoutAction: await firstValueFrom(
        this.vaultTimeoutSettingsService.getVaultTimeoutActionByUserId$(activeAccount.id),
      ),
      pin: this.userHasPinSet,
      biometric: await this.vaultTimeoutSettingsService.isBiometricLockSet(),
      autoPromptBiometrics: await firstValueFrom(this.biometricStateService.promptAutomatically$),
      requirePasswordOnStart: await firstValueFrom(
        this.biometricStateService.requirePasswordOnStart$,
      ),
      clearClipboard: await firstValueFrom(this.autofillSettingsService.clearClipboardDelay$),
      minimizeOnCopyToClipboard: await firstValueFrom(this.desktopSettingsService.minimizeOnCopy$),
      enableFavicons: await firstValueFrom(this.domainSettingsService.showFavicons$),
      enableTray: await firstValueFrom(this.desktopSettingsService.trayEnabled$),
      enableMinToTray: await firstValueFrom(this.desktopSettingsService.minimizeToTray$),
      enableCloseToTray: await firstValueFrom(this.desktopSettingsService.closeToTray$),
      startToTray: await firstValueFrom(this.desktopSettingsService.startToTray$),
      openAtLogin: await firstValueFrom(this.desktopSettingsService.openAtLogin$),
      alwaysShowDock: await firstValueFrom(this.desktopSettingsService.alwaysShowDock$),
      enableBrowserIntegration: await firstValueFrom(
        this.desktopSettingsService.browserIntegrationEnabled$,
      ),
      enableBrowserIntegrationFingerprint: await firstValueFrom(
        this.desktopSettingsService.browserIntegrationFingerprintEnabled$,
      ),
      enableDuckDuckGoBrowserIntegration: await firstValueFrom(
        this.desktopAutofillSettingsService.enableDuckDuckGoBrowserIntegration$,
      ),
      enableHardwareAcceleration: await firstValueFrom(
        this.desktopSettingsService.hardwareAcceleration$,
      ),
      theme: await firstValueFrom(this.themeStateService.selectedTheme$),
      locale: await firstValueFrom(this.i18nService.userSetLocale$),
    };
    this.form.setValue(initialValues, { emitEvent: false });

    if (this.form.value.enableBrowserIntegration) {
      this.form.controls.enableBrowserIntegrationFingerprint.enable();
    }

    // Non-form values
    this.showMinToTray = this.platformUtilsService.getDevice() !== DeviceType.LinuxDesktop;
    this.showAlwaysShowDock = this.platformUtilsService.getDevice() === DeviceType.MacOsDesktop;
    this.supportsBiometric = await this.biometricsService.supportsBiometric();
    this.previousVaultTimeout = this.form.value.vaultTimeout;

    this.refreshTimeoutSettings$
      .pipe(
        switchMap(() =>
          this.vaultTimeoutSettingsService.getVaultTimeoutActionByUserId$(activeAccount.id),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((action) => {
        this.form.controls.vaultTimeoutAction.setValue(action, { emitEvent: false });
      });

    // Form events
    this.form.controls.vaultTimeout.valueChanges
      .pipe(
        debounceTime(500),
        concatMap(async (value) => {
          await this.saveVaultTimeout(value);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    this.form.controls.vaultTimeoutAction.valueChanges
      .pipe(
        concatMap(async (action) => {
          await this.saveVaultTimeoutAction(action);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    this.form.controls.pin.valueChanges
      .pipe(
        concatMap(async (value) => {
          await this.updatePin(value);
          this.refreshTimeoutSettings$.next();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    this.form.controls.biometric.valueChanges
      .pipe(
        concatMap(async (enabled) => {
          await this.updateBiometric(enabled);
          this.refreshTimeoutSettings$.next();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    this.form.controls.enableBrowserIntegration.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((enabled) => {
        if (enabled) {
          this.form.controls.enableBrowserIntegrationFingerprint.enable();
        } else {
          this.form.controls.enableBrowserIntegrationFingerprint.disable();
        }
      });
  }

  async saveVaultTimeout(newValue: VaultTimeout) {
    if (newValue === VaultTimeoutStringType.Never) {
      const confirmed = await this.dialogService.openSimpleDialog({
        title: { key: "warning" },
        content: { key: "neverLockWarning" },
        type: "warning",
      });

      if (!confirmed) {
        this.form.controls.vaultTimeout.setValue(this.previousVaultTimeout);
        return;
      }
    }

    // Avoid saving 0 since it's useless as a timeout value.
    if (this.form.value.vaultTimeout === 0) {
      return;
    }

    if (!this.form.controls.vaultTimeout.valid) {
      this.platformUtilsService.showToast(
        "error",
        null,
        this.i18nService.t("vaultTimeoutTooLarge"),
      );
      return;
    }

    this.previousVaultTimeout = this.form.value.vaultTimeout;

    const activeAccount = await firstValueFrom(this.accountService.activeAccount$);

    await this.vaultTimeoutSettingsService.setVaultTimeoutOptions(
      activeAccount.id,
      newValue,
      this.form.value.vaultTimeoutAction,
    );
  }

  async saveVaultTimeoutAction(newValue: VaultTimeoutAction) {
    if (newValue === "logOut") {
      const confirmed = await this.dialogService.openSimpleDialog({
        title: { key: "vaultTimeoutLogOutConfirmationTitle" },
        content: { key: "vaultTimeoutLogOutConfirmation" },
        type: "warning",
      });

      if (!confirmed) {
        this.form.controls.vaultTimeoutAction.patchValue(VaultTimeoutAction.Lock, {
          emitEvent: false,
        });
        return;
      }
    }

    if (this.form.controls.vaultTimeout.hasError("policyError")) {
      this.platformUtilsService.showToast(
        "error",
        null,
        this.i18nService.t("vaultTimeoutTooLarge"),
      );
      return;
    }

    const activeAccount = await firstValueFrom(this.accountService.activeAccount$);

    await this.vaultTimeoutSettingsService.setVaultTimeoutOptions(
      activeAccount.id,
      this.form.value.vaultTimeout,
      newValue,
    );
  }

  async updatePin(value: boolean) {
    if (value) {
      const dialogRef = SetPinComponent.open(this.dialogService);

      if (dialogRef == null) {
        this.form.controls.pin.setValue(false, { emitEvent: false });
        return;
      }

      this.userHasPinSet = await firstValueFrom(dialogRef.closed);
      this.form.controls.pin.setValue(this.userHasPinSet, { emitEvent: false });
    }

    if (!value) {
      // If user turned off PIN without having a MP and has biometric + require MP/PIN on restart enabled
      if (this.form.value.requirePasswordOnStart && !this.userHasMasterPassword) {
        // then must turn that off to prevent user from getting into bad state
        this.form.controls.requirePasswordOnStart.setValue(false);
        await this.updateRequirePasswordOnStart();
      }

      await this.vaultTimeoutSettingsService.clear();
    }

    this.messagingService.send("redrawMenu");
  }

  async updateBiometric(enabled: boolean) {
    // NOTE: A bug in angular causes [ngModel] to not reflect the backing field value
    // causing the checkbox to remain checked even if authentication fails.
    // The bug should resolve itself once the angular issue is resolved.
    // See: https://github.com/angular/angular/issues/13063

    try {
      if (!enabled || !this.supportsBiometric) {
        this.form.controls.biometric.setValue(false, { emitEvent: false });
        await this.biometricStateService.setBiometricUnlockEnabled(false);
        await this.keyService.refreshAdditionalKeys();
        return;
      }

      const needsSetup = await this.biometricsService.biometricsNeedsSetup();
      const supportsBiometricAutoSetup = await this.biometricsService.biometricsSupportsAutoSetup();

      if (needsSetup) {
        if (supportsBiometricAutoSetup) {
          await this.biometricsService.biometricsSetup();
        } else {
          const confirmed = await this.dialogService.openSimpleDialog({
            title: { key: "biometricsManualSetupTitle" },
            content: { key: "biometricsManualSetupDesc" },
            type: "warning",
          });
          if (confirmed) {
            this.platformUtilsService.launchUri("https://bitwarden.com/help/biometrics/");
          }
          return;
        }
      }

      await this.biometricStateService.setBiometricUnlockEnabled(true);
      if (this.isWindows) {
        // Recommended settings for Windows Hello
        this.form.controls.requirePasswordOnStart.setValue(true);
        this.form.controls.autoPromptBiometrics.setValue(false);
        await this.biometricStateService.setPromptAutomatically(false);
        await this.biometricStateService.setRequirePasswordOnStart(true);
        await this.biometricStateService.setDismissedRequirePasswordOnStartCallout();
      } else if (this.isLinux) {
        // Similar to Windows
        this.form.controls.requirePasswordOnStart.setValue(true);
        this.form.controls.autoPromptBiometrics.setValue(false);
        await this.biometricStateService.setPromptAutomatically(false);
        await this.biometricStateService.setRequirePasswordOnStart(true);
        await this.biometricStateService.setDismissedRequirePasswordOnStartCallout();
      }
      await this.keyService.refreshAdditionalKeys();

      // Validate the key is stored in case biometrics fail.
      const biometricSet = await this.keyService.hasUserKeyStored(KeySuffixOptions.Biometric);
      this.form.controls.biometric.setValue(biometricSet, { emitEvent: false });
      if (!biometricSet) {
        await this.biometricStateService.setBiometricUnlockEnabled(false);
      }
    } finally {
      this.messagingService.send("redrawMenu");
    }
  }

  async updateAutoPromptBiometrics() {
    if (this.form.value.autoPromptBiometrics) {
      // require password on start must be disabled if auto prompt biometrics is enabled
      this.form.controls.requirePasswordOnStart.setValue(false);
      await this.updateRequirePasswordOnStart();
      await this.biometricStateService.setPromptAutomatically(true);
    } else {
      await this.biometricStateService.setPromptAutomatically(false);
    }
  }

  async updateRequirePasswordOnStart() {
    if (this.form.value.requirePasswordOnStart) {
      // auto prompt biometrics must be disabled if require password on start is enabled
      this.form.controls.autoPromptBiometrics.setValue(false);
      await this.updateAutoPromptBiometrics();

      await this.biometricStateService.setRequirePasswordOnStart(true);
    } else {
      await this.biometricStateService.setRequirePasswordOnStart(false);
    }
    await this.biometricStateService.setDismissedRequirePasswordOnStartCallout();
    await this.keyService.refreshAdditionalKeys();
  }

  async saveFavicons() {
    await this.domainSettingsService.setShowFavicons(this.form.value.enableFavicons);
    this.messagingService.send("refreshCiphers");
  }

  async saveMinToTray() {
    await this.desktopSettingsService.setMinimizeToTray(this.form.value.enableMinToTray);
  }

  async saveCloseToTray() {
    if (this.requireEnableTray) {
      this.form.controls.enableTray.setValue(true);
      await this.desktopSettingsService.setTrayEnabled(this.form.value.enableTray);
    }

    await this.desktopSettingsService.setCloseToTray(this.form.value.enableCloseToTray);
  }

  async saveTray() {
    if (
      this.requireEnableTray &&
      !this.form.value.enableTray &&
      (this.form.value.startToTray || this.form.value.enableCloseToTray)
    ) {
      const confirm = await this.dialogService.openSimpleDialog({
        title: { key: "confirmTrayTitle" },
        content: { key: "confirmTrayDesc" },
        type: "warning",
      });

      if (confirm) {
        this.form.controls.startToTray.setValue(false, { emitEvent: false });
        await this.desktopSettingsService.setStartToTray(this.form.value.startToTray);
        this.form.controls.enableCloseToTray.setValue(false, { emitEvent: false });
        await this.desktopSettingsService.setCloseToTray(this.form.value.enableCloseToTray);
      } else {
        this.form.controls.enableTray.setValue(true);
      }

      return;
    }

    await this.desktopSettingsService.setTrayEnabled(this.form.value.enableTray);
    // TODO: Ideally the DesktopSettingsService.trayEnabled$ could be subscribed to instead of using messaging.
    this.messagingService.send(this.form.value.enableTray ? "showTray" : "removeTray");
  }

  async saveStartToTray() {
    if (this.requireEnableTray) {
      this.form.controls.enableTray.setValue(true);
      await this.desktopSettingsService.setTrayEnabled(this.form.value.enableTray);
    }

    await this.desktopSettingsService.setStartToTray(this.form.value.startToTray);
  }

  async saveLocale() {
    await this.i18nService.setLocale(this.form.value.locale);
  }

  async saveTheme() {
    await this.themeStateService.setSelectedTheme(this.form.value.theme);
  }

  async saveMinOnCopyToClipboard() {
    await this.desktopSettingsService.setMinimizeOnCopy(
      this.form.value.minimizeOnCopyToClipboard,
      this.currentUserId,
    );
  }

  async saveClearClipboard() {
    await this.autofillSettingsService.setClearClipboardDelay(this.form.value.clearClipboard);
  }

  async saveAlwaysShowDock() {
    await this.desktopSettingsService.setAlwaysShowDock(this.form.value.alwaysShowDock);
  }

  async saveOpenAtLogin() {
    await this.desktopSettingsService.setOpenAtLogin(this.form.value.openAtLogin);
    // TODO: Ideally DesktopSettingsService.openAtLogin$ could be subscribed to directly rather than sending a message
    this.messagingService.send(
      this.form.value.openAtLogin ? "addOpenAtLogin" : "removeOpenAtLogin",
    );
  }

  async saveBrowserIntegration() {
    if (
      ipc.platform.deviceType === DeviceType.MacOsDesktop &&
      !this.platformUtilsService.isMacAppStore() &&
      !ipc.platform.isDev
    ) {
      await this.dialogService.openSimpleDialog({
        title: { key: "browserIntegrationUnsupportedTitle" },
        content: { key: "browserIntegrationMasOnlyDesc" },
        acceptButtonText: { key: "ok" },
        cancelButtonText: null,
        type: "warning",
      });

      this.form.controls.enableBrowserIntegration.setValue(false);
      return;
    } else if (ipc.platform.isWindowsStore) {
      await this.dialogService.openSimpleDialog({
        title: { key: "browserIntegrationUnsupportedTitle" },
        content: { key: "browserIntegrationWindowsStoreDesc" },
        acceptButtonText: { key: "ok" },
        cancelButtonText: null,
        type: "warning",
      });

      this.form.controls.enableBrowserIntegration.setValue(false);
      return;
    } else if (ipc.platform.isSnapStore || ipc.platform.isFlatpak) {
      await this.dialogService.openSimpleDialog({
        title: { key: "browserIntegrationUnsupportedTitle" },
        content: { key: "browserIntegrationLinuxDesc" },
        acceptButtonText: { key: "ok" },
        cancelButtonText: null,
        type: "warning",
      });

      this.form.controls.enableBrowserIntegration.setValue(false);
      return;
    }

    await this.desktopSettingsService.setBrowserIntegrationEnabled(
      this.form.value.enableBrowserIntegration,
    );

    const errorResult = await this.nativeMessagingManifestService.generate(
      this.form.value.enableBrowserIntegration,
    );
    if (errorResult !== null) {
      this.logService.error("Error in browser integration: " + errorResult);
      await this.dialogService.openSimpleDialog({
        title: { key: "browserIntegrationErrorTitle" },
        content: { key: "browserIntegrationErrorDesc" },
        acceptButtonText: { key: "ok" },
        cancelButtonText: null,
        type: "danger",
      });
    }

    if (!this.form.value.enableBrowserIntegration) {
      this.form.controls.enableBrowserIntegrationFingerprint.setValue(false);
      // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.saveBrowserIntegrationFingerprint();
    }
  }

  async saveDdgBrowserIntegration() {
    await this.desktopAutofillSettingsService.setEnableDuckDuckGoBrowserIntegration(
      this.form.value.enableDuckDuckGoBrowserIntegration,
    );

    // Adding to cover users on a previous version of DDG
    await this.stateService.setEnableDuckDuckGoBrowserIntegration(
      this.form.value.enableDuckDuckGoBrowserIntegration,
    );

    if (!this.form.value.enableBrowserIntegration) {
      await this.stateService.setDuckDuckGoSharedKey(null);
    }

    const errorResult = await this.nativeMessagingManifestService.generateDuckDuckGo(
      this.form.value.enableDuckDuckGoBrowserIntegration,
    );
    if (errorResult !== null) {
      this.logService.error("Error in DDG browser integration: " + errorResult);
    }
  }

  async saveBrowserIntegrationFingerprint() {
    await this.desktopSettingsService.setBrowserIntegrationFingerprintEnabled(
      this.form.value.enableBrowserIntegrationFingerprint,
    );
  }

  async saveHardwareAcceleration() {
    await this.desktopSettingsService.setHardwareAcceleration(
      this.form.value.enableHardwareAcceleration,
    );
  }

  private async generateVaultTimeoutOptions(): Promise<VaultTimeoutOption[]> {
    let vaultTimeoutOptions: VaultTimeoutOption[] = [
      { name: this.i18nService.t("oneMinute"), value: 1 },
      { name: this.i18nService.t("fiveMinutes"), value: 5 },
      { name: this.i18nService.t("fifteenMinutes"), value: 15 },
      { name: this.i18nService.t("thirtyMinutes"), value: 30 },
      { name: this.i18nService.t("oneHour"), value: 60 },
      { name: this.i18nService.t("fourHours"), value: 240 },
      { name: this.i18nService.t("onIdle"), value: VaultTimeoutStringType.OnIdle },
      { name: this.i18nService.t("onSleep"), value: VaultTimeoutStringType.OnSleep },
    ];

    if (await ipc.platform.powermonitor.isLockMonitorAvailable()) {
      vaultTimeoutOptions.push({
        name: this.i18nService.t("onLocked"),
        value: VaultTimeoutStringType.OnLocked,
      });
    }

    vaultTimeoutOptions = vaultTimeoutOptions.concat([
      { name: this.i18nService.t("onRestart"), value: VaultTimeoutStringType.OnRestart },
      { name: this.i18nService.t("never"), value: VaultTimeoutStringType.Never },
    ]);

    return vaultTimeoutOptions;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get biometricText() {
    switch (this.platformUtilsService.getDevice()) {
      case DeviceType.MacOsDesktop:
        return "unlockWithTouchId";
      case DeviceType.WindowsDesktop:
        return "unlockWithWindowsHello";
      case DeviceType.LinuxDesktop:
        return "unlockWithPolkit";
      default:
        throw new Error("Unsupported platform");
    }
  }

  get autoPromptBiometricsText() {
    switch (this.platformUtilsService.getDevice()) {
      case DeviceType.MacOsDesktop:
        return "autoPromptTouchId";
      case DeviceType.WindowsDesktop:
        return "autoPromptWindowsHello";
      case DeviceType.LinuxDesktop:
        return "autoPromptPolkit";
      default:
        throw new Error("Unsupported platform");
    }
  }

  get additionalBiometricSettingsText() {
    switch (this.platformUtilsService.getDevice()) {
      case DeviceType.MacOsDesktop:
        return "additionalTouchIdSettings";
      case DeviceType.WindowsDesktop:
        return "additionalWindowsHelloSettings";
      default:
        throw new Error("Unsupported platform");
    }
  }
}

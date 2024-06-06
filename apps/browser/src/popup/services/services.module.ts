import { APP_INITIALIZER, NgModule, NgZone } from "@angular/core";
import { Router } from "@angular/router";
import { Subject, merge } from "rxjs";

import { UnauthGuard as BaseUnauthGuardService } from "@bitwarden/angular/auth/guards";
import { AngularThemingService } from "@bitwarden/angular/platform/services/theming/angular-theming.service";
import { SafeProvider, safeProvider } from "@bitwarden/angular/platform/utils/safe-provider";
import {
  MEMORY_STORAGE,
  SECURE_STORAGE,
  OBSERVABLE_DISK_STORAGE,
  OBSERVABLE_MEMORY_STORAGE,
  SYSTEM_THEME_OBSERVABLE,
  SafeInjectionToken,
  DEFAULT_VAULT_TIMEOUT,
  INTRAPROCESS_MESSAGING_SUBJECT,
  CLIENT_TYPE,
} from "@bitwarden/angular/services/injection-tokens";
import { JslibServicesModule } from "@bitwarden/angular/services/jslib-services.module";
import { AuthRequestServiceAbstraction, PinServiceAbstraction } from "@bitwarden/auth/common";
import { EventCollectionService as EventCollectionServiceAbstraction } from "@bitwarden/common/abstractions/event/event-collection.service";
import { NotificationsService } from "@bitwarden/common/abstractions/notifications.service";
import { VaultTimeoutSettingsService } from "@bitwarden/common/abstractions/vault-timeout/vault-timeout-settings.service";
import { VaultTimeoutService } from "@bitwarden/common/abstractions/vault-timeout/vault-timeout.service";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { AccountService as AccountServiceAbstraction } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { DeviceTrustServiceAbstraction } from "@bitwarden/common/auth/abstractions/device-trust.service.abstraction";
import { DevicesServiceAbstraction } from "@bitwarden/common/auth/abstractions/devices/devices.service.abstraction";
import { KdfConfigService } from "@bitwarden/common/auth/abstractions/kdf-config.service";
import { KeyConnectorService } from "@bitwarden/common/auth/abstractions/key-connector.service";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/auth/abstractions/master-password.service.abstraction";
import { SsoLoginServiceAbstraction } from "@bitwarden/common/auth/abstractions/sso-login.service.abstraction";
import { TokenService } from "@bitwarden/common/auth/abstractions/token.service";
import { UserVerificationService } from "@bitwarden/common/auth/abstractions/user-verification/user-verification.service.abstraction";
import {
  AutofillSettingsService,
  AutofillSettingsServiceAbstraction,
} from "@bitwarden/common/autofill/services/autofill-settings.service";
import {
  DefaultDomainSettingsService,
  DomainSettingsService,
} from "@bitwarden/common/autofill/services/domain-settings.service";
import {
  UserNotificationSettingsService,
  UserNotificationSettingsServiceAbstraction,
} from "@bitwarden/common/autofill/services/user-notification-settings.service";
import { BillingAccountProfileStateService } from "@bitwarden/common/billing/abstractions/account/billing-account-profile-state.service";
import { ClientType } from "@bitwarden/common/enums";
import { CryptoFunctionService } from "@bitwarden/common/platform/abstractions/crypto-function.service";
import { CryptoService } from "@bitwarden/common/platform/abstractions/crypto.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { FileDownloadService } from "@bitwarden/common/platform/abstractions/file-download/file-download.service";
import { I18nService as I18nServiceAbstraction } from "@bitwarden/common/platform/abstractions/i18n.service";
import { KeyGenerationService } from "@bitwarden/common/platform/abstractions/key-generation.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService as BaseStateServiceAbstraction } from "@bitwarden/common/platform/abstractions/state.service";
import {
  AbstractStorageService,
  ObservableStorageService,
} from "@bitwarden/common/platform/abstractions/storage.service";
import { BiometricStateService } from "@bitwarden/common/platform/biometrics/biometric-state.service";
import { StateFactory } from "@bitwarden/common/platform/factories/state-factory";
import { Message, MessageListener, MessageSender } from "@bitwarden/common/platform/messaging";
// eslint-disable-next-line no-restricted-imports -- Used for dependency injection
import { SubjectMessageSender } from "@bitwarden/common/platform/messaging/internal";
import { GlobalState } from "@bitwarden/common/platform/models/domain/global-state";
import { ConsoleLogService } from "@bitwarden/common/platform/services/console-log.service";
import { ContainerService } from "@bitwarden/common/platform/services/container.service";
import { MigrationRunner } from "@bitwarden/common/platform/services/migration-runner";
import { StorageServiceProvider } from "@bitwarden/common/platform/services/storage-service.provider";
import { WebCryptoFunctionService } from "@bitwarden/common/platform/services/web-crypto-function.service";
import {
  DerivedStateProvider,
  GlobalStateProvider,
  StateProvider,
} from "@bitwarden/common/platform/state";
// eslint-disable-next-line import/no-restricted-paths -- Used for dependency injection
import { InlineDerivedStateProvider } from "@bitwarden/common/platform/state/implementations/inline-derived-state";
import { SyncService } from "@bitwarden/common/platform/sync";
import { VaultTimeoutStringType } from "@bitwarden/common/types/vault-timeout.type";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CollectionService } from "@bitwarden/common/vault/abstractions/collection.service";
import { FolderService as FolderServiceAbstraction } from "@bitwarden/common/vault/abstractions/folder/folder.service.abstraction";
import { TotpService as TotpServiceAbstraction } from "@bitwarden/common/vault/abstractions/totp.service";
import { TotpService } from "@bitwarden/common/vault/services/totp.service";
import { DialogService, ToastService } from "@bitwarden/components";
import { PasswordRepromptService } from "@bitwarden/vault";

import { UnauthGuardService } from "../../auth/popup/services";
import { AutofillService as AutofillServiceAbstraction } from "../../autofill/services/abstractions/autofill.service";
import AutofillService from "../../autofill/services/autofill.service";
import MainBackground from "../../background/main.background";
import { Account } from "../../models/account";
import { BrowserApi } from "../../platform/browser/browser-api";
import { runInsideAngular } from "../../platform/browser/run-inside-angular.operator";
/* eslint-disable no-restricted-imports */
import { ChromeMessageSender } from "../../platform/messaging/chrome-message.sender";
/* eslint-enable no-restricted-imports */
import { OffscreenDocumentService } from "../../platform/offscreen-document/abstractions/offscreen-document";
import { DefaultOffscreenDocumentService } from "../../platform/offscreen-document/offscreen-document.service";
import BrowserPopupUtils from "../../platform/popup/browser-popup-utils";
import { BrowserFileDownloadService } from "../../platform/popup/services/browser-file-download.service";
import { BrowserStateService as StateServiceAbstraction } from "../../platform/services/abstractions/browser-state.service";
import { ScriptInjectorService } from "../../platform/services/abstractions/script-injector.service";
import { BrowserCryptoService } from "../../platform/services/browser-crypto.service";
import { BrowserEnvironmentService } from "../../platform/services/browser-environment.service";
import BrowserLocalStorageService from "../../platform/services/browser-local-storage.service";
import { BrowserScriptInjectorService } from "../../platform/services/browser-script-injector.service";
import { DefaultBrowserStateService } from "../../platform/services/default-browser-state.service";
import I18nService from "../../platform/services/i18n.service";
import { ForegroundPlatformUtilsService } from "../../platform/services/platform-utils/foreground-platform-utils.service";
import { BrowserStorageServiceProvider } from "../../platform/storage/browser-storage-service.provider";
import { ForegroundMemoryStorageService } from "../../platform/storage/foreground-memory-storage.service";
import { fromChromeRuntimeMessaging } from "../../platform/utils/from-chrome-runtime-messaging";
import { BrowserSendStateService } from "../../tools/popup/services/browser-send-state.service";
import { FilePopoutUtilsService } from "../../tools/popup/services/file-popout-utils.service";
import { Fido2UserVerificationService } from "../../vault/services/fido2-user-verification.service";
import { VaultBrowserStateService } from "../../vault/services/vault-browser-state.service";
import { VaultFilterService } from "../../vault/services/vault-filter.service";

import { DebounceNavigationService } from "./debounce-navigation.service";
import { InitService } from "./init.service";
import { PopupCloseWarningService } from "./popup-close-warning.service";

const OBSERVABLE_LARGE_OBJECT_MEMORY_STORAGE = new SafeInjectionToken<
  AbstractStorageService & ObservableStorageService
>("OBSERVABLE_LARGE_OBJECT_MEMORY_STORAGE");

const needsBackgroundInit = BrowserPopupUtils.backgroundInitializationRequired();
const mainBackground: MainBackground = needsBackgroundInit
  ? createLocalBgService()
  : BrowserApi.getBackgroundPage().bitwardenMain;

function createLocalBgService() {
  const localBgService = new MainBackground(true);
  // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  localBgService.bootstrap();
  return localBgService;
}

/** @deprecated This method needs to be removed as part of MV3 conversion. Please do not add more and actively try to remove usages */
function getBgService<T>(service: keyof MainBackground) {
  return (): T => {
    return mainBackground ? (mainBackground[service] as any as T) : null;
  };
}

/**
 * Provider definitions used in the ngModule.
 * Add your provider definition here using the safeProvider function as a wrapper. This will give you type safety.
 * If you need help please ask for it, do NOT change the type of this array.
 */
const safeProviders: SafeProvider[] = [
  safeProvider(InitService),
  safeProvider(DebounceNavigationService),
  safeProvider(DialogService),
  safeProvider(PopupCloseWarningService),
  safeProvider({
    provide: DEFAULT_VAULT_TIMEOUT,
    useValue: VaultTimeoutStringType.OnRestart,
  }),
  safeProvider({
    provide: APP_INITIALIZER as SafeInjectionToken<() => Promise<void>>,
    useFactory: (initService: InitService) => initService.init(),
    deps: [InitService],
    multi: true,
  }),
  safeProvider({
    provide: BaseUnauthGuardService,
    useClass: UnauthGuardService,
    deps: [AuthService, Router],
  }),
  safeProvider({
    provide: SsoLoginServiceAbstraction,
    useFactory: getBgService<SsoLoginServiceAbstraction>("ssoLoginService"),
    deps: [],
  }),
  safeProvider({
    provide: CryptoFunctionService,
    useFactory: () => new WebCryptoFunctionService(window),
    deps: [],
  }),
  safeProvider({
    provide: LogService,
    useFactory: () => {
      const isDev = process.env.ENV === "development";
      return new ConsoleLogService(isDev);
    },
    deps: [],
  }),
  safeProvider({
    provide: EnvironmentService,
    useExisting: BrowserEnvironmentService,
  }),
  safeProvider({
    provide: BrowserEnvironmentService,
    useClass: BrowserEnvironmentService,
    deps: [LogService, StateProvider, AccountServiceAbstraction],
  }),
  safeProvider({
    provide: I18nServiceAbstraction,
    useFactory: (globalStateProvider: GlobalStateProvider) => {
      return new I18nService(BrowserApi.getUILanguage(), globalStateProvider);
    },
    deps: [GlobalStateProvider],
  }),
  safeProvider({
    provide: CryptoService,
    useFactory: (
      pinService: PinServiceAbstraction,
      masterPasswordService: InternalMasterPasswordServiceAbstraction,
      keyGenerationService: KeyGenerationService,
      cryptoFunctionService: CryptoFunctionService,
      encryptService: EncryptService,
      platformUtilsService: PlatformUtilsService,
      logService: LogService,
      stateService: StateServiceAbstraction,
      accountService: AccountServiceAbstraction,
      stateProvider: StateProvider,
      biometricStateService: BiometricStateService,
      kdfConfigService: KdfConfigService,
    ) => {
      const cryptoService = new BrowserCryptoService(
        pinService,
        masterPasswordService,
        keyGenerationService,
        cryptoFunctionService,
        encryptService,
        platformUtilsService,
        logService,
        stateService,
        accountService,
        stateProvider,
        biometricStateService,
        kdfConfigService,
      );
      new ContainerService(cryptoService, encryptService).attachToGlobal(self);
      return cryptoService;
    },
    deps: [
      PinServiceAbstraction,
      InternalMasterPasswordServiceAbstraction,
      KeyGenerationService,
      CryptoFunctionService,
      EncryptService,
      PlatformUtilsService,
      LogService,
      StateServiceAbstraction,
      AccountServiceAbstraction,
      StateProvider,
      BiometricStateService,
      KdfConfigService,
    ],
  }),
  safeProvider({
    provide: TotpServiceAbstraction,
    useClass: TotpService,
    deps: [CryptoFunctionService, LogService],
  }),
  safeProvider({
    provide: AuthRequestServiceAbstraction,
    useFactory: getBgService<AuthRequestServiceAbstraction>("authRequestService"),
    deps: [],
  }),
  safeProvider({
    provide: DeviceTrustServiceAbstraction,
    useFactory: getBgService<DeviceTrustServiceAbstraction>("deviceTrustService"),
    deps: [],
  }),
  safeProvider({
    provide: DevicesServiceAbstraction,
    useFactory: getBgService<DevicesServiceAbstraction>("devicesService"),
    deps: [],
  }),
  safeProvider({
    provide: OffscreenDocumentService,
    useClass: DefaultOffscreenDocumentService,
    deps: [LogService],
  }),
  safeProvider({
    provide: PlatformUtilsService,
    useFactory: (
      toastService: ToastService,
      offscreenDocumentService: OffscreenDocumentService,
    ) => {
      return new ForegroundPlatformUtilsService(
        toastService,
        (clipboardValue: string, clearMs: number) => {
          void BrowserApi.sendMessage("clearClipboard", { clipboardValue, clearMs });
        },
        async () => {
          const response = await BrowserApi.sendMessageWithResponse<{
            result: boolean;
            error: string;
          }>("biometricUnlock");
          if (!response.result) {
            throw response.error;
          }
          return response.result;
        },
        window,
        offscreenDocumentService,
      );
    },
    deps: [ToastService, OffscreenDocumentService],
  }),
  safeProvider({
    provide: SyncService,
    useFactory: getBgService<SyncService>("syncService"),
    deps: [],
  }),
  safeProvider({
    provide: DomainSettingsService,
    useClass: DefaultDomainSettingsService,
    deps: [StateProvider],
  }),
  safeProvider({
    provide: AbstractStorageService,
    useClass: BrowserLocalStorageService,
    deps: [],
  }),
  safeProvider({
    provide: AutofillServiceAbstraction,
    useExisting: AutofillService,
  }),
  safeProvider({
    provide: AutofillService,
    deps: [
      CipherService,
      AutofillSettingsServiceAbstraction,
      TotpServiceAbstraction,
      EventCollectionServiceAbstraction,
      LogService,
      DomainSettingsService,
      UserVerificationService,
      BillingAccountProfileStateService,
      ScriptInjectorService,
      AccountServiceAbstraction,
      AuthService,
    ],
  }),
  safeProvider({
    provide: ScriptInjectorService,
    useClass: BrowserScriptInjectorService,
    deps: [PlatformUtilsService, LogService],
  }),
  safeProvider({
    provide: KeyConnectorService,
    useFactory: getBgService<KeyConnectorService>("keyConnectorService"),
    deps: [],
  }),
  safeProvider({
    provide: UserVerificationService,
    useFactory: getBgService<UserVerificationService>("userVerificationService"),
    deps: [],
  }),
  safeProvider({
    provide: VaultTimeoutSettingsService,
    useFactory: getBgService<VaultTimeoutSettingsService>("vaultTimeoutSettingsService"),
    deps: [],
  }),
  safeProvider({
    provide: VaultTimeoutService,
    useFactory: getBgService<VaultTimeoutService>("vaultTimeoutService"),
    deps: [],
  }),
  safeProvider({
    provide: NotificationsService,
    useFactory: getBgService<NotificationsService>("notificationsService"),
    deps: [],
  }),
  safeProvider({
    provide: VaultFilterService,
    useClass: VaultFilterService,
    deps: [
      OrganizationService,
      FolderServiceAbstraction,
      CipherService,
      CollectionService,
      PolicyService,
      StateProvider,
      AccountServiceAbstraction,
    ],
  }),
  safeProvider({
    provide: SECURE_STORAGE,
    useExisting: AbstractStorageService, // Secure storage is not available in the browser, so we use normal storage instead and warn users when it is used.
  }),
  safeProvider({
    provide: MEMORY_STORAGE,
    useFactory: getBgService<AbstractStorageService>("memoryStorageService"),
    deps: [],
  }),
  safeProvider({
    provide: OBSERVABLE_MEMORY_STORAGE,
    useFactory: () => {
      if (BrowserApi.isManifestVersion(2)) {
        return new ForegroundMemoryStorageService();
      }

      return getBgService<AbstractStorageService & ObservableStorageService>(
        "memoryStorageForStateProviders",
      )();
    },
    deps: [],
  }),
  safeProvider({
    provide: OBSERVABLE_LARGE_OBJECT_MEMORY_STORAGE,
    useFactory: (
      regularMemoryStorageService: AbstractStorageService & ObservableStorageService,
    ) => {
      if (BrowserApi.isManifestVersion(2)) {
        return regularMemoryStorageService;
      }

      return getBgService<AbstractStorageService & ObservableStorageService>(
        "largeObjectMemoryStorageForStateProviders",
      )();
    },
    deps: [OBSERVABLE_MEMORY_STORAGE],
  }),
  safeProvider({
    provide: OBSERVABLE_DISK_STORAGE,
    useExisting: AbstractStorageService,
  }),
  safeProvider({
    provide: VaultBrowserStateService,
    useFactory: (stateProvider: StateProvider) => {
      return new VaultBrowserStateService(stateProvider);
    },
    deps: [StateProvider],
  }),
  safeProvider({
    provide: StateServiceAbstraction,
    useFactory: (
      storageService: AbstractStorageService,
      secureStorageService: AbstractStorageService,
      memoryStorageService: AbstractStorageService,
      logService: LogService,
      accountService: AccountServiceAbstraction,
      environmentService: EnvironmentService,
      tokenService: TokenService,
      migrationRunner: MigrationRunner,
    ) => {
      return new DefaultBrowserStateService(
        storageService,
        secureStorageService,
        memoryStorageService,
        logService,
        new StateFactory(GlobalState, Account),
        accountService,
        environmentService,
        tokenService,
        migrationRunner,
      );
    },
    deps: [
      AbstractStorageService,
      SECURE_STORAGE,
      MEMORY_STORAGE,
      LogService,
      AccountServiceAbstraction,
      EnvironmentService,
      TokenService,
      MigrationRunner,
    ],
  }),
  safeProvider({
    provide: BaseStateServiceAbstraction,
    useExisting: StateServiceAbstraction,
    deps: [],
  }),
  safeProvider({
    provide: FileDownloadService,
    useClass: BrowserFileDownloadService,
    deps: [],
  }),
  safeProvider({
    provide: SYSTEM_THEME_OBSERVABLE,
    useFactory: (platformUtilsService: PlatformUtilsService) => {
      // Safari doesn't properly handle the (prefers-color-scheme) media query in the popup window, it always returns light.
      // In Safari, we have to use the background page instead, which comes with limitations like not dynamically changing the extension theme when the system theme is changed.
      let windowContext = window;
      const backgroundWindow = BrowserApi.getBackgroundPage();
      if (platformUtilsService.isSafari() && backgroundWindow) {
        windowContext = backgroundWindow;
      }

      return AngularThemingService.createSystemThemeFromWindow(windowContext);
    },
    deps: [PlatformUtilsService],
  }),
  safeProvider({
    provide: FilePopoutUtilsService,
    useFactory: (platformUtilsService: PlatformUtilsService) => {
      return new FilePopoutUtilsService(platformUtilsService);
    },
    deps: [PlatformUtilsService],
  }),
  safeProvider({
    provide: DerivedStateProvider,
    useClass: InlineDerivedStateProvider,
    deps: [],
  }),
  safeProvider({
    provide: AutofillSettingsServiceAbstraction,
    useClass: AutofillSettingsService,
    deps: [StateProvider, PolicyService],
  }),
  safeProvider({
    provide: UserNotificationSettingsServiceAbstraction,
    useClass: UserNotificationSettingsService,
    deps: [StateProvider],
  }),
  safeProvider({
    provide: BrowserSendStateService,
    useClass: BrowserSendStateService,
    deps: [StateProvider],
  }),
  safeProvider({
    provide: MessageListener,
    useFactory: (subject: Subject<Message<Record<string, unknown>>>, ngZone: NgZone) =>
      new MessageListener(
        merge(
          subject.asObservable(), // For messages in the same context
          fromChromeRuntimeMessaging().pipe(runInsideAngular(ngZone)), // For messages in the same context
        ),
      ),
    deps: [INTRAPROCESS_MESSAGING_SUBJECT, NgZone],
  }),
  safeProvider({
    provide: MessageSender,
    useFactory: (subject: Subject<Message<Record<string, unknown>>>, logService: LogService) =>
      MessageSender.combine(
        new SubjectMessageSender(subject), // For sending messages in the same context
        new ChromeMessageSender(logService), // For sending messages to different contexts
      ),
    deps: [INTRAPROCESS_MESSAGING_SUBJECT, LogService],
  }),
  safeProvider({
    provide: INTRAPROCESS_MESSAGING_SUBJECT,
    useFactory: () => {
      if (BrowserPopupUtils.backgroundInitializationRequired()) {
        // There is no persistent main background which means we have one in memory,
        // we need the same instance that our in memory background is utilizing.
        return getBgService("intraprocessMessagingSubject")();
      } else {
        return new Subject<Message<Record<string, unknown>>>();
      }
    },
    deps: [],
  }),
  safeProvider({
    provide: MessageSender,
    useFactory: (subject: Subject<Message<Record<string, unknown>>>, logService: LogService) =>
      MessageSender.combine(
        new SubjectMessageSender(subject), // For sending messages in the same context
        new ChromeMessageSender(logService), // For sending messages to different contexts
      ),
    deps: [INTRAPROCESS_MESSAGING_SUBJECT, LogService],
  }),
  safeProvider({
    provide: INTRAPROCESS_MESSAGING_SUBJECT,
    useFactory: () => {
      if (needsBackgroundInit) {
        // We will have created a popup within this context, in that case
        // we want to make sure we have the same subject as that context so we
        // can message with it.
        return getBgService("intraprocessMessagingSubject")();
      } else {
        // There isn't a locally created background so we will communicate with
        // the true background through chrome apis, in that case, we can just create
        // one for ourself.
        return new Subject<Message<Record<string, unknown>>>();
      }
    },
    deps: [],
  }),
  safeProvider({
    provide: StorageServiceProvider,
    useClass: BrowserStorageServiceProvider,
    deps: [
      OBSERVABLE_DISK_STORAGE,
      OBSERVABLE_MEMORY_STORAGE,
      OBSERVABLE_LARGE_OBJECT_MEMORY_STORAGE,
    ],
  }),
  safeProvider({
    provide: CLIENT_TYPE,
    useValue: ClientType.Browser,
  }),
  safeProvider({
    provide: Fido2UserVerificationService,
    useClass: Fido2UserVerificationService,
    deps: [PasswordRepromptService, UserVerificationService, DialogService],
  }),
];

@NgModule({
  imports: [JslibServicesModule],
  declarations: [],
  // Do not register your dependency here! Add it to the typesafeProviders array using the helper function
  providers: safeProviders,
})
export class ServicesModule {}

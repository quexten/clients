import { APP_INITIALIZER, NgModule } from "@angular/core";
import { Subject, merge } from "rxjs";

import { OrganizationUserApiService } from "@bitwarden/admin-console/common";
import { SafeProvider, safeProvider } from "@bitwarden/angular/platform/utils/safe-provider";
import {
  SECURE_STORAGE,
  LOCALES_DIRECTORY,
  SYSTEM_LANGUAGE,
  MEMORY_STORAGE,
  OBSERVABLE_MEMORY_STORAGE,
  OBSERVABLE_DISK_STORAGE,
  WINDOW,
  SUPPORTS_SECURE_STORAGE,
  SYSTEM_THEME_OBSERVABLE,
  SafeInjectionToken,
  DEFAULT_VAULT_TIMEOUT,
  INTRAPROCESS_MESSAGING_SUBJECT,
  CLIENT_TYPE,
} from "@bitwarden/angular/services/injection-tokens";
import { JslibServicesModule } from "@bitwarden/angular/services/jslib-services.module";
import {
  LoginComponentService,
  SetPasswordJitService,
  LockComponentService,
} from "@bitwarden/auth/angular";
import {
  InternalUserDecryptionOptionsServiceAbstraction,
  LoginEmailService,
  PinServiceAbstraction,
} from "@bitwarden/auth/common";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { VaultTimeoutSettingsService } from "@bitwarden/common/abstractions/vault-timeout/vault-timeout-settings.service";
import { OrganizationApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/organization/organization-api.service.abstraction";
import { PolicyService as PolicyServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import {
  AccountService,
  AccountService as AccountServiceAbstraction,
} from "@bitwarden/common/auth/abstractions/account.service";
import {
  AuthService,
  AuthService as AuthServiceAbstraction,
} from "@bitwarden/common/auth/abstractions/auth.service";
import {
  KdfConfigService,
  KdfConfigService as KdfConfigServiceAbstraction,
} from "@bitwarden/common/auth/abstractions/kdf-config.service";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/auth/abstractions/master-password.service.abstraction";
import { SsoLoginServiceAbstraction } from "@bitwarden/common/auth/abstractions/sso-login.service.abstraction";
import { AutofillSettingsServiceAbstraction } from "@bitwarden/common/autofill/services/autofill-settings.service";
import { ClientType } from "@bitwarden/common/enums";
import { ProcessReloadServiceAbstraction } from "@bitwarden/common/key-management/abstractions/process-reload.service";
import { ProcessReloadService } from "@bitwarden/common/key-management/services/process-reload.service";
import { CryptoFunctionService as CryptoFunctionServiceAbstraction } from "@bitwarden/common/platform/abstractions/crypto-function.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { FileDownloadService } from "@bitwarden/common/platform/abstractions/file-download/file-download.service";
import { I18nService as I18nServiceAbstraction } from "@bitwarden/common/platform/abstractions/i18n.service";
import { KeyGenerationService as KeyGenerationServiceAbstraction } from "@bitwarden/common/platform/abstractions/key-generation.service";
import {
  LogService,
  LogService as LogServiceAbstraction,
} from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService as MessagingServiceAbstraction } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService as PlatformUtilsServiceAbstraction } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { SdkClientFactory } from "@bitwarden/common/platform/abstractions/sdk/sdk-client-factory";
import { StateService as StateServiceAbstraction } from "@bitwarden/common/platform/abstractions/state.service";
import { AbstractStorageService } from "@bitwarden/common/platform/abstractions/storage.service";
import { SystemService as SystemServiceAbstraction } from "@bitwarden/common/platform/abstractions/system.service";
import { Message, MessageListener, MessageSender } from "@bitwarden/common/platform/messaging";
// eslint-disable-next-line no-restricted-imports -- Used for dependency injection
import { SubjectMessageSender } from "@bitwarden/common/platform/messaging/internal";
import { TaskSchedulerService } from "@bitwarden/common/platform/scheduling";
import { MemoryStorageService } from "@bitwarden/common/platform/services/memory-storage.service";
import { DefaultSdkClientFactory } from "@bitwarden/common/platform/services/sdk/default-sdk-client-factory";
import { NoopSdkClientFactory } from "@bitwarden/common/platform/services/sdk/noop-sdk-client-factory";
import { SystemService } from "@bitwarden/common/platform/services/system.service";
import { GlobalStateProvider, StateProvider } from "@bitwarden/common/platform/state";
// eslint-disable-next-line import/no-restricted-paths -- Implementation for memory storage
import { MemoryStorageService as MemoryStorageServiceForStateProviders } from "@bitwarden/common/platform/state/storage/memory-storage.service";
import { ThemeStateService } from "@bitwarden/common/platform/theming/theme-state.service";
import { VaultTimeoutStringType } from "@bitwarden/common/types/vault-timeout.type";
import { CipherService as CipherServiceAbstraction } from "@bitwarden/common/vault/abstractions/cipher.service";
import { DialogService, ToastService } from "@bitwarden/components";
import { PasswordGenerationServiceAbstraction } from "@bitwarden/generator-legacy";
import {
  KeyService,
  KeyService as KeyServiceAbstraction,
  BiometricStateService,
  BiometricsService,
} from "@bitwarden/key-management";

import { DesktopLoginComponentService } from "../../auth/login/desktop-login-component.service";
import { DesktopAutofillSettingsService } from "../../autofill/services/desktop-autofill-settings.service";
import { ElectronBiometricsService } from "../../key-management/biometrics/electron-biometrics.service";
import { flagEnabled } from "../../platform/flags";
import { DesktopSettingsService } from "../../platform/services/desktop-settings.service";
import { ElectronKeyService } from "../../platform/services/electron-key.service";
import { ElectronLogRendererService } from "../../platform/services/electron-log.renderer.service";
import {
  ELECTRON_SUPPORTS_SECURE_STORAGE,
  ElectronPlatformUtilsService,
} from "../../platform/services/electron-platform-utils.service";
import { ElectronRendererMessageSender } from "../../platform/services/electron-renderer-message.sender";
import { ElectronRendererSecureStorageService } from "../../platform/services/electron-renderer-secure-storage.service";
import { ElectronRendererStorageService } from "../../platform/services/electron-renderer-storage.service";
import { I18nRendererService } from "../../platform/services/i18n.renderer.service";
import { fromIpcMessaging } from "../../platform/utils/from-ipc-messaging";
import { fromIpcSystemTheme } from "../../platform/utils/from-ipc-system-theme";
import { DesktopLockComponentService } from "../../services/desktop-lock-component.service";
import { EncryptedMessageHandlerService } from "../../services/encrypted-message-handler.service";
import { NativeMessageHandlerService } from "../../services/native-message-handler.service";
import { NativeMessagingService } from "../../services/native-messaging.service";
import { SearchBarService } from "../layout/search/search-bar.service";

import { DesktopFileDownloadService } from "./desktop-file-download.service";
import { DesktopSetPasswordJitService } from "./desktop-set-password-jit.service";
import { DesktopThemeStateService } from "./desktop-theme.service";
import { InitService } from "./init.service";
import { NativeMessagingManifestService } from "./native-messaging-manifest.service";
import { RendererCryptoFunctionService } from "./renderer-crypto-function.service";

const RELOAD_CALLBACK = new SafeInjectionToken<() => any>("RELOAD_CALLBACK");

/**
 * Provider definitions used in the ngModule.
 * Add your provider definition here using the safeProvider function as a wrapper. This will give you type safety.
 * If you need help please ask for it, do NOT change the type of this array.
 */
const safeProviders: SafeProvider[] = [
  safeProvider(InitService),
  safeProvider({
    provide: BiometricsService,
    useClass: ElectronBiometricsService,
    deps: [],
  }),
  safeProvider(NativeMessagingService),
  safeProvider(SearchBarService),
  safeProvider(DialogService),
  safeProvider({
    provide: APP_INITIALIZER as SafeInjectionToken<() => void>,
    useFactory: (initService: InitService) => initService.init(),
    deps: [InitService],
    multi: true,
  }),
  safeProvider({
    provide: RELOAD_CALLBACK,
    useValue: null,
  }),
  safeProvider({
    provide: LogServiceAbstraction,
    useClass: ElectronLogRendererService,
    deps: [],
  }),
  safeProvider({
    provide: PlatformUtilsServiceAbstraction,
    useClass: ElectronPlatformUtilsService,
    deps: [I18nServiceAbstraction, MessagingServiceAbstraction],
  }),
  safeProvider({
    // We manually override the value of SUPPORTS_SECURE_STORAGE here to avoid
    // the TokenService having to inject the PlatformUtilsService which introduces a
    // circular dependency on Desktop only.
    provide: SUPPORTS_SECURE_STORAGE,
    useValue: ELECTRON_SUPPORTS_SECURE_STORAGE,
  }),
  safeProvider({
    provide: DEFAULT_VAULT_TIMEOUT,
    useValue: VaultTimeoutStringType.OnRestart,
  }),
  safeProvider({
    provide: I18nServiceAbstraction,
    useClass: I18nRendererService,
    deps: [SYSTEM_LANGUAGE, LOCALES_DIRECTORY, GlobalStateProvider],
  }),
  safeProvider({
    provide: MessageSender,
    useFactory: (subject: Subject<Message<Record<string, unknown>>>) =>
      MessageSender.combine(
        new ElectronRendererMessageSender(), // Communication with main process
        new SubjectMessageSender(subject), // Communication with ourself
      ),
    deps: [INTRAPROCESS_MESSAGING_SUBJECT],
  }),
  safeProvider({
    provide: MessageListener,
    useFactory: (subject: Subject<Message<Record<string, unknown>>>) =>
      new MessageListener(
        merge(
          subject.asObservable(), // For messages from the same context
          fromIpcMessaging(), // For messages from the main process
        ),
      ),
    deps: [INTRAPROCESS_MESSAGING_SUBJECT],
  }),
  safeProvider({
    provide: AbstractStorageService,
    useClass: ElectronRendererStorageService,
    deps: [],
  }),
  safeProvider({
    provide: SECURE_STORAGE,
    useClass: ElectronRendererSecureStorageService,
    deps: [],
  }),
  safeProvider({ provide: MEMORY_STORAGE, useClass: MemoryStorageService, deps: [] }),
  safeProvider({
    provide: OBSERVABLE_MEMORY_STORAGE,
    useClass: MemoryStorageServiceForStateProviders,
    deps: [],
  }),
  safeProvider({ provide: OBSERVABLE_DISK_STORAGE, useExisting: AbstractStorageService }),
  safeProvider({
    provide: SystemServiceAbstraction,
    useClass: SystemService,
    deps: [
      PlatformUtilsServiceAbstraction,
      AutofillSettingsServiceAbstraction,
      TaskSchedulerService,
    ],
  }),
  safeProvider({
    provide: ProcessReloadServiceAbstraction,
    useClass: ProcessReloadService,
    deps: [
      PinServiceAbstraction,
      MessagingServiceAbstraction,
      RELOAD_CALLBACK,
      VaultTimeoutSettingsService,
      BiometricStateService,
      AccountServiceAbstraction,
    ],
  }),
  safeProvider({
    provide: FileDownloadService,
    useClass: DesktopFileDownloadService,
    deps: [],
  }),
  safeProvider({
    provide: SYSTEM_THEME_OBSERVABLE,
    useFactory: () => fromIpcSystemTheme(),
    deps: [],
  }),
  safeProvider({
    provide: ThemeStateService,
    useClass: DesktopThemeStateService,
    deps: [GlobalStateProvider],
  }),
  safeProvider({
    provide: EncryptedMessageHandlerService,
    deps: [
      AccountServiceAbstraction,
      AuthServiceAbstraction,
      CipherServiceAbstraction,
      PolicyServiceAbstraction,
      MessagingServiceAbstraction,
      PasswordGenerationServiceAbstraction,
    ],
  }),
  safeProvider({
    provide: NativeMessageHandlerService,
    deps: [
      StateServiceAbstraction,
      EncryptService,
      CryptoFunctionServiceAbstraction,
      MessagingServiceAbstraction,
      EncryptedMessageHandlerService,
      DialogService,
      DesktopAutofillSettingsService,
    ],
  }),
  safeProvider({
    provide: CryptoFunctionServiceAbstraction,
    useClass: RendererCryptoFunctionService,
    deps: [WINDOW],
  }),
  safeProvider({
    provide: KeyServiceAbstraction,
    useClass: ElectronKeyService,
    deps: [
      PinServiceAbstraction,
      InternalMasterPasswordServiceAbstraction,
      KeyGenerationServiceAbstraction,
      CryptoFunctionServiceAbstraction,
      EncryptService,
      PlatformUtilsServiceAbstraction,
      LogService,
      StateServiceAbstraction,
      AccountServiceAbstraction,
      StateProvider,
      BiometricStateService,
      KdfConfigServiceAbstraction,
    ],
  }),
  safeProvider({
    provide: DesktopSettingsService,
    deps: [StateProvider],
  }),
  safeProvider({
    provide: DesktopAutofillSettingsService,
    deps: [StateProvider],
  }),
  safeProvider({
    provide: NativeMessagingManifestService,
    useClass: NativeMessagingManifestService,
    deps: [],
  }),
  safeProvider({
    provide: LockComponentService,
    useClass: DesktopLockComponentService,
    deps: [],
  }),
  safeProvider({
    provide: CLIENT_TYPE,
    useValue: ClientType.Desktop,
  }),
  safeProvider({
    provide: SetPasswordJitService,
    useClass: DesktopSetPasswordJitService,
    deps: [
      ApiService,
      KeyService,
      EncryptService,
      I18nServiceAbstraction,
      KdfConfigService,
      InternalMasterPasswordServiceAbstraction,
      OrganizationApiServiceAbstraction,
      OrganizationUserApiService,
      InternalUserDecryptionOptionsServiceAbstraction,
    ],
  }),
  safeProvider({
    provide: LoginComponentService,
    useClass: DesktopLoginComponentService,
    deps: [
      CryptoFunctionServiceAbstraction,
      EnvironmentService,
      PasswordGenerationServiceAbstraction,
      PlatformUtilsServiceAbstraction,
      SsoLoginServiceAbstraction,
      I18nServiceAbstraction,
      ToastService,
    ],
  }),
  safeProvider({
    provide: SdkClientFactory,
    useClass: flagEnabled("sdk") ? DefaultSdkClientFactory : NoopSdkClientFactory,
    deps: [],
  }),
  safeProvider({
    provide: LoginEmailService,
    useClass: LoginEmailService,
    deps: [AccountService, AuthService, StateProvider],
  }),
];

@NgModule({
  imports: [JslibServicesModule],
  declarations: [],
  // Do not register your dependency here! Add it to the typesafeProviders array using the helper function
  providers: safeProviders,
})
export class ServicesModule {}

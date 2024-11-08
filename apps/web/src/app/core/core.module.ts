import { CommonModule } from "@angular/common";
import { APP_INITIALIZER, NgModule, Optional, SkipSelf } from "@angular/core";
import { Router } from "@angular/router";

import {
  CollectionAdminService,
  DefaultCollectionAdminService,
  OrganizationUserApiService,
  CollectionService,
} from "@bitwarden/admin-console/common";
import { SafeProvider, safeProvider } from "@bitwarden/angular/platform/utils/safe-provider";
import {
  CLIENT_TYPE,
  DEFAULT_VAULT_TIMEOUT,
  ENV_ADDITIONAL_REGIONS,
  LOCALES_DIRECTORY,
  MEMORY_STORAGE,
  OBSERVABLE_DISK_LOCAL_STORAGE,
  OBSERVABLE_DISK_STORAGE,
  OBSERVABLE_MEMORY_STORAGE,
  SECURE_STORAGE,
  SYSTEM_LANGUAGE,
  SafeInjectionToken,
  WINDOW,
} from "@bitwarden/angular/services/injection-tokens";
import { JslibServicesModule } from "@bitwarden/angular/services/jslib-services.module";
import { ModalService as ModalServiceAbstraction } from "@bitwarden/angular/services/modal.service";
import {
  RegistrationFinishService as RegistrationFinishServiceAbstraction,
  LoginComponentService,
  LockComponentService,
  SetPasswordJitService,
} from "@bitwarden/auth/angular";
import {
  InternalUserDecryptionOptionsServiceAbstraction,
  LoginEmailService,
} from "@bitwarden/auth/common";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { OrganizationApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/organization/organization-api.service.abstraction";
import { PolicyApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/policy/policy-api.service.abstraction";
import {
  InternalPolicyService,
  PolicyService,
} from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { AccountApiService as AccountApiServiceAbstraction } from "@bitwarden/common/auth/abstractions/account-api.service";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { KdfConfigService } from "@bitwarden/common/auth/abstractions/kdf-config.service";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/auth/abstractions/master-password.service.abstraction";
import { SsoLoginServiceAbstraction } from "@bitwarden/common/auth/abstractions/sso-login.service.abstraction";
import { ClientType } from "@bitwarden/common/enums";
import { AppIdService } from "@bitwarden/common/platform/abstractions/app-id.service";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { CryptoFunctionService } from "@bitwarden/common/platform/abstractions/crypto-function.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import {
  EnvironmentService,
  Urls,
} from "@bitwarden/common/platform/abstractions/environment.service";
import { FileDownloadService } from "@bitwarden/common/platform/abstractions/file-download/file-download.service";
import { I18nService as I18nServiceAbstraction } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { SdkClientFactory } from "@bitwarden/common/platform/abstractions/sdk/sdk-client-factory";
import { AbstractStorageService } from "@bitwarden/common/platform/abstractions/storage.service";
import { ThemeType } from "@bitwarden/common/platform/enums";
import { AppIdService as DefaultAppIdService } from "@bitwarden/common/platform/services/app-id.service";
import { MemoryStorageService } from "@bitwarden/common/platform/services/memory-storage.service";
// eslint-disable-next-line import/no-restricted-paths -- Implementation for memory storage
import { MigrationBuilderService } from "@bitwarden/common/platform/services/migration-builder.service";
import { MigrationRunner } from "@bitwarden/common/platform/services/migration-runner";
import { NoopSdkClientFactory } from "@bitwarden/common/platform/services/sdk/noop-sdk-client-factory";
import { StorageServiceProvider } from "@bitwarden/common/platform/services/storage-service.provider";
/* eslint-disable import/no-restricted-paths -- Implementation for memory storage */
import { GlobalStateProvider, StateProvider } from "@bitwarden/common/platform/state";
import { MemoryStorageService as MemoryStorageServiceForStateProviders } from "@bitwarden/common/platform/state/storage/memory-storage.service";
/* eslint-enable import/no-restricted-paths -- Implementation for memory storage */
import { WindowStorageService } from "@bitwarden/common/platform/storage/window-storage.service";
import {
  DefaultThemeStateService,
  ThemeStateService,
} from "@bitwarden/common/platform/theming/theme-state.service";
import { VaultTimeout, VaultTimeoutStringType } from "@bitwarden/common/types/vault-timeout.type";
import { PasswordGenerationServiceAbstraction } from "@bitwarden/generator-legacy";
import { KeyService as KeyServiceAbstraction, BiometricsService } from "@bitwarden/key-management";

import { flagEnabled } from "../../utils/flags";
import { PolicyListService } from "../admin-console/core/policy-list.service";
import {
  WebSetPasswordJitService,
  WebRegistrationFinishService,
  WebLoginComponentService,
  WebLockComponentService,
} from "../auth";
import { AcceptOrganizationInviteService } from "../auth/organization-invite/accept-organization.service";
import { HtmlStorageService } from "../core/html-storage.service";
import { I18nService } from "../core/i18n.service";
import { WebBiometricsService } from "../key-management/web-biometric.service";
import { WebEnvironmentService } from "../platform/web-environment.service";
import { WebMigrationRunner } from "../platform/web-migration-runner";
import { WebSdkClientFactory } from "../platform/web-sdk-client-factory";
import { WebStorageServiceProvider } from "../platform/web-storage-service.provider";

import { EventService } from "./event.service";
import { InitService } from "./init.service";
import { ENV_URLS } from "./injection-tokens";
import { ModalService } from "./modal.service";
import { RouterService } from "./router.service";
import { WebFileDownloadService } from "./web-file-download.service";
import { WebPlatformUtilsService } from "./web-platform-utils.service";

/**
 * Provider definitions used in the ngModule.
 * Add your provider definition here using the safeProvider function as a wrapper. This will give you type safety.
 * If you need help please ask for it, do NOT change the type of this array.
 */
const safeProviders: SafeProvider[] = [
  safeProvider(InitService),
  safeProvider(RouterService),
  safeProvider(EventService),
  safeProvider(PolicyListService),
  safeProvider({
    provide: DEFAULT_VAULT_TIMEOUT,
    deps: [PlatformUtilsService],
    useFactory: (platformUtilsService: PlatformUtilsService): VaultTimeout =>
      platformUtilsService.isDev() ? VaultTimeoutStringType.Never : 15,
  }),
  safeProvider({
    provide: APP_INITIALIZER as SafeInjectionToken<() => void>,
    useFactory: (initService: InitService) => initService.init(),
    deps: [InitService],
    multi: true,
  }),
  safeProvider({
    provide: I18nServiceAbstraction,
    useClass: I18nService,
    deps: [SYSTEM_LANGUAGE, LOCALES_DIRECTORY, GlobalStateProvider],
  }),
  safeProvider({ provide: AbstractStorageService, useClass: HtmlStorageService, deps: [] }),
  safeProvider({
    provide: SECURE_STORAGE,
    // TODO: platformUtilsService.isDev has a helper for this, but using that service here results in a circular dependency.
    // We have a tech debt item in the backlog to break up platformUtilsService, but in the meantime simply checking the environment here is less cumbersome.
    useClass: process.env.NODE_ENV === "development" ? HtmlStorageService : MemoryStorageService,
    deps: [],
  }),
  safeProvider({
    provide: MEMORY_STORAGE,
    useClass: MemoryStorageService,
    deps: [],
  }),
  safeProvider({
    provide: OBSERVABLE_MEMORY_STORAGE,
    useClass: MemoryStorageServiceForStateProviders,
    deps: [],
  }),
  safeProvider({
    provide: OBSERVABLE_DISK_STORAGE,
    useFactory: () => new WindowStorageService(window.sessionStorage),
    deps: [],
  }),
  safeProvider({
    provide: PlatformUtilsService,
    useClass: WebPlatformUtilsService,
    useAngularDecorators: true,
  }),
  safeProvider({
    provide: ModalServiceAbstraction,
    useClass: ModalService,
    useAngularDecorators: true,
  }),
  safeProvider({
    provide: FileDownloadService,
    useClass: WebFileDownloadService,
    useAngularDecorators: true,
  }),
  safeProvider({
    provide: WindowStorageService,
    useFactory: () => new WindowStorageService(window.localStorage),
    deps: [],
  }),
  safeProvider({
    provide: OBSERVABLE_DISK_LOCAL_STORAGE,
    useExisting: WindowStorageService,
  }),
  safeProvider({
    provide: StorageServiceProvider,
    useClass: WebStorageServiceProvider,
    deps: [OBSERVABLE_DISK_STORAGE, OBSERVABLE_MEMORY_STORAGE, OBSERVABLE_DISK_LOCAL_STORAGE],
  }),
  safeProvider({
    provide: MigrationRunner,
    useClass: WebMigrationRunner,
    deps: [AbstractStorageService, LogService, MigrationBuilderService, WindowStorageService],
  }),
  safeProvider({
    provide: ENV_URLS,
    useValue: process.env.URLS as Urls,
  }),
  safeProvider({
    provide: EnvironmentService,
    useClass: WebEnvironmentService,
    deps: [WINDOW, StateProvider, AccountService, ENV_ADDITIONAL_REGIONS, Router, ENV_URLS],
  }),
  safeProvider({
    provide: BiometricsService,
    useClass: WebBiometricsService,
    deps: [],
  }),
  safeProvider({
    provide: ThemeStateService,
    useFactory: (globalStateProvider: GlobalStateProvider, configService: ConfigService) =>
      // Web chooses to have Light as the default theme
      new DefaultThemeStateService(globalStateProvider, configService, ThemeType.Light),
    deps: [GlobalStateProvider, ConfigService],
  }),
  safeProvider({
    provide: CLIENT_TYPE,
    useValue: ClientType.Web,
  }),
  safeProvider({
    provide: RegistrationFinishServiceAbstraction,
    useClass: WebRegistrationFinishService,
    deps: [
      KeyServiceAbstraction,
      AccountApiServiceAbstraction,
      AcceptOrganizationInviteService,
      PolicyApiServiceAbstraction,
      LogService,
      PolicyService,
    ],
  }),
  safeProvider({
    provide: LockComponentService,
    useClass: WebLockComponentService,
    deps: [],
  }),
  safeProvider({
    provide: SetPasswordJitService,
    useClass: WebSetPasswordJitService,
    deps: [
      ApiService,
      KeyServiceAbstraction,
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
    provide: AppIdService,
    useClass: DefaultAppIdService,
    deps: [OBSERVABLE_DISK_LOCAL_STORAGE, LogService],
  }),
  safeProvider({
    provide: LoginComponentService,
    useClass: WebLoginComponentService,
    deps: [
      AcceptOrganizationInviteService,
      LogService,
      PolicyApiServiceAbstraction,
      InternalPolicyService,
      RouterService,
      CryptoFunctionService,
      EnvironmentService,
      PasswordGenerationServiceAbstraction,
      PlatformUtilsService,
      SsoLoginServiceAbstraction,
    ],
  }),
  safeProvider({
    provide: CollectionAdminService,
    useClass: DefaultCollectionAdminService,
    deps: [ApiService, KeyServiceAbstraction, EncryptService, CollectionService],
  }),
  safeProvider({
    provide: SdkClientFactory,
    useClass: flagEnabled("sdk") ? WebSdkClientFactory : NoopSdkClientFactory,
    deps: [],
  }),
  safeProvider({
    provide: LoginEmailService,
    useClass: LoginEmailService,
    deps: [AccountService, AuthService, StateProvider],
  }),
];

@NgModule({
  declarations: [],
  imports: [CommonModule, JslibServicesModule],
  // Do not register your dependency here! Add it to the typesafeProviders array using the helper function
  providers: safeProviders,
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule?: CoreModule) {
    if (parentModule) {
      throw new Error("CoreModule is already loaded. Import it in the AppModule only");
    }
  }
}

import { Subject, filter, firstValueFrom, map, merge, timeout } from "rxjs";

import { CollectionService, DefaultCollectionService } from "@bitwarden/admin-console/common";
import {
  AuthRequestService,
  AuthRequestServiceAbstraction,
  DefaultLockService,
  InternalUserDecryptionOptionsServiceAbstraction,
  LoginEmailServiceAbstraction,
  LogoutReason,
  PinService,
  PinServiceAbstraction,
  UserDecryptionOptionsService,
} from "@bitwarden/auth/common";
import { ApiService as ApiServiceAbstraction } from "@bitwarden/common/abstractions/api.service";
import { AuditService as AuditServiceAbstraction } from "@bitwarden/common/abstractions/audit.service";
import { EventCollectionService as EventCollectionServiceAbstraction } from "@bitwarden/common/abstractions/event/event-collection.service";
import { EventUploadService as EventUploadServiceAbstraction } from "@bitwarden/common/abstractions/event/event-upload.service";
import { NotificationsService as NotificationsServiceAbstraction } from "@bitwarden/common/abstractions/notifications.service";
import { SearchService as SearchServiceAbstraction } from "@bitwarden/common/abstractions/search.service";
import { VaultTimeoutSettingsService as VaultTimeoutSettingsServiceAbstraction } from "@bitwarden/common/abstractions/vault-timeout/vault-timeout-settings.service";
import { InternalOrganizationServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { PolicyApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/policy/policy-api.service.abstraction";
import { InternalPolicyService as InternalPolicyServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { ProviderService as ProviderServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/provider.service";
import { OrganizationService } from "@bitwarden/common/admin-console/services/organization/organization.service";
import { PolicyApiService } from "@bitwarden/common/admin-console/services/policy/policy-api.service";
import { PolicyService } from "@bitwarden/common/admin-console/services/policy/policy.service";
import { ProviderService } from "@bitwarden/common/admin-console/services/provider.service";
import { AccountService as AccountServiceAbstraction } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService as AuthServiceAbstraction } from "@bitwarden/common/auth/abstractions/auth.service";
import { AvatarService as AvatarServiceAbstraction } from "@bitwarden/common/auth/abstractions/avatar.service";
import { DeviceTrustServiceAbstraction } from "@bitwarden/common/auth/abstractions/device-trust.service.abstraction";
import { DevicesServiceAbstraction } from "@bitwarden/common/auth/abstractions/devices/devices.service.abstraction";
import { DevicesApiServiceAbstraction } from "@bitwarden/common/auth/abstractions/devices-api.service.abstraction";
import { KdfConfigService as kdfConfigServiceAbstraction } from "@bitwarden/common/auth/abstractions/kdf-config.service";
import { KeyConnectorService as KeyConnectorServiceAbstraction } from "@bitwarden/common/auth/abstractions/key-connector.service";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/auth/abstractions/master-password.service.abstraction";
import { SsoLoginServiceAbstraction } from "@bitwarden/common/auth/abstractions/sso-login.service.abstraction";
import { TokenService as TokenServiceAbstraction } from "@bitwarden/common/auth/abstractions/token.service";
import { UserVerificationApiServiceAbstraction } from "@bitwarden/common/auth/abstractions/user-verification/user-verification-api.service.abstraction";
import { UserVerificationService as UserVerificationServiceAbstraction } from "@bitwarden/common/auth/abstractions/user-verification/user-verification.service.abstraction";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { ForceSetPasswordReason } from "@bitwarden/common/auth/models/domain/force-set-password-reason";
import { AccountServiceImplementation } from "@bitwarden/common/auth/services/account.service";
import { AuthService } from "@bitwarden/common/auth/services/auth.service";
import { AvatarService } from "@bitwarden/common/auth/services/avatar.service";
import { DeviceTrustService } from "@bitwarden/common/auth/services/device-trust.service.implementation";
import { DevicesServiceImplementation } from "@bitwarden/common/auth/services/devices/devices.service.implementation";
import { DevicesApiServiceImplementation } from "@bitwarden/common/auth/services/devices-api.service.implementation";
import { KdfConfigService } from "@bitwarden/common/auth/services/kdf-config.service";
import { KeyConnectorService } from "@bitwarden/common/auth/services/key-connector.service";
import { MasterPasswordService } from "@bitwarden/common/auth/services/master-password/master-password.service";
import { SsoLoginService } from "@bitwarden/common/auth/services/sso-login.service";
import { TokenService } from "@bitwarden/common/auth/services/token.service";
import { UserVerificationApiService } from "@bitwarden/common/auth/services/user-verification/user-verification-api.service";
import { UserVerificationService } from "@bitwarden/common/auth/services/user-verification/user-verification.service";
import {
  AutofillSettingsService,
  AutofillSettingsServiceAbstraction,
} from "@bitwarden/common/autofill/services/autofill-settings.service";
import {
  BadgeSettingsService,
  BadgeSettingsServiceAbstraction,
} from "@bitwarden/common/autofill/services/badge-settings.service";
import {
  DefaultDomainSettingsService,
  DomainSettingsService,
} from "@bitwarden/common/autofill/services/domain-settings.service";
import {
  UserNotificationSettingsService,
  UserNotificationSettingsServiceAbstraction,
} from "@bitwarden/common/autofill/services/user-notification-settings.service";
import { BillingAccountProfileStateService } from "@bitwarden/common/billing/abstractions/account/billing-account-profile-state.service";
import { DefaultBillingAccountProfileStateService } from "@bitwarden/common/billing/services/account/billing-account-profile-state.service";
import { ClientType } from "@bitwarden/common/enums";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ProcessReloadServiceAbstraction } from "@bitwarden/common/key-management/abstractions/process-reload.service";
import { ProcessReloadService } from "@bitwarden/common/key-management/services/process-reload.service";
import { AppIdService as AppIdServiceAbstraction } from "@bitwarden/common/platform/abstractions/app-id.service";
import { ConfigApiServiceAbstraction } from "@bitwarden/common/platform/abstractions/config/config-api.service.abstraction";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { CryptoFunctionService as CryptoFunctionServiceAbstraction } from "@bitwarden/common/platform/abstractions/crypto-function.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { RegionConfig } from "@bitwarden/common/platform/abstractions/environment.service";
import { Fido2ActiveRequestManager as Fido2ActiveRequestManagerAbstraction } from "@bitwarden/common/platform/abstractions/fido2/fido2-active-request-manager.abstraction";
import { Fido2AuthenticatorService as Fido2AuthenticatorServiceAbstraction } from "@bitwarden/common/platform/abstractions/fido2/fido2-authenticator.service.abstraction";
import { Fido2ClientService as Fido2ClientServiceAbstraction } from "@bitwarden/common/platform/abstractions/fido2/fido2-client.service.abstraction";
import { Fido2UserInterfaceService as Fido2UserInterfaceServiceAbstraction } from "@bitwarden/common/platform/abstractions/fido2/fido2-user-interface.service.abstraction";
import { FileUploadService as FileUploadServiceAbstraction } from "@bitwarden/common/platform/abstractions/file-upload/file-upload.service";
import { I18nService as I18nServiceAbstraction } from "@bitwarden/common/platform/abstractions/i18n.service";
import { KeyGenerationService as KeyGenerationServiceAbstraction } from "@bitwarden/common/platform/abstractions/key-generation.service";
import { LogService as LogServiceAbstraction } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService as PlatformUtilsServiceAbstraction } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { SdkService } from "@bitwarden/common/platform/abstractions/sdk/sdk.service";
import { StateService as StateServiceAbstraction } from "@bitwarden/common/platform/abstractions/state.service";
import {
  AbstractStorageService,
  ObservableStorageService,
} from "@bitwarden/common/platform/abstractions/storage.service";
import { SystemService as SystemServiceAbstraction } from "@bitwarden/common/platform/abstractions/system.service";
import { StateFactory } from "@bitwarden/common/platform/factories/state-factory";
import { Message, MessageListener, MessageSender } from "@bitwarden/common/platform/messaging";
// eslint-disable-next-line no-restricted-imports -- Used for dependency creation
import { SubjectMessageSender } from "@bitwarden/common/platform/messaging/internal";
import { Lazy } from "@bitwarden/common/platform/misc/lazy";
import { clearCaches } from "@bitwarden/common/platform/misc/sequentialize";
import { Account } from "@bitwarden/common/platform/models/domain/account";
import { GlobalState } from "@bitwarden/common/platform/models/domain/global-state";
import { SymmetricCryptoKey } from "@bitwarden/common/platform/models/domain/symmetric-crypto-key";
import { ScheduledTaskNames } from "@bitwarden/common/platform/scheduling";
import { AppIdService } from "@bitwarden/common/platform/services/app-id.service";
import { ConfigApiService } from "@bitwarden/common/platform/services/config/config-api.service";
import { DefaultConfigService } from "@bitwarden/common/platform/services/config/default-config.service";
import { ConsoleLogService } from "@bitwarden/common/platform/services/console-log.service";
import { ContainerService } from "@bitwarden/common/platform/services/container.service";
import { BulkEncryptServiceImplementation } from "@bitwarden/common/platform/services/cryptography/bulk-encrypt.service.implementation";
import { EncryptServiceImplementation } from "@bitwarden/common/platform/services/cryptography/encrypt.service.implementation";
import { FallbackBulkEncryptService } from "@bitwarden/common/platform/services/cryptography/fallback-bulk-encrypt.service";
import { MultithreadEncryptServiceImplementation } from "@bitwarden/common/platform/services/cryptography/multithread-encrypt.service.implementation";
import { Fido2ActiveRequestManager } from "@bitwarden/common/platform/services/fido2/fido2-active-request-manager";
import { Fido2AuthenticatorService } from "@bitwarden/common/platform/services/fido2/fido2-authenticator.service";
import { Fido2ClientService } from "@bitwarden/common/platform/services/fido2/fido2-client.service";
import { FileUploadService } from "@bitwarden/common/platform/services/file-upload/file-upload.service";
import { KeyGenerationService } from "@bitwarden/common/platform/services/key-generation.service";
import { MigrationBuilderService } from "@bitwarden/common/platform/services/migration-builder.service";
import { MigrationRunner } from "@bitwarden/common/platform/services/migration-runner";
import { DefaultSdkService } from "@bitwarden/common/platform/services/sdk/default-sdk.service";
import { NoopSdkClientFactory } from "@bitwarden/common/platform/services/sdk/noop-sdk-client-factory";
import { StateService } from "@bitwarden/common/platform/services/state.service";
import { SystemService } from "@bitwarden/common/platform/services/system.service";
import { UserAutoUnlockKeyService } from "@bitwarden/common/platform/services/user-auto-unlock-key.service";
import { WebCryptoFunctionService } from "@bitwarden/common/platform/services/web-crypto-function.service";
import {
  ActiveUserStateProvider,
  DerivedStateProvider,
  GlobalStateProvider,
  SingleUserStateProvider,
  StateEventRunnerService,
  StateProvider,
} from "@bitwarden/common/platform/state";
/* eslint-disable import/no-restricted-paths -- We need the implementation to inject, but generally these should not be accessed */
import { DefaultActiveUserStateProvider } from "@bitwarden/common/platform/state/implementations/default-active-user-state.provider";
import { DefaultGlobalStateProvider } from "@bitwarden/common/platform/state/implementations/default-global-state.provider";
import { DefaultSingleUserStateProvider } from "@bitwarden/common/platform/state/implementations/default-single-user-state.provider";
import { DefaultStateProvider } from "@bitwarden/common/platform/state/implementations/default-state.provider";
import { InlineDerivedStateProvider } from "@bitwarden/common/platform/state/implementations/inline-derived-state";
import { StateEventRegistrarService } from "@bitwarden/common/platform/state/state-event-registrar.service";
/* eslint-enable import/no-restricted-paths */
import { PrimarySecondaryStorageService } from "@bitwarden/common/platform/storage/primary-secondary-storage.service";
import { WindowStorageService } from "@bitwarden/common/platform/storage/window-storage.service";
import { SyncService } from "@bitwarden/common/platform/sync";
// eslint-disable-next-line no-restricted-imports -- Needed for service creation
import { DefaultSyncService } from "@bitwarden/common/platform/sync/internal";
import { DefaultThemeStateService } from "@bitwarden/common/platform/theming/theme-state.service";
import { ApiService } from "@bitwarden/common/services/api.service";
import { AuditService } from "@bitwarden/common/services/audit.service";
import { EventCollectionService } from "@bitwarden/common/services/event/event-collection.service";
import { EventUploadService } from "@bitwarden/common/services/event/event-upload.service";
import { NotificationsService } from "@bitwarden/common/services/notifications.service";
import { SearchService } from "@bitwarden/common/services/search.service";
import { VaultTimeoutSettingsService } from "@bitwarden/common/services/vault-timeout/vault-timeout-settings.service";
import {
  PasswordStrengthService,
  PasswordStrengthServiceAbstraction,
} from "@bitwarden/common/tools/password-strength";
import { SendApiService } from "@bitwarden/common/tools/send/services/send-api.service";
import { SendApiService as SendApiServiceAbstraction } from "@bitwarden/common/tools/send/services/send-api.service.abstraction";
import { SendStateProvider } from "@bitwarden/common/tools/send/services/send-state.provider";
import { SendService } from "@bitwarden/common/tools/send/services/send.service";
import { InternalSendService as InternalSendServiceAbstraction } from "@bitwarden/common/tools/send/services/send.service.abstraction";
import { UserId } from "@bitwarden/common/types/guid";
import { VaultTimeoutStringType } from "@bitwarden/common/types/vault-timeout.type";
import { CipherService as CipherServiceAbstraction } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherFileUploadService as CipherFileUploadServiceAbstraction } from "@bitwarden/common/vault/abstractions/file-upload/cipher-file-upload.service";
import { FolderApiServiceAbstraction } from "@bitwarden/common/vault/abstractions/folder/folder-api.service.abstraction";
import { InternalFolderService as InternalFolderServiceAbstraction } from "@bitwarden/common/vault/abstractions/folder/folder.service.abstraction";
import { TotpService as TotpServiceAbstraction } from "@bitwarden/common/vault/abstractions/totp.service";
import { VaultSettingsService as VaultSettingsServiceAbstraction } from "@bitwarden/common/vault/abstractions/vault-settings/vault-settings.service";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import {
  CipherAuthorizationService,
  DefaultCipherAuthorizationService,
} from "@bitwarden/common/vault/services/cipher-authorization.service";
import { CipherService } from "@bitwarden/common/vault/services/cipher.service";
import { CipherFileUploadService } from "@bitwarden/common/vault/services/file-upload/cipher-file-upload.service";
import { FolderApiService } from "@bitwarden/common/vault/services/folder/folder-api.service";
import { FolderService } from "@bitwarden/common/vault/services/folder/folder.service";
import { TotpService } from "@bitwarden/common/vault/services/totp.service";
import { VaultSettingsService } from "@bitwarden/common/vault/services/vault-settings/vault-settings.service";
import {
  PasswordGenerationServiceAbstraction,
  UsernameGenerationServiceAbstraction,
  legacyPasswordGenerationServiceFactory,
  legacyUsernameGenerationServiceFactory,
} from "@bitwarden/generator-legacy";
import {
  ImportApiService,
  ImportApiServiceAbstraction,
  ImportService,
  ImportServiceAbstraction,
} from "@bitwarden/importer/core";
import {
  BiometricStateService,
  BiometricsService,
  DefaultBiometricStateService,
  KeyService as KeyServiceAbstraction,
} from "@bitwarden/key-management";
import {
  IndividualVaultExportService,
  IndividualVaultExportServiceAbstraction,
  OrganizationVaultExportService,
  OrganizationVaultExportServiceAbstraction,
  VaultExportService,
  VaultExportServiceAbstraction,
} from "@bitwarden/vault-export-core";

import { OverlayNotificationsBackground as OverlayNotificationsBackgroundInterface } from "../autofill/background/abstractions/overlay-notifications.background";
import { OverlayBackground as OverlayBackgroundInterface } from "../autofill/background/abstractions/overlay.background";
import { AutoSubmitLoginBackground } from "../autofill/background/auto-submit-login.background";
import ContextMenusBackground from "../autofill/background/context-menus.background";
import NotificationBackground from "../autofill/background/notification.background";
import { OverlayNotificationsBackground } from "../autofill/background/overlay-notifications.background";
import { OverlayBackground } from "../autofill/background/overlay.background";
import TabsBackground from "../autofill/background/tabs.background";
import WebRequestBackground from "../autofill/background/web-request.background";
import { CipherContextMenuHandler } from "../autofill/browser/cipher-context-menu-handler";
import { ContextMenuClickedHandler } from "../autofill/browser/context-menu-clicked-handler";
import { MainContextMenuHandler } from "../autofill/browser/main-context-menu-handler";
import LegacyOverlayBackground from "../autofill/deprecated/background/overlay.background.deprecated";
import { Fido2Background as Fido2BackgroundAbstraction } from "../autofill/fido2/background/abstractions/fido2.background";
import { Fido2Background } from "../autofill/fido2/background/fido2.background";
import { BrowserFido2UserInterfaceService } from "../autofill/fido2/services/browser-fido2-user-interface.service";
import { AutofillService as AutofillServiceAbstraction } from "../autofill/services/abstractions/autofill.service";
import AutofillService from "../autofill/services/autofill.service";
import { InlineMenuFieldQualificationService } from "../autofill/services/inline-menu-field-qualification.service";
import { SafariApp } from "../browser/safariApp";
import { BackgroundBrowserBiometricsService } from "../key-management/biometrics/background-browser-biometrics.service";
import { BrowserKeyService } from "../key-management/browser-key.service";
import { BrowserApi } from "../platform/browser/browser-api";
import { flagEnabled } from "../platform/flags";
import { UpdateBadge } from "../platform/listeners/update-badge";
/* eslint-disable no-restricted-imports */
import { ChromeMessageSender } from "../platform/messaging/chrome-message.sender";
/* eslint-enable no-restricted-imports */
import { OffscreenDocumentService } from "../platform/offscreen-document/abstractions/offscreen-document";
import { DefaultOffscreenDocumentService } from "../platform/offscreen-document/offscreen-document.service";
import { BrowserTaskSchedulerService } from "../platform/services/abstractions/browser-task-scheduler.service";
import { BrowserEnvironmentService } from "../platform/services/browser-environment.service";
import BrowserLocalStorageService from "../platform/services/browser-local-storage.service";
import BrowserMemoryStorageService from "../platform/services/browser-memory-storage.service";
import { BrowserScriptInjectorService } from "../platform/services/browser-script-injector.service";
import I18nService from "../platform/services/i18n.service";
import { LocalBackedSessionStorageService } from "../platform/services/local-backed-session-storage.service";
import { BackgroundPlatformUtilsService } from "../platform/services/platform-utils/background-platform-utils.service";
import { BrowserPlatformUtilsService } from "../platform/services/platform-utils/browser-platform-utils.service";
import { PopupViewCacheBackgroundService } from "../platform/services/popup-view-cache-background.service";
import { BrowserSdkClientFactory } from "../platform/services/sdk/browser-sdk-client-factory";
import { BackgroundTaskSchedulerService } from "../platform/services/task-scheduler/background-task-scheduler.service";
import { BackgroundMemoryStorageService } from "../platform/storage/background-memory-storage.service";
import { BrowserStorageServiceProvider } from "../platform/storage/browser-storage-service.provider";
import { OffscreenStorageService } from "../platform/storage/offscreen-storage.service";
import { SyncServiceListener } from "../platform/sync/sync-service.listener";
import { fromChromeRuntimeMessaging } from "../platform/utils/from-chrome-runtime-messaging";
import VaultTimeoutService from "../services/vault-timeout/vault-timeout.service";
import FilelessImporterBackground from "../tools/background/fileless-importer.background";
import { VaultFilterService } from "../vault/services/vault-filter.service";

import CommandsBackground from "./commands.background";
import IdleBackground from "./idle.background";
import { NativeMessagingBackground } from "./nativeMessaging.background";
import RuntimeBackground from "./runtime.background";

export default class MainBackground {
  messagingService: MessageSender;
  storageService: BrowserLocalStorageService;
  secureStorageService: AbstractStorageService;
  memoryStorageService: AbstractStorageService;
  memoryStorageForStateProviders: AbstractStorageService & ObservableStorageService;
  largeObjectMemoryStorageForStateProviders: AbstractStorageService & ObservableStorageService;
  i18nService: I18nServiceAbstraction;
  platformUtilsService: PlatformUtilsServiceAbstraction;
  logService: LogServiceAbstraction;
  keyGenerationService: KeyGenerationServiceAbstraction;
  keyService: KeyServiceAbstraction;
  cryptoFunctionService: CryptoFunctionServiceAbstraction;
  masterPasswordService: InternalMasterPasswordServiceAbstraction;
  tokenService: TokenServiceAbstraction;
  appIdService: AppIdServiceAbstraction;
  apiService: ApiServiceAbstraction;
  environmentService: BrowserEnvironmentService;
  cipherService: CipherServiceAbstraction;
  folderService: InternalFolderServiceAbstraction;
  userDecryptionOptionsService: InternalUserDecryptionOptionsServiceAbstraction;
  collectionService: CollectionService;
  vaultTimeoutService?: VaultTimeoutService;
  vaultTimeoutSettingsService: VaultTimeoutSettingsServiceAbstraction;
  passwordGenerationService: PasswordGenerationServiceAbstraction;
  syncService: SyncService;
  passwordStrengthService: PasswordStrengthServiceAbstraction;
  totpService: TotpServiceAbstraction;
  autofillService: AutofillServiceAbstraction;
  containerService: ContainerService;
  auditService: AuditServiceAbstraction;
  authService: AuthServiceAbstraction;
  loginEmailService: LoginEmailServiceAbstraction;
  importApiService: ImportApiServiceAbstraction;
  importService: ImportServiceAbstraction;
  exportService: VaultExportServiceAbstraction;
  searchService: SearchServiceAbstraction;
  notificationsService: NotificationsServiceAbstraction;
  stateService: StateServiceAbstraction;
  userNotificationSettingsService: UserNotificationSettingsServiceAbstraction;
  autofillSettingsService: AutofillSettingsServiceAbstraction;
  badgeSettingsService: BadgeSettingsServiceAbstraction;
  domainSettingsService: DomainSettingsService;
  systemService: SystemServiceAbstraction;
  processReloadService: ProcessReloadServiceAbstraction;
  eventCollectionService: EventCollectionServiceAbstraction;
  eventUploadService: EventUploadServiceAbstraction;
  policyService: InternalPolicyServiceAbstraction;
  sendService: InternalSendServiceAbstraction;
  sendStateProvider: SendStateProvider;
  fileUploadService: FileUploadServiceAbstraction;
  cipherFileUploadService: CipherFileUploadServiceAbstraction;
  organizationService: InternalOrganizationServiceAbstraction;
  providerService: ProviderServiceAbstraction;
  keyConnectorService: KeyConnectorServiceAbstraction;
  userVerificationService: UserVerificationServiceAbstraction;
  vaultFilterService: VaultFilterService;
  usernameGenerationService: UsernameGenerationServiceAbstraction;
  encryptService: EncryptService;
  bulkEncryptService: FallbackBulkEncryptService;
  folderApiService: FolderApiServiceAbstraction;
  policyApiService: PolicyApiServiceAbstraction;
  sendApiService: SendApiServiceAbstraction;
  userVerificationApiService: UserVerificationApiServiceAbstraction;
  fido2UserInterfaceService: Fido2UserInterfaceServiceAbstraction;
  fido2AuthenticatorService: Fido2AuthenticatorServiceAbstraction;
  fido2ActiveRequestManager: Fido2ActiveRequestManagerAbstraction;
  fido2ClientService: Fido2ClientServiceAbstraction;
  avatarService: AvatarServiceAbstraction;
  mainContextMenuHandler: MainContextMenuHandler;
  cipherContextMenuHandler: CipherContextMenuHandler;
  configService: ConfigService;
  configApiService: ConfigApiServiceAbstraction;
  devicesApiService: DevicesApiServiceAbstraction;
  devicesService: DevicesServiceAbstraction;
  deviceTrustService: DeviceTrustServiceAbstraction;
  authRequestService: AuthRequestServiceAbstraction;
  accountService: AccountServiceAbstraction;
  globalStateProvider: GlobalStateProvider;
  pinService: PinServiceAbstraction;
  singleUserStateProvider: SingleUserStateProvider;
  activeUserStateProvider: ActiveUserStateProvider;
  derivedStateProvider: DerivedStateProvider;
  stateProvider: StateProvider;
  taskSchedulerService: BrowserTaskSchedulerService;
  fido2Background: Fido2BackgroundAbstraction;
  individualVaultExportService: IndividualVaultExportServiceAbstraction;
  organizationVaultExportService: OrganizationVaultExportServiceAbstraction;
  vaultSettingsService: VaultSettingsServiceAbstraction;
  biometricStateService: BiometricStateService;
  biometricsService: BiometricsService;
  stateEventRunnerService: StateEventRunnerService;
  ssoLoginService: SsoLoginServiceAbstraction;
  billingAccountProfileStateService: BillingAccountProfileStateService;
  // eslint-disable-next-line rxjs/no-exposed-subjects -- Needed to give access to services module
  intraprocessMessagingSubject: Subject<Message<Record<string, unknown>>>;
  userAutoUnlockKeyService: UserAutoUnlockKeyService;
  scriptInjectorService: BrowserScriptInjectorService;
  kdfConfigService: kdfConfigServiceAbstraction;
  offscreenDocumentService: OffscreenDocumentService;
  syncServiceListener: SyncServiceListener;
  themeStateService: DefaultThemeStateService;
  autoSubmitLoginBackground: AutoSubmitLoginBackground;
  sdkService: SdkService;
  cipherAuthorizationService: CipherAuthorizationService;

  onUpdatedRan: boolean;
  onReplacedRan: boolean;
  loginToAutoFill: CipherView = null;

  private commandsBackground: CommandsBackground;
  private contextMenusBackground: ContextMenusBackground;
  private idleBackground: IdleBackground;
  private notificationBackground: NotificationBackground;
  private overlayBackground: OverlayBackgroundInterface;
  private overlayNotificationsBackground: OverlayNotificationsBackgroundInterface;
  private filelessImporterBackground: FilelessImporterBackground;
  private runtimeBackground: RuntimeBackground;
  private tabsBackground: TabsBackground;
  private webRequestBackground: WebRequestBackground;

  private syncTimeout: any;
  private isSafari: boolean;
  private nativeMessagingBackground: NativeMessagingBackground;

  private popupViewCacheBackgroundService: PopupViewCacheBackgroundService;

  constructor() {
    // Services
    const lockedCallback = async (userId?: string) => {
      if (this.notificationsService != null) {
        // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.notificationsService.updateConnection(false);
      }
      await this.refreshBadge();
      await this.refreshMenu(true);
      if (this.systemService != null) {
        await this.systemService.clearPendingClipboard();
        await this.processReloadService.startProcessReload(this.authService);
      }
    };

    const logoutCallback = async (logoutReason: LogoutReason, userId?: UserId) =>
      await this.logout(logoutReason, userId);

    const runtimeNativeMessagingBackground = () => this.nativeMessagingBackground;

    const refreshAccessTokenErrorCallback = () => {
      // Send toast to popup
      this.messagingService.send("showToast", {
        type: "error",
        title: this.i18nService.t("errorRefreshingAccessToken"),
        message: this.i18nService.t("errorRefreshingAccessTokenDesc"),
      });
    };

    const isDev = process.env.ENV === "development";
    this.logService = new ConsoleLogService(isDev);
    this.cryptoFunctionService = new WebCryptoFunctionService(self);
    this.keyGenerationService = new KeyGenerationService(this.cryptoFunctionService);
    this.storageService = new BrowserLocalStorageService(this.logService);

    this.intraprocessMessagingSubject = new Subject<Message<Record<string, unknown>>>();

    this.messagingService = MessageSender.combine(
      new SubjectMessageSender(this.intraprocessMessagingSubject),
      new ChromeMessageSender(this.logService),
    );

    const messageListener = new MessageListener(
      merge(
        this.intraprocessMessagingSubject.asObservable(), // For messages from the same context
        fromChromeRuntimeMessaging(), // For messages from other contexts
      ),
    );

    this.offscreenDocumentService = new DefaultOffscreenDocumentService(this.logService);

    this.platformUtilsService = new BackgroundPlatformUtilsService(
      this.messagingService,
      (clipboardValue, clearMs) => this.clearClipboard(clipboardValue, clearMs),
      self,
      this.offscreenDocumentService,
    );

    this.secureStorageService = this.storageService; // secure storage is not supported in browsers, so we use local storage and warn users when it is used

    if (BrowserApi.isManifestVersion(3)) {
      // manifest v3 can reuse the same storage. They are split for v2 due to lacking a good sync mechanism, which isn't true for v3
      this.memoryStorageForStateProviders = new BrowserMemoryStorageService(); // mv3 stores to storage.session
      this.memoryStorageService = this.memoryStorageForStateProviders;
    } else {
      this.memoryStorageForStateProviders = new BackgroundMemoryStorageService(); // mv2 stores to memory
      this.memoryStorageService = this.memoryStorageForStateProviders;
    }

    if (BrowserApi.isManifestVersion(3)) {
      // Creates a session key for mv3 storage of large memory items
      const sessionKey = new Lazy(async () => {
        // Key already in session storage
        const sessionStorage = new BrowserMemoryStorageService();
        const existingKey = await sessionStorage.get<SymmetricCryptoKey>("session-key");
        if (existingKey) {
          if (sessionStorage.valuesRequireDeserialization) {
            return SymmetricCryptoKey.fromJSON(existingKey);
          }
          return existingKey;
        }

        // New key
        const { derivedKey } = await this.keyGenerationService.createKeyWithPurpose(
          128,
          "ephemeral",
          "bitwarden-ephemeral",
        );
        await sessionStorage.save("session-key", derivedKey);
        return derivedKey;
      });

      this.largeObjectMemoryStorageForStateProviders = new LocalBackedSessionStorageService(
        sessionKey,
        this.storageService,
        // For local backed session storage, we expect that the encrypted data on disk will persist longer than the encryption key in memory
        // and failures to decrypt because of that are completely expected. For this reason, we pass in `false` to the `EncryptServiceImplementation`
        // so that MAC failures are not logged.
        new EncryptServiceImplementation(this.cryptoFunctionService, this.logService, false),
        this.platformUtilsService,
        this.logService,
      );
    } else {
      // mv2 stores to the same location
      this.largeObjectMemoryStorageForStateProviders = this.memoryStorageForStateProviders;
    }

    const localStorageStorageService = BrowserApi.isManifestVersion(3)
      ? new OffscreenStorageService(this.offscreenDocumentService)
      : new WindowStorageService(self.localStorage);

    const storageServiceProvider = new BrowserStorageServiceProvider(
      this.storageService,
      this.memoryStorageForStateProviders,
      this.largeObjectMemoryStorageForStateProviders,
      new PrimarySecondaryStorageService(this.storageService, localStorageStorageService),
    );

    this.globalStateProvider = new DefaultGlobalStateProvider(
      storageServiceProvider,
      this.logService,
    );

    const stateEventRegistrarService = new StateEventRegistrarService(
      this.globalStateProvider,
      storageServiceProvider,
    );

    this.stateEventRunnerService = new StateEventRunnerService(
      this.globalStateProvider,
      storageServiceProvider,
    );

    this.encryptService = BrowserApi.isManifestVersion(2)
      ? new MultithreadEncryptServiceImplementation(
          this.cryptoFunctionService,
          this.logService,
          true,
        )
      : new EncryptServiceImplementation(this.cryptoFunctionService, this.logService, true);

    this.singleUserStateProvider = new DefaultSingleUserStateProvider(
      storageServiceProvider,
      stateEventRegistrarService,
      this.logService,
    );
    this.accountService = new AccountServiceImplementation(
      this.messagingService,
      this.logService,
      this.globalStateProvider,
    );
    this.activeUserStateProvider = new DefaultActiveUserStateProvider(
      this.accountService,
      this.singleUserStateProvider,
    );
    this.derivedStateProvider = new InlineDerivedStateProvider();
    this.stateProvider = new DefaultStateProvider(
      this.activeUserStateProvider,
      this.singleUserStateProvider,
      this.globalStateProvider,
      this.derivedStateProvider,
    );

    this.taskSchedulerService = new BackgroundTaskSchedulerService(
      this.logService,
      this.stateProvider,
    );
    this.taskSchedulerService.registerTaskHandler(ScheduledTaskNames.scheduleNextSyncInterval, () =>
      this.fullSync(),
    );

    this.environmentService = new BrowserEnvironmentService(
      this.logService,
      this.stateProvider,
      this.accountService,
      process.env.ADDITIONAL_REGIONS as unknown as RegionConfig[],
    );
    this.biometricStateService = new DefaultBiometricStateService(this.stateProvider);

    this.userNotificationSettingsService = new UserNotificationSettingsService(this.stateProvider);

    this.tokenService = new TokenService(
      this.singleUserStateProvider,
      this.globalStateProvider,
      this.platformUtilsService.supportsSecureStorage(),
      this.secureStorageService,
      this.keyGenerationService,
      this.encryptService,
      this.logService,
      logoutCallback,
    );

    this.popupViewCacheBackgroundService = new PopupViewCacheBackgroundService(
      messageListener,
      this.globalStateProvider,
    );

    const migrationRunner = new MigrationRunner(
      this.storageService,
      this.logService,
      new MigrationBuilderService(),
      ClientType.Browser,
    );

    this.stateService = new StateService(
      this.storageService,
      this.secureStorageService,
      this.memoryStorageService,
      this.logService,
      new StateFactory(GlobalState, Account),
      this.accountService,
      this.environmentService,
      this.tokenService,
      migrationRunner,
    );

    this.masterPasswordService = new MasterPasswordService(
      this.stateProvider,
      this.stateService,
      this.keyGenerationService,
      this.encryptService,
      this.logService,
    );

    this.i18nService = new I18nService(BrowserApi.getUILanguage(), this.globalStateProvider);

    this.biometricsService = new BackgroundBrowserBiometricsService(
      runtimeNativeMessagingBackground,
    );

    this.kdfConfigService = new KdfConfigService(this.stateProvider);

    this.pinService = new PinService(
      this.accountService,
      this.cryptoFunctionService,
      this.encryptService,
      this.kdfConfigService,
      this.keyGenerationService,
      this.logService,
      this.masterPasswordService,
      this.stateProvider,
      this.stateService,
    );

    this.keyService = new BrowserKeyService(
      this.pinService,
      this.masterPasswordService,
      this.keyGenerationService,
      this.cryptoFunctionService,
      this.encryptService,
      this.platformUtilsService,
      this.logService,
      this.stateService,
      this.accountService,
      this.stateProvider,
      this.biometricStateService,
      this.biometricsService,
      this.kdfConfigService,
    );

    this.appIdService = new AppIdService(this.storageService, this.logService);

    this.userDecryptionOptionsService = new UserDecryptionOptionsService(this.stateProvider);
    this.organizationService = new OrganizationService(this.stateProvider);
    this.policyService = new PolicyService(this.stateProvider, this.organizationService);

    this.vaultTimeoutSettingsService = new VaultTimeoutSettingsService(
      this.accountService,
      this.pinService,
      this.userDecryptionOptionsService,
      this.keyService,
      this.tokenService,
      this.policyService,
      this.biometricStateService,
      this.stateProvider,
      this.logService,
      VaultTimeoutStringType.OnRestart, // default vault timeout
    );

    this.apiService = new ApiService(
      this.tokenService,
      this.platformUtilsService,
      this.environmentService,
      this.appIdService,
      refreshAccessTokenErrorCallback,
      this.logService,
      (logoutReason: LogoutReason, userId?: UserId) => this.logout(logoutReason, userId),
      this.vaultTimeoutSettingsService,
    );

    this.domainSettingsService = new DefaultDomainSettingsService(this.stateProvider);
    this.fileUploadService = new FileUploadService(this.logService);
    this.cipherFileUploadService = new CipherFileUploadService(
      this.apiService,
      this.fileUploadService,
    );
    this.searchService = new SearchService(this.logService, this.i18nService, this.stateProvider);

    this.collectionService = new DefaultCollectionService(
      this.keyService,
      this.encryptService,
      this.i18nService,
      this.stateProvider,
    );

    this.autofillSettingsService = new AutofillSettingsService(
      this.stateProvider,
      this.policyService,
    );
    this.badgeSettingsService = new BadgeSettingsService(this.stateProvider);
    this.policyApiService = new PolicyApiService(this.policyService, this.apiService);
    this.keyConnectorService = new KeyConnectorService(
      this.accountService,
      this.masterPasswordService,
      this.keyService,
      this.apiService,
      this.tokenService,
      this.logService,
      this.organizationService,
      this.keyGenerationService,
      logoutCallback,
      this.stateProvider,
    );

    const sdkClientFactory = flagEnabled("sdk")
      ? new BrowserSdkClientFactory()
      : new NoopSdkClientFactory();
    this.sdkService = new DefaultSdkService(
      sdkClientFactory,
      this.environmentService,
      this.platformUtilsService,
      this.accountService,
      this.kdfConfigService,
      this.keyService,
      this.apiService,
    );

    this.passwordStrengthService = new PasswordStrengthService();

    this.passwordGenerationService = legacyPasswordGenerationServiceFactory(
      this.encryptService,
      this.keyService,
      this.policyService,
      this.accountService,
      this.stateProvider,
    );

    this.userDecryptionOptionsService = new UserDecryptionOptionsService(this.stateProvider);

    this.devicesApiService = new DevicesApiServiceImplementation(this.apiService);
    this.deviceTrustService = new DeviceTrustService(
      this.keyGenerationService,
      this.cryptoFunctionService,
      this.keyService,
      this.encryptService,
      this.appIdService,
      this.devicesApiService,
      this.i18nService,
      this.platformUtilsService,
      this.stateProvider,
      this.secureStorageService,
      this.userDecryptionOptionsService,
      this.logService,
      this.configService,
    );

    this.devicesService = new DevicesServiceImplementation(this.devicesApiService);

    this.authRequestService = new AuthRequestService(
      this.appIdService,
      this.accountService,
      this.masterPasswordService,
      this.keyService,
      this.encryptService,
      this.apiService,
      this.stateProvider,
    );

    this.authService = new AuthService(
      this.accountService,
      this.messagingService,
      this.keyService,
      this.apiService,
      this.stateService,
      this.tokenService,
    );

    this.billingAccountProfileStateService = new DefaultBillingAccountProfileStateService(
      this.stateProvider,
    );

    this.ssoLoginService = new SsoLoginService(this.stateProvider);

    this.userVerificationApiService = new UserVerificationApiService(this.apiService);

    this.configApiService = new ConfigApiService(this.apiService, this.tokenService);

    this.configService = new DefaultConfigService(
      this.configApiService,
      this.environmentService,
      this.logService,
      this.stateProvider,
      this.authService,
    );

    this.themeStateService = new DefaultThemeStateService(
      this.globalStateProvider,
      this.configService,
    );

    this.bulkEncryptService = new FallbackBulkEncryptService(this.encryptService);

    this.cipherService = new CipherService(
      this.keyService,
      this.domainSettingsService,
      this.apiService,
      this.i18nService,
      this.searchService,
      this.stateService,
      this.autofillSettingsService,
      this.encryptService,
      this.bulkEncryptService,
      this.cipherFileUploadService,
      this.configService,
      this.stateProvider,
      this.accountService,
    );
    this.folderService = new FolderService(
      this.keyService,
      this.encryptService,
      this.i18nService,
      this.cipherService,
      this.stateProvider,
    );
    this.folderApiService = new FolderApiService(this.folderService, this.apiService);

    this.userVerificationService = new UserVerificationService(
      this.keyService,
      this.accountService,
      this.masterPasswordService,
      this.i18nService,
      this.userVerificationApiService,
      this.userDecryptionOptionsService,
      this.pinService,
      this.logService,
      this.vaultTimeoutSettingsService,
      this.platformUtilsService,
      this.kdfConfigService,
    );

    this.vaultFilterService = new VaultFilterService(
      this.organizationService,
      this.folderService,
      this.cipherService,
      this.collectionService,
      this.policyService,
      this.stateProvider,
      this.accountService,
    );

    this.vaultSettingsService = new VaultSettingsService(this.stateProvider);

    this.vaultTimeoutService = new VaultTimeoutService(
      this.accountService,
      this.masterPasswordService,
      this.cipherService,
      this.folderService,
      this.collectionService,
      this.platformUtilsService,
      this.messagingService,
      this.searchService,
      this.stateService,
      this.authService,
      this.vaultTimeoutSettingsService,
      this.stateEventRunnerService,
      this.taskSchedulerService,
      this.logService,
      lockedCallback,
      logoutCallback,
    );
    this.containerService = new ContainerService(this.keyService, this.encryptService);

    this.sendStateProvider = new SendStateProvider(this.stateProvider);
    this.sendService = new SendService(
      this.keyService,
      this.i18nService,
      this.keyGenerationService,
      this.sendStateProvider,
      this.encryptService,
    );
    this.sendApiService = new SendApiService(
      this.apiService,
      this.fileUploadService,
      this.sendService,
    );

    this.avatarService = new AvatarService(this.apiService, this.stateProvider);

    this.providerService = new ProviderService(this.stateProvider);

    this.syncService = new DefaultSyncService(
      this.masterPasswordService,
      this.accountService,
      this.apiService,
      this.domainSettingsService,
      this.folderService,
      this.cipherService,
      this.keyService,
      this.collectionService,
      this.messagingService,
      this.policyService,
      this.sendService,
      this.logService,
      this.keyConnectorService,
      this.stateService,
      this.providerService,
      this.folderApiService,
      this.organizationService,
      this.sendApiService,
      this.userDecryptionOptionsService,
      this.avatarService,
      logoutCallback,
      this.billingAccountProfileStateService,
      this.tokenService,
      this.authService,
      this.stateProvider,
    );

    this.syncServiceListener = new SyncServiceListener(
      this.syncService,
      messageListener,
      this.messagingService,
      this.logService,
    );

    this.eventUploadService = new EventUploadService(
      this.apiService,
      this.stateProvider,
      this.logService,
      this.authService,
      this.taskSchedulerService,
    );
    this.eventCollectionService = new EventCollectionService(
      this.cipherService,
      this.stateProvider,
      this.organizationService,
      this.eventUploadService,
      this.authService,
      this.accountService,
    );
    this.totpService = new TotpService(this.cryptoFunctionService, this.logService);

    this.scriptInjectorService = new BrowserScriptInjectorService(
      this.platformUtilsService,
      this.logService,
    );
    this.autofillService = new AutofillService(
      this.cipherService,
      this.autofillSettingsService,
      this.totpService,
      this.eventCollectionService,
      this.logService,
      this.domainSettingsService,
      this.userVerificationService,
      this.billingAccountProfileStateService,
      this.scriptInjectorService,
      this.accountService,
      this.authService,
      this.configService,
      this.userNotificationSettingsService,
      messageListener,
    );
    this.auditService = new AuditService(this.cryptoFunctionService, this.apiService);

    this.importApiService = new ImportApiService(this.apiService);

    this.importService = new ImportService(
      this.cipherService,
      this.folderService,
      this.importApiService,
      this.i18nService,
      this.collectionService,
      this.keyService,
      this.encryptService,
      this.pinService,
      this.accountService,
    );

    this.individualVaultExportService = new IndividualVaultExportService(
      this.folderService,
      this.cipherService,
      this.pinService,
      this.keyService,
      this.encryptService,
      this.cryptoFunctionService,
      this.kdfConfigService,
      this.accountService,
    );

    this.organizationVaultExportService = new OrganizationVaultExportService(
      this.cipherService,
      this.apiService,
      this.pinService,
      this.keyService,
      this.encryptService,
      this.cryptoFunctionService,
      this.collectionService,
      this.kdfConfigService,
      this.accountService,
    );

    this.exportService = new VaultExportService(
      this.individualVaultExportService,
      this.organizationVaultExportService,
    );

    this.notificationsService = new NotificationsService(
      this.logService,
      this.syncService,
      this.appIdService,
      this.apiService,
      this.environmentService,
      logoutCallback,
      this.stateService,
      this.authService,
      this.messagingService,
      this.taskSchedulerService,
    );

    this.fido2UserInterfaceService = new BrowserFido2UserInterfaceService(this.authService);
    this.fido2AuthenticatorService = new Fido2AuthenticatorService(
      this.cipherService,
      this.fido2UserInterfaceService,
      this.syncService,
      this.accountService,
      this.logService,
    );
    this.fido2ActiveRequestManager = new Fido2ActiveRequestManager();
    this.fido2ClientService = new Fido2ClientService(
      this.fido2AuthenticatorService,
      this.configService,
      this.authService,
      this.vaultSettingsService,
      this.domainSettingsService,
      this.taskSchedulerService,
      this.fido2ActiveRequestManager,
      this.logService,
    );

    const systemUtilsServiceReloadCallback = async () => {
      await this.taskSchedulerService.clearAllScheduledTasks();
      if (this.platformUtilsService.isSafari()) {
        // If we do `chrome.runtime.reload` on safari they will send an onInstalled reason of install
        // and that prompts us to show a new tab, this apparently doesn't happen on sideloaded
        // extensions and only shows itself production scenarios. See: https://bitwarden.atlassian.net/browse/PM-12298
        self.location.reload();
        return;
      }

      BrowserApi.reloadExtension();
    };

    this.systemService = new SystemService(
      this.platformUtilsService,
      this.autofillSettingsService,
      this.taskSchedulerService,
    );

    this.processReloadService = new ProcessReloadService(
      this.pinService,
      this.messagingService,
      systemUtilsServiceReloadCallback,
      this.vaultTimeoutSettingsService,
      this.biometricStateService,
      this.accountService,
    );

    // Other fields
    this.isSafari = this.platformUtilsService.isSafari();

    // Background

    this.fido2Background = new Fido2Background(
      this.logService,
      this.fido2ActiveRequestManager,
      this.fido2ClientService,
      this.vaultSettingsService,
      this.scriptInjectorService,
      this.configService,
      this.authService,
    );

    const lockService = new DefaultLockService(this.accountService, this.vaultTimeoutService);

    this.runtimeBackground = new RuntimeBackground(
      this,
      this.autofillService,
      this.platformUtilsService as BrowserPlatformUtilsService,
      this.notificationsService,
      this.autofillSettingsService,
      this.processReloadService,
      this.environmentService,
      this.messagingService,
      this.logService,
      this.configService,
      messageListener,
      this.accountService,
      lockService,
    );
    this.nativeMessagingBackground = new NativeMessagingBackground(
      this.keyService,
      this.encryptService,
      this.cryptoFunctionService,
      this.runtimeBackground,
      this.messagingService,
      this.appIdService,
      this.platformUtilsService,
      this.logService,
      this.authService,
      this.biometricStateService,
      this.accountService,
    );
    this.commandsBackground = new CommandsBackground(
      this,
      this.platformUtilsService,
      this.vaultTimeoutService,
      this.authService,
      () => this.generatePasswordToClipboard(),
    );
    this.notificationBackground = new NotificationBackground(
      this.autofillService,
      this.cipherService,
      this.authService,
      this.policyService,
      this.folderService,
      this.userNotificationSettingsService,
      this.domainSettingsService,
      this.environmentService,
      this.logService,
      this.themeStateService,
      this.configService,
      this.accountService,
    );

    this.overlayNotificationsBackground = new OverlayNotificationsBackground(
      this.logService,
      this.configService,
      this.notificationBackground,
    );

    this.filelessImporterBackground = new FilelessImporterBackground(
      this.configService,
      this.authService,
      this.policyService,
      this.notificationBackground,
      this.importService,
      this.syncService,
      this.scriptInjectorService,
    );

    this.autoSubmitLoginBackground = new AutoSubmitLoginBackground(
      this.logService,
      this.autofillService,
      this.scriptInjectorService,
      this.authService,
      this.configService,
      this.platformUtilsService,
      this.policyService,
    );

    const contextMenuClickedHandler = new ContextMenuClickedHandler(
      (options) => this.platformUtilsService.copyToClipboard(options.text),
      async (_tab) => {
        const options = (await this.passwordGenerationService.getOptions())?.[0] ?? {};
        const password = await this.passwordGenerationService.generatePassword(options);
        this.platformUtilsService.copyToClipboard(password);
        // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.passwordGenerationService.addHistory(password);
      },
      async (tab, cipher) => {
        this.loginToAutoFill = cipher;
        if (tab == null) {
          return;
        }

        // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        BrowserApi.tabSendMessage(tab, {
          command: "collectPageDetails",
          tab: tab,
          sender: "contextMenu",
        });
      },
      this.authService,
      this.cipherService,
      this.totpService,
      this.eventCollectionService,
      this.userVerificationService,
      this.accountService,
    );

    this.contextMenusBackground = new ContextMenusBackground(contextMenuClickedHandler);

    this.idleBackground = new IdleBackground(
      this.vaultTimeoutService,
      this.notificationsService,
      this.accountService,
      this.vaultTimeoutSettingsService,
    );

    this.usernameGenerationService = legacyUsernameGenerationServiceFactory(
      this.apiService,
      this.i18nService,
      this.keyService,
      this.encryptService,
      this.policyService,
      this.accountService,
      this.stateProvider,
    );

    this.mainContextMenuHandler = new MainContextMenuHandler(
      this.stateService,
      this.autofillSettingsService,
      this.i18nService,
      this.logService,
      this.billingAccountProfileStateService,
    );

    this.cipherContextMenuHandler = new CipherContextMenuHandler(
      this.mainContextMenuHandler,
      this.authService,
      this.cipherService,
    );

    if (chrome.webRequest != null && chrome.webRequest.onAuthRequired != null) {
      this.webRequestBackground = new WebRequestBackground(
        this.platformUtilsService,
        this.cipherService,
        this.authService,
        chrome.webRequest,
      );
    }

    this.userAutoUnlockKeyService = new UserAutoUnlockKeyService(this.keyService);

    this.cipherAuthorizationService = new DefaultCipherAuthorizationService(
      this.collectionService,
      this.organizationService,
    );
  }

  async bootstrap() {
    this.containerService.attachToGlobal(self);

    // Only the "true" background should run migrations
    await this.stateService.init({ runMigrations: true });

    // This is here instead of in in the InitService b/c we don't plan for
    // side effects to run in the Browser InitService.
    const accounts = await firstValueFrom(this.accountService.accounts$);

    const setUserKeyInMemoryPromises = [];
    for (const userId of Object.keys(accounts) as UserId[]) {
      // For each acct, we must await the process of setting the user key in memory
      // if the auto user key is set to avoid race conditions of any code trying to access
      // the user key from mem.
      setUserKeyInMemoryPromises.push(
        this.userAutoUnlockKeyService.setUserKeyInMemoryIfAutoUserKeySet(userId),
      );
    }
    await Promise.all(setUserKeyInMemoryPromises);

    await (this.i18nService as I18nService).init();
    (this.eventUploadService as EventUploadService).init(true);

    this.popupViewCacheBackgroundService.startObservingTabChanges();

    await this.vaultTimeoutService.init(true);
    this.fido2Background.init();
    await this.runtimeBackground.init();
    await this.notificationBackground.init();
    this.overlayNotificationsBackground.init();
    this.filelessImporterBackground.init();
    this.commandsBackground.init();
    this.contextMenusBackground?.init();
    this.idleBackground.init();
    this.webRequestBackground?.startListening();
    this.syncServiceListener?.listener$().subscribe();
    await this.autoSubmitLoginBackground.init();

    if (
      BrowserApi.isManifestVersion(2) &&
      (await this.configService.getFeatureFlag(FeatureFlag.PM4154_BulkEncryptionService))
    ) {
      await this.bulkEncryptService.setFeatureFlagEncryptService(
        new BulkEncryptServiceImplementation(this.cryptoFunctionService, this.logService),
      );
    }

    // If the user is logged out, switch to the next account
    const active = await firstValueFrom(this.accountService.activeAccount$);
    if (active != null) {
      const authStatus = await firstValueFrom(
        this.authService.authStatuses$.pipe(map((statuses) => statuses[active.id])),
      );
      if (authStatus === AuthenticationStatus.LoggedOut) {
        const nextUpAccount = await firstValueFrom(this.accountService.nextUpAccount$);
        await this.switchAccount(nextUpAccount?.id);
      }
    }

    await this.initOverlayAndTabsBackground();

    if (flagEnabled("sdk")) {
      // Warn if the SDK for some reason can't be initialized
      let supported = false;
      let error: Error;
      try {
        supported = await firstValueFrom(this.sdkService.supported$);
      } catch (e) {
        error = e;
      }

      if (!supported) {
        this.sdkService
          .failedToInitialize("background", error)
          .catch((e) => this.logService.error(e));
      }
    }

    return new Promise<void>((resolve) => {
      setTimeout(async () => {
        await this.refreshBadge();
        await this.fullSync(true);
        this.taskSchedulerService.setInterval(
          ScheduledTaskNames.scheduleNextSyncInterval,
          5 * 60 * 1000, // check every 5 minutes
        );
        setTimeout(() => this.notificationsService.init(), 2500);
        await this.taskSchedulerService.verifyAlarmsState();
        resolve();
      }, 500);
    });
  }

  async refreshBadge() {
    await new UpdateBadge(self, this).run();
  }

  async refreshMenu(forLocked = false) {
    if (!chrome.windows || !chrome.contextMenus) {
      return;
    }

    await MainContextMenuHandler.removeAll();

    if (forLocked) {
      await this.mainContextMenuHandler?.noAccess();
      this.onUpdatedRan = this.onReplacedRan = false;
      return;
    }

    await this.mainContextMenuHandler?.init();

    const tab = await BrowserApi.getTabFromCurrentWindow();
    if (tab) {
      await this.cipherContextMenuHandler?.update(tab.url);
      this.onUpdatedRan = this.onReplacedRan = false;
    }
  }

  async updateOverlayCiphers() {
    // overlayBackground null in popup only contexts
    if (this.overlayBackground) {
      await this.overlayBackground.updateOverlayCiphers();
    }
  }

  /**
   * Switch accounts to indicated userId -- null is no active user
   */
  async switchAccount(userId: UserId) {
    let nextAccountStatus: AuthenticationStatus;
    try {
      // HACK to ensure account is switched before proceeding
      const switchPromise = firstValueFrom(
        this.accountService.activeAccount$.pipe(
          filter((account) => (account?.id ?? null) === (userId ?? null)),
          timeout({
            first: 1_000,
            with: () => {
              throw new Error(
                "The account switch process did not complete in a reasonable amount of time.",
              );
            },
          }),
        ),
      );
      await this.popupViewCacheBackgroundService.clearState();
      await this.accountService.switchAccount(userId);
      await switchPromise;
      // Clear sequentialized caches
      clearCaches();

      if (userId == null) {
        await this.refreshBadge();
        await this.refreshMenu();
        await this.updateOverlayCiphers();
        this.messagingService.send("goHome");
        return;
      }

      nextAccountStatus = await this.authService.getAuthStatus(userId);
      const forcePasswordReset =
        (await firstValueFrom(this.masterPasswordService.forceSetPasswordReason$(userId))) !=
        ForceSetPasswordReason.None;

      await this.systemService.clearPendingClipboard();
      await this.notificationsService.updateConnection(false);

      if (nextAccountStatus === AuthenticationStatus.LoggedOut) {
        this.messagingService.send("goHome");
      } else if (nextAccountStatus === AuthenticationStatus.Locked) {
        this.messagingService.send("locked", { userId: userId });
      } else if (forcePasswordReset) {
        this.messagingService.send("update-temp-password", { userId: userId });
      } else {
        this.messagingService.send("unlocked", { userId: userId });
        await this.refreshBadge();
        await this.refreshMenu();
        await this.updateOverlayCiphers();
        await this.syncService.fullSync(false);
      }
    } finally {
      this.messagingService.send("switchAccountFinish", {
        userId: userId,
        status: nextAccountStatus,
      });
    }
  }

  async logout(logoutReason: LogoutReason, userId?: UserId) {
    const activeUserId = await firstValueFrom(
      this.accountService.activeAccount$.pipe(
        map((a) => a?.id),
        timeout({
          first: 2000,
          with: () => {
            throw new Error("No active account found to logout");
          },
        }),
      ),
    );

    const userBeingLoggedOut = userId ?? activeUserId;

    await this.eventUploadService.uploadEvents(userBeingLoggedOut);

    const newActiveUser =
      userBeingLoggedOut === activeUserId
        ? await firstValueFrom(this.accountService.nextUpAccount$.pipe(map((a) => a?.id)))
        : null;

    await this.switchAccount(newActiveUser);

    // HACK: We shouldn't wait for the authentication status to change but instead subscribe to the
    // authentication status to do various actions.
    const logoutPromise = firstValueFrom(
      this.authService.authStatusFor$(userBeingLoggedOut).pipe(
        filter((authenticationStatus) => authenticationStatus === AuthenticationStatus.LoggedOut),
        timeout({
          first: 5_000,
          with: () => {
            throw new Error("The logout process did not complete in a reasonable amount of time.");
          },
        }),
      ),
    );

    await Promise.all([
      this.keyService.clearKeys(userBeingLoggedOut),
      this.cipherService.clear(userBeingLoggedOut),
      this.folderService.clear(userBeingLoggedOut),
      this.collectionService.clear(userBeingLoggedOut),
      this.vaultTimeoutSettingsService.clear(userBeingLoggedOut),
      this.vaultFilterService.clear(),
      this.biometricStateService.logout(userBeingLoggedOut),
      this.popupViewCacheBackgroundService.clearState(),
      /* We intentionally do not clear:
       *  - autofillSettingsService
       *  - badgeSettingsService
       *  - userNotificationSettingsService
       */
    ]);

    //Needs to be checked before state is cleaned
    const needStorageReseed = await this.needsStorageReseed(userBeingLoggedOut);

    await this.stateService.clean({ userId: userBeingLoggedOut });
    await this.accountService.clean(userBeingLoggedOut);

    await this.stateEventRunnerService.handleEvent("logout", userBeingLoggedOut);

    // HACK: Wait for the user logging outs authentication status to transition to LoggedOut
    await logoutPromise;

    this.messagingService.send("doneLoggingOut", {
      logoutReason: logoutReason,
      userId: userBeingLoggedOut,
    });

    if (needStorageReseed) {
      await this.reseedStorage();
    }

    if (BrowserApi.isManifestVersion(3)) {
      // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      BrowserApi.sendMessage("updateBadge");
    }
    await this.refreshBadge();
    await this.mainContextMenuHandler?.noAccess();
    await this.notificationsService.updateConnection(false);
    await this.systemService.clearPendingClipboard();
    await this.processReloadService.startProcessReload(this.authService);
  }

  private async needsStorageReseed(userId: UserId): Promise<boolean> {
    const currentVaultTimeout = await firstValueFrom(
      this.vaultTimeoutSettingsService.getVaultTimeoutByUserId$(userId),
    );
    return currentVaultTimeout == VaultTimeoutStringType.Never ? false : true;
  }

  async collectPageDetailsForContentScript(tab: any, sender: string, frameId: number = null) {
    if (tab == null || !tab.id) {
      return;
    }

    const options: any = {};
    if (frameId != null) {
      options.frameId = frameId;
    }

    // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    BrowserApi.tabSendMessage(
      tab,
      {
        command: "collectPageDetails",
        tab: tab,
        sender: sender,
      },
      options,
    );
  }

  async openPopup() {
    // Chrome APIs cannot open popup

    // TODO: Do we need to open this popup?
    if (!this.isSafari) {
      return;
    }
    await SafariApp.sendMessageToApp("showPopover", null, true);
  }

  async reseedStorage() {
    if (
      !this.platformUtilsService.isChrome() &&
      !this.platformUtilsService.isVivaldi() &&
      !this.platformUtilsService.isOpera()
    ) {
      return;
    }

    await this.storageService.fillBuffer();
  }

  async clearClipboard(clipboardValue: string, clearMs: number) {
    if (this.systemService != null) {
      await this.systemService.clearClipboard(clipboardValue, clearMs);
    }
  }

  private async fullSync(override = false) {
    const syncInternal = 6 * 60 * 60 * 1000; // 6 hours
    const lastSync = await this.syncService.getLastSync();

    let lastSyncAgo = syncInternal + 1;
    if (lastSync != null) {
      lastSyncAgo = new Date().getTime() - lastSync.getTime();
    }

    if (override || lastSyncAgo >= syncInternal) {
      await this.syncService.fullSync(override);
    }
  }

  /**
   * Temporary solution to handle initialization of the overlay background behind a feature flag.
   * Will be reverted to instantiation within the constructor once the feature flag is removed.
   */
  async initOverlayAndTabsBackground() {
    if (
      this.overlayBackground ||
      this.tabsBackground ||
      (await firstValueFrom(this.authService.activeAccountStatus$)) ===
        AuthenticationStatus.LoggedOut
    ) {
      return;
    }

    const inlineMenuPositioningImprovementsEnabled = await this.configService.getFeatureFlag(
      FeatureFlag.InlineMenuPositioningImprovements,
    );

    if (!inlineMenuPositioningImprovementsEnabled) {
      this.overlayBackground = new LegacyOverlayBackground(
        this.cipherService,
        this.autofillService,
        this.authService,
        this.environmentService,
        this.domainSettingsService,
        this.autofillSettingsService,
        this.i18nService,
        this.platformUtilsService,
        this.themeStateService,
      );
    } else {
      const inlineMenuFieldQualificationService = new InlineMenuFieldQualificationService();
      this.overlayBackground = new OverlayBackground(
        this.logService,
        this.cipherService,
        this.autofillService,
        this.authService,
        this.environmentService,
        this.domainSettingsService,
        this.autofillSettingsService,
        this.i18nService,
        this.platformUtilsService,
        this.vaultSettingsService,
        this.fido2ActiveRequestManager,
        inlineMenuFieldQualificationService,
        this.themeStateService,
        this.totpService,
        () => this.generatePassword(),
        (password) => this.addPasswordToHistory(password),
      );
    }

    this.tabsBackground = new TabsBackground(
      this,
      this.notificationBackground,
      this.overlayBackground,
    );

    await this.overlayBackground.init();
    await this.tabsBackground.init();
  }

  generatePassword = async (): Promise<string> => {
    const options = (await this.passwordGenerationService.getOptions())?.[0] ?? {};
    return await this.passwordGenerationService.generatePassword(options);
  };

  generatePasswordToClipboard = async () => {
    const password = await this.generatePassword();
    this.platformUtilsService.copyToClipboard(password);
    await this.addPasswordToHistory(password);
  };

  addPasswordToHistory = async (password: string) => {
    await this.passwordGenerationService.addHistory(password);
  };
}

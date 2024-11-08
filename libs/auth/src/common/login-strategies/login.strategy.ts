import { BehaviorSubject, filter, firstValueFrom, timeout } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { VaultTimeoutSettingsService } from "@bitwarden/common/abstractions/vault-timeout/vault-timeout-settings.service";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { KdfConfigService } from "@bitwarden/common/auth/abstractions/kdf-config.service";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/auth/abstractions/master-password.service.abstraction";
import { TokenService } from "@bitwarden/common/auth/abstractions/token.service";
import { TwoFactorService } from "@bitwarden/common/auth/abstractions/two-factor.service";
import { TwoFactorProviderType } from "@bitwarden/common/auth/enums/two-factor-provider-type";
import { AuthResult } from "@bitwarden/common/auth/models/domain/auth-result";
import { ForceSetPasswordReason } from "@bitwarden/common/auth/models/domain/force-set-password-reason";
import { Argon2KdfConfig, PBKDF2KdfConfig } from "@bitwarden/common/auth/models/domain/kdf-config";
import { DeviceRequest } from "@bitwarden/common/auth/models/request/identity-token/device.request";
import { PasswordTokenRequest } from "@bitwarden/common/auth/models/request/identity-token/password-token.request";
import { SsoTokenRequest } from "@bitwarden/common/auth/models/request/identity-token/sso-token.request";
import { TokenTwoFactorRequest } from "@bitwarden/common/auth/models/request/identity-token/token-two-factor.request";
import { UserApiTokenRequest } from "@bitwarden/common/auth/models/request/identity-token/user-api-token.request";
import { WebAuthnLoginTokenRequest } from "@bitwarden/common/auth/models/request/identity-token/webauthn-login-token.request";
import { IdentityCaptchaResponse } from "@bitwarden/common/auth/models/response/identity-captcha.response";
import { IdentityTokenResponse } from "@bitwarden/common/auth/models/response/identity-token.response";
import { IdentityTwoFactorResponse } from "@bitwarden/common/auth/models/response/identity-two-factor.response";
import { BillingAccountProfileStateService } from "@bitwarden/common/billing/abstractions/account/billing-account-profile-state.service";
import { ClientType } from "@bitwarden/common/enums";
import { VaultTimeoutAction } from "@bitwarden/common/enums/vault-timeout-action.enum";
import { KeysRequest } from "@bitwarden/common/models/request/keys.request";
import { AppIdService } from "@bitwarden/common/platform/abstractions/app-id.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { KdfType } from "@bitwarden/common/platform/enums";
import { Account, AccountProfile } from "@bitwarden/common/platform/models/domain/account";
import { UserId } from "@bitwarden/common/types/guid";
import { KeyService } from "@bitwarden/key-management";

import { InternalUserDecryptionOptionsServiceAbstraction } from "../abstractions/user-decryption-options.service.abstraction";
import {
  UserApiLoginCredentials,
  PasswordLoginCredentials,
  SsoLoginCredentials,
  AuthRequestLoginCredentials,
  WebAuthnLoginCredentials,
} from "../models/domain/login-credentials";
import { UserDecryptionOptions } from "../models/domain/user-decryption-options";
import { CacheData } from "../services/login-strategies/login-strategy.state";

type IdentityResponse = IdentityTokenResponse | IdentityTwoFactorResponse | IdentityCaptchaResponse;

export abstract class LoginStrategyData {
  tokenRequest:
    | UserApiTokenRequest
    | PasswordTokenRequest
    | SsoTokenRequest
    | WebAuthnLoginTokenRequest;
  captchaBypassToken?: string;

  /** User's entered email obtained pre-login. */
  abstract userEnteredEmail?: string;
}

export abstract class LoginStrategy {
  protected abstract cache: BehaviorSubject<LoginStrategyData>;

  constructor(
    protected accountService: AccountService,
    protected masterPasswordService: InternalMasterPasswordServiceAbstraction,
    protected keyService: KeyService,
    protected encryptService: EncryptService,
    protected apiService: ApiService,
    protected tokenService: TokenService,
    protected appIdService: AppIdService,
    protected platformUtilsService: PlatformUtilsService,
    protected messagingService: MessagingService,
    protected logService: LogService,
    protected stateService: StateService,
    protected twoFactorService: TwoFactorService,
    protected userDecryptionOptionsService: InternalUserDecryptionOptionsServiceAbstraction,
    protected billingAccountProfileStateService: BillingAccountProfileStateService,
    protected vaultTimeoutSettingsService: VaultTimeoutSettingsService,
    protected KdfConfigService: KdfConfigService,
  ) {}

  abstract exportCache(): CacheData;

  abstract logIn(
    credentials:
      | UserApiLoginCredentials
      | PasswordLoginCredentials
      | SsoLoginCredentials
      | AuthRequestLoginCredentials
      | WebAuthnLoginCredentials,
  ): Promise<AuthResult>;

  async logInTwoFactor(
    twoFactor: TokenTwoFactorRequest,
    captchaResponse: string = null,
  ): Promise<AuthResult> {
    const data = this.cache.value;
    data.tokenRequest.setTwoFactor(twoFactor);
    this.cache.next(data);
    const [authResult] = await this.startLogIn();
    return authResult;
  }

  protected async startLogIn(): Promise<[AuthResult, IdentityResponse]> {
    await this.twoFactorService.clearSelectedProvider();

    const tokenRequest = this.cache.value.tokenRequest;
    const response = await this.apiService.postIdentityToken(tokenRequest);

    if (response instanceof IdentityTwoFactorResponse) {
      return [await this.processTwoFactorResponse(response), response];
    } else if (response instanceof IdentityCaptchaResponse) {
      return [await this.processCaptchaResponse(response), response];
    } else if (response instanceof IdentityTokenResponse) {
      return [await this.processTokenResponse(response), response];
    }

    throw new Error("Invalid response object.");
  }

  protected async buildDeviceRequest() {
    const appId = await this.appIdService.getAppId();
    return new DeviceRequest(appId, this.platformUtilsService);
  }

  /**
   * Builds the TokenTwoFactorRequest to be used within other login strategies token requests
   * to the server.
   * If the user provided a 2FA token in an already created TokenTwoFactorRequest, it will be used.
   * If not, and the user has previously remembered a 2FA token, it will be used.
   * If neither of these are true, an empty TokenTwoFactorRequest will be returned.
   * @param userProvidedTwoFactor - optional - The 2FA token request provided by the caller
   * @param email - optional - ensure that email is provided for any login strategies that support remember 2FA functionality
   * @returns a promise which resolves to a TokenTwoFactorRequest to be sent to the server
   */
  protected async buildTwoFactor(
    userProvidedTwoFactor?: TokenTwoFactorRequest,
    email?: string,
  ): Promise<TokenTwoFactorRequest> {
    if (userProvidedTwoFactor != null) {
      return userProvidedTwoFactor;
    }

    if (email) {
      const storedTwoFactorToken = await this.tokenService.getTwoFactorToken(email);
      if (storedTwoFactorToken != null) {
        return new TokenTwoFactorRequest(
          TwoFactorProviderType.Remember,
          storedTwoFactorToken,
          false,
        );
      }
    }

    return new TokenTwoFactorRequest();
  }

  /**
   * Initializes the account with information from the IdTokenResponse after successful login.
   * It also sets the access token and refresh token in the token service.
   *
   * @param {IdentityTokenResponse} tokenResponse - The response from the server containing the identity token.
   * @returns {Promise<UserId>} - A promise that resolves the the UserId when the account information has been successfully saved.
   */
  protected async saveAccountInformation(tokenResponse: IdentityTokenResponse): Promise<UserId> {
    const accountInformation = await this.tokenService.decodeAccessToken(tokenResponse.accessToken);
    const userId = accountInformation.sub as UserId;

    await this.accountService.addAccount(userId, {
      name: accountInformation.name,
      email: accountInformation.email,
      emailVerified: accountInformation.email_verified,
    });

    await this.accountService.switchAccount(userId);

    await this.stateService.addAccount(
      new Account({
        profile: {
          ...new AccountProfile(),
          ...{
            userId,
            name: accountInformation.name,
            email: accountInformation.email,
          },
        },
      }),
    );

    await this.verifyAccountAdded(userId);

    // We must set user decryption options before retrieving vault timeout settings
    // as the user decryption options help determine the available timeout actions.
    await this.userDecryptionOptionsService.setUserDecryptionOptions(
      UserDecryptionOptions.fromResponse(tokenResponse),
    );

    const vaultTimeoutAction = await firstValueFrom(
      this.vaultTimeoutSettingsService.getVaultTimeoutActionByUserId$(userId),
    );
    const vaultTimeout = await firstValueFrom(
      this.vaultTimeoutSettingsService.getVaultTimeoutByUserId$(userId),
    );

    // User id will be derived from the access token.
    await this.tokenService.setTokens(
      tokenResponse.accessToken,
      vaultTimeoutAction as VaultTimeoutAction,
      vaultTimeout,
      tokenResponse.refreshToken, // Note: CLI login via API key sends undefined for refresh token.
    );

    await this.KdfConfigService.setKdfConfig(
      userId as UserId,
      tokenResponse.kdf === KdfType.PBKDF2_SHA256
        ? new PBKDF2KdfConfig(tokenResponse.kdfIterations)
        : new Argon2KdfConfig(
            tokenResponse.kdfIterations,
            tokenResponse.kdfMemory,
            tokenResponse.kdfParallelism,
          ),
    );

    await this.billingAccountProfileStateService.setHasPremium(
      accountInformation.premium,
      false,
      userId,
    );
    return userId;
  }

  protected async processTokenResponse(response: IdentityTokenResponse): Promise<AuthResult> {
    const result = new AuthResult();

    // Old encryption keys must be migrated, but is currently only available on web.
    // Other clients shouldn't continue the login process.
    if (this.encryptionKeyMigrationRequired(response)) {
      result.requiresEncryptionKeyMigration = true;
      if (this.platformUtilsService.getClientType() !== ClientType.Web) {
        return result;
      }
    }

    result.resetMasterPassword = response.resetMasterPassword;

    // Convert boolean to enum
    if (response.forcePasswordReset) {
      result.forcePasswordReset = ForceSetPasswordReason.AdminForcePasswordReset;
    }

    // Must come before setting keys, user key needs email to update additional keys
    const userId = await this.saveAccountInformation(response);
    result.userId = userId;

    if (response.twoFactorToken != null) {
      // note: we can read email from access token b/c it was saved in saveAccountInformation
      const userEmail = await this.tokenService.getEmail();

      await this.tokenService.setTwoFactorToken(userEmail, response.twoFactorToken);
    }

    await this.setMasterKey(response, userId);
    await this.setUserKey(response, userId);
    await this.setPrivateKey(response, userId);

    this.messagingService.send("loggedIn");

    return result;
  }

  // The keys comes from different sources depending on the login strategy
  protected abstract setMasterKey(response: IdentityTokenResponse, userId: UserId): Promise<void>;
  protected abstract setUserKey(response: IdentityTokenResponse, userId: UserId): Promise<void>;
  protected abstract setPrivateKey(response: IdentityTokenResponse, userId: UserId): Promise<void>;

  // Old accounts used master key for encryption. We are forcing migrations but only need to
  // check on password logins
  protected encryptionKeyMigrationRequired(response: IdentityTokenResponse): boolean {
    return false;
  }

  protected async createKeyPairForOldAccount(userId: UserId) {
    try {
      const userKey = await this.keyService.getUserKeyWithLegacySupport(userId);
      const [publicKey, privateKey] = await this.keyService.makeKeyPair(userKey);
      await this.apiService.postAccountKeys(new KeysRequest(publicKey, privateKey.encryptedString));
      return privateKey.encryptedString;
    } catch (e) {
      this.logService.error(e);
    }
  }

  /**
   * Handles the response from the server when a 2FA is required.
   * It clears any existing 2FA token, as it's no longer valid, and sets up the necessary data for the 2FA process.
   *
   * @param {IdentityTwoFactorResponse} response - The response from the server indicating that 2FA is required.
   * @returns {Promise<AuthResult>} - A promise that resolves to an AuthResult object
   */
  private async processTwoFactorResponse(response: IdentityTwoFactorResponse): Promise<AuthResult> {
    // If we get a 2FA required response, then we should clear the 2FA token
    // just in case as it is no longer valid.
    await this.clearTwoFactorToken();

    const result = new AuthResult();
    result.twoFactorProviders = response.twoFactorProviders2;

    await this.twoFactorService.setProviders(response);
    this.cache.next({ ...this.cache.value, captchaBypassToken: response.captchaToken ?? null });
    result.ssoEmail2FaSessionToken = response.ssoEmail2faSessionToken;
    result.email = response.email;
    return result;
  }

  /**
   * Clears the 2FA token from the token service using the user's email if it exists
   */
  private async clearTwoFactorToken() {
    const email = this.cache.value.userEnteredEmail;
    if (email) {
      await this.tokenService.clearTwoFactorToken(email);
    }
  }

  private async processCaptchaResponse(response: IdentityCaptchaResponse): Promise<AuthResult> {
    const result = new AuthResult();
    result.captchaSiteKey = response.siteKey;
    return result;
  }

  /**
   * Verifies that the active account is set after initialization.
   * Note: In browser there is a slight delay between when active account emits in background,
   * and when it emits in foreground. We're giving the foreground 1 second to catch up.
   * If nothing is emitted, we throw an error.
   */
  private async verifyAccountAdded(expectedUserId: UserId) {
    await firstValueFrom(
      this.accountService.activeAccount$.pipe(
        filter((account) => account?.id === expectedUserId),
        timeout({
          first: 1000,
          with: () => {
            throw new Error("Expected user never made active user after initialization.");
          },
        }),
      ),
    );
  }
}

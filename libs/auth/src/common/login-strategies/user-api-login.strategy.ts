import { firstValueFrom, BehaviorSubject } from "rxjs";
import { Jsonify } from "type-fest";

import { KeyConnectorService } from "@bitwarden/common/auth/abstractions/key-connector.service";
import { UserApiTokenRequest } from "@bitwarden/common/auth/models/request/identity-token/user-api-token.request";
import { IdentityTokenResponse } from "@bitwarden/common/auth/models/response/identity-token.response";
import { VaultTimeoutAction } from "@bitwarden/common/enums/vault-timeout-action.enum";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { UserId } from "@bitwarden/common/types/guid";

import { UserApiLoginCredentials } from "../models/domain/login-credentials";
import { CacheData } from "../services/login-strategies/login-strategy.state";

import { LoginStrategy, LoginStrategyData } from "./login.strategy";

export class UserApiLoginStrategyData implements LoginStrategyData {
  tokenRequest: UserApiTokenRequest;
  captchaBypassToken: string;

  static fromJSON(obj: Jsonify<UserApiLoginStrategyData>): UserApiLoginStrategyData {
    return Object.assign(new UserApiLoginStrategyData(), obj, {
      tokenRequest: UserApiTokenRequest.fromJSON(obj.tokenRequest),
    });
  }
}

export class UserApiLoginStrategy extends LoginStrategy {
  protected cache: BehaviorSubject<UserApiLoginStrategyData>;

  constructor(
    data: UserApiLoginStrategyData,
    private environmentService: EnvironmentService,
    private keyConnectorService: KeyConnectorService,
    ...sharedDeps: ConstructorParameters<typeof LoginStrategy>
  ) {
    super(...sharedDeps);

    this.cache = new BehaviorSubject(data);
  }

  override async logIn(credentials: UserApiLoginCredentials) {
    const data = new UserApiLoginStrategyData();
    data.tokenRequest = new UserApiTokenRequest(
      credentials.clientId,
      credentials.clientSecret,
      await this.buildTwoFactor(),
      await this.buildDeviceRequest(),
    );
    this.cache.next(data);

    const [authResult] = await this.startLogIn();
    return authResult;
  }

  protected override async setMasterKey(response: IdentityTokenResponse, userId: UserId) {
    if (response.apiUseKeyConnector) {
      const env = await firstValueFrom(this.environmentService.environment$);
      const keyConnectorUrl = env.getKeyConnectorUrl();
      await this.keyConnectorService.setMasterKeyFromUrl(keyConnectorUrl, userId);
    }
  }

  protected override async setUserKey(
    response: IdentityTokenResponse,
    userId: UserId,
  ): Promise<void> {
    await this.keyService.setMasterKeyEncryptedUserKey(response.key, userId);

    if (response.apiUseKeyConnector) {
      const masterKey = await firstValueFrom(this.masterPasswordService.masterKey$(userId));
      if (masterKey) {
        const userKey = await this.masterPasswordService.decryptUserKeyWithMasterKey(
          masterKey,
          userId,
        );
        await this.keyService.setUserKey(userKey, userId);
      }
    }
  }

  protected override async setPrivateKey(
    response: IdentityTokenResponse,
    userId: UserId,
  ): Promise<void> {
    await this.keyService.setPrivateKey(
      response.privateKey ?? (await this.createKeyPairForOldAccount(userId)),
      userId,
    );
  }

  // Overridden to save client ID and secret to token service
  protected async saveAccountInformation(tokenResponse: IdentityTokenResponse): Promise<UserId> {
    const userId = await super.saveAccountInformation(tokenResponse);

    const vaultTimeoutAction = await firstValueFrom(
      this.vaultTimeoutSettingsService.getVaultTimeoutActionByUserId$(userId),
    );
    const vaultTimeout = await firstValueFrom(
      this.vaultTimeoutSettingsService.getVaultTimeoutByUserId$(userId),
    );

    const tokenRequest = this.cache.value.tokenRequest;

    await this.tokenService.setClientId(
      tokenRequest.clientId,
      vaultTimeoutAction as VaultTimeoutAction,
      vaultTimeout,
    );
    await this.tokenService.setClientSecret(
      tokenRequest.clientSecret,
      vaultTimeoutAction as VaultTimeoutAction,
      vaultTimeout,
    );
    return userId;
  }

  exportCache(): CacheData {
    return {
      userApiKey: this.cache.value,
    };
  }
}

import { mock, MockProxy } from "jest-mock-extended";
import { BehaviorSubject, firstValueFrom, of } from "rxjs";

import { KeyService } from "@bitwarden/key-management";
import { BitwardenClient } from "@bitwarden/sdk-internal";

import { ApiService } from "../../../abstractions/api.service";
import { AccountInfo, AccountService } from "../../../auth/abstractions/account.service";
import { KdfConfigService } from "../../../auth/abstractions/kdf-config.service";
import { PBKDF2KdfConfig } from "../../../auth/models/domain/kdf-config";
import { UserId } from "../../../types/guid";
import { UserKey } from "../../../types/key";
import { Environment, EnvironmentService } from "../../abstractions/environment.service";
import { PlatformUtilsService } from "../../abstractions/platform-utils.service";
import { SdkClientFactory } from "../../abstractions/sdk/sdk-client-factory";
import { EncryptedString } from "../../models/domain/enc-string";
import { SymmetricCryptoKey } from "../../models/domain/symmetric-crypto-key";

import { DefaultSdkService } from "./default-sdk.service";

describe("DefaultSdkService", () => {
  describe("userClient$", () => {
    let sdkClientFactory!: MockProxy<SdkClientFactory>;
    let environmentService!: MockProxy<EnvironmentService>;
    let platformUtilsService!: MockProxy<PlatformUtilsService>;
    let accountService!: MockProxy<AccountService>;
    let kdfConfigService!: MockProxy<KdfConfigService>;
    let keyService!: MockProxy<KeyService>;
    let apiService!: MockProxy<ApiService>;
    let service!: DefaultSdkService;

    let mockClient!: MockProxy<BitwardenClient>;

    beforeEach(() => {
      sdkClientFactory = mock<SdkClientFactory>();
      environmentService = mock<EnvironmentService>();
      platformUtilsService = mock<PlatformUtilsService>();
      accountService = mock<AccountService>();
      kdfConfigService = mock<KdfConfigService>();
      keyService = mock<KeyService>();
      apiService = mock<ApiService>();

      // Can't use `of(mock<Environment>())` for some reason
      environmentService.environment$ = new BehaviorSubject(mock<Environment>());

      service = new DefaultSdkService(
        sdkClientFactory,
        environmentService,
        platformUtilsService,
        accountService,
        kdfConfigService,
        keyService,
        apiService,
      );

      mockClient = mock<BitwardenClient>();
      mockClient.crypto.mockReturnValue(mock());
      sdkClientFactory.createSdkClient.mockResolvedValue(mockClient);
    });

    describe("given the user is logged in", () => {
      const userId = "user-id" as UserId;

      beforeEach(() => {
        accountService.accounts$ = of({
          [userId]: { email: "email", emailVerified: true, name: "name" } as AccountInfo,
        });
        kdfConfigService.getKdfConfig$
          .calledWith(userId)
          .mockReturnValue(of(new PBKDF2KdfConfig()));
        keyService.userKey$
          .calledWith(userId)
          .mockReturnValue(of(new SymmetricCryptoKey(new Uint8Array(64)) as UserKey));
        keyService.userEncryptedPrivateKey$
          .calledWith(userId)
          .mockReturnValue(of("private-key" as EncryptedString));
        keyService.encryptedOrgKeys$.calledWith(userId).mockReturnValue(of({}));
      });

      it("creates an SDK client when called the first time", async () => {
        const result = await firstValueFrom(service.userClient$(userId));

        expect(result).toBe(mockClient);
        expect(sdkClientFactory.createSdkClient).toHaveBeenCalled();
      });

      it("does not create an SDK client when called the second time with same userId", async () => {
        const subject_1 = new BehaviorSubject(undefined);
        const subject_2 = new BehaviorSubject(undefined);

        // Use subjects to ensure the subscription is kept alive
        service.userClient$(userId).subscribe(subject_1);
        service.userClient$(userId).subscribe(subject_2);

        // Wait for the next tick to ensure all async operations are done
        await new Promise(process.nextTick);

        expect(subject_1.value).toBe(mockClient);
        expect(subject_2.value).toBe(mockClient);
        expect(sdkClientFactory.createSdkClient).toHaveBeenCalledTimes(1);
      });

      it("destroys the SDK client when all subscriptions are closed", async () => {
        const subject_1 = new BehaviorSubject(undefined);
        const subject_2 = new BehaviorSubject(undefined);
        const subscription_1 = service.userClient$(userId).subscribe(subject_1);
        const subscription_2 = service.userClient$(userId).subscribe(subject_2);
        await new Promise(process.nextTick);

        subscription_1.unsubscribe();
        subscription_2.unsubscribe();

        expect(mockClient.free).toHaveBeenCalledTimes(1);
      });

      it("destroys the SDK client when the userKey is unset (i.e. lock or logout)", async () => {
        const userKey$ = new BehaviorSubject(new SymmetricCryptoKey(new Uint8Array(64)) as UserKey);
        keyService.userKey$.calledWith(userId).mockReturnValue(userKey$);

        const subject = new BehaviorSubject(undefined);
        service.userClient$(userId).subscribe(subject);
        await new Promise(process.nextTick);

        userKey$.next(undefined);
        await new Promise(process.nextTick);

        expect(mockClient.free).toHaveBeenCalledTimes(1);
        expect(subject.value).toBe(undefined);
      });
    });
  });
});

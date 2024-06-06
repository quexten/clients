import { mock } from "jest-mock-extended";
import { bufferCount, firstValueFrom, lastValueFrom, of, take, tap } from "rxjs";

import { PinServiceAbstraction } from "../../../../auth/src/common/abstractions";
import {
  awaitAsync,
  makeEncString,
  makeStaticByteArray,
  makeSymmetricCryptoKey,
} from "../../../spec";
import { FakeAccountService, mockAccountServiceWith } from "../../../spec/fake-account-service";
import { FakeActiveUserState, FakeSingleUserState } from "../../../spec/fake-state";
import { FakeStateProvider } from "../../../spec/fake-state-provider";
import { EncryptedOrganizationKeyData } from "../../admin-console/models/data/encrypted-organization-key.data";
import { KdfConfigService } from "../../auth/abstractions/kdf-config.service";
import { FakeMasterPasswordService } from "../../auth/services/master-password/fake-master-password.service";
import { VAULT_TIMEOUT } from "../../services/vault-timeout/vault-timeout-settings.state";
import { CsprngArray } from "../../types/csprng";
import { OrganizationId, UserId } from "../../types/guid";
import { UserKey, MasterKey } from "../../types/key";
import { VaultTimeoutStringType } from "../../types/vault-timeout.type";
import { CryptoFunctionService } from "../abstractions/crypto-function.service";
import { EncryptService } from "../abstractions/encrypt.service";
import { KeyGenerationService } from "../abstractions/key-generation.service";
import { LogService } from "../abstractions/log.service";
import { PlatformUtilsService } from "../abstractions/platform-utils.service";
import { StateService } from "../abstractions/state.service";
import { Encrypted } from "../interfaces/encrypted";
import { Utils } from "../misc/utils";
import { EncString, EncryptedString } from "../models/domain/enc-string";
import { SymmetricCryptoKey } from "../models/domain/symmetric-crypto-key";
import { CryptoService } from "../services/crypto.service";
import { UserKeyDefinition } from "../state";

import { USER_ENCRYPTED_ORGANIZATION_KEYS } from "./key-state/org-keys.state";
import { USER_ENCRYPTED_PROVIDER_KEYS } from "./key-state/provider-keys.state";
import {
  USER_ENCRYPTED_PRIVATE_KEY,
  USER_EVER_HAD_USER_KEY,
  USER_KEY,
} from "./key-state/user-key.state";

describe("cryptoService", () => {
  let cryptoService: CryptoService;

  const pinService = mock<PinServiceAbstraction>();
  const keyGenerationService = mock<KeyGenerationService>();
  const cryptoFunctionService = mock<CryptoFunctionService>();
  const encryptService = mock<EncryptService>();
  const platformUtilService = mock<PlatformUtilsService>();
  const logService = mock<LogService>();
  const stateService = mock<StateService>();
  const kdfConfigService = mock<KdfConfigService>();
  let stateProvider: FakeStateProvider;

  const mockUserId = Utils.newGuid() as UserId;
  let accountService: FakeAccountService;
  let masterPasswordService: FakeMasterPasswordService;

  beforeEach(() => {
    accountService = mockAccountServiceWith(mockUserId);
    masterPasswordService = new FakeMasterPasswordService();
    stateProvider = new FakeStateProvider(accountService);

    cryptoService = new CryptoService(
      pinService,
      masterPasswordService,
      keyGenerationService,
      cryptoFunctionService,
      encryptService,
      platformUtilService,
      logService,
      stateService,
      accountService,
      stateProvider,
      kdfConfigService,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("instantiates", () => {
    expect(cryptoService).not.toBeFalsy();
  });

  describe("getUserKey", () => {
    let mockUserKey: UserKey;

    beforeEach(() => {
      const mockRandomBytes = new Uint8Array(64) as CsprngArray;
      mockUserKey = new SymmetricCryptoKey(mockRandomBytes) as UserKey;
    });

    it("retrieves the key state of the requested user", async () => {
      await cryptoService.getUserKey(mockUserId);

      expect(stateProvider.mock.getUserState$).toHaveBeenCalledWith(USER_KEY, mockUserId);
    });

    it("returns the User Key if available", async () => {
      stateProvider.singleUser.getFake(mockUserId, USER_KEY).nextState(mockUserKey);

      const userKey = await cryptoService.getUserKey(mockUserId);

      expect(userKey).toEqual(mockUserKey);
    });

    it("returns nullish if the user key is not set", async () => {
      const userKey = await cryptoService.getUserKey(mockUserId);

      expect(userKey).toBeFalsy();
    });
  });

  describe.each(["hasUserKey", "hasUserKeyInMemory"])(
    `%s`,
    (method: "hasUserKey" | "hasUserKeyInMemory") => {
      let mockUserKey: UserKey;

      beforeEach(() => {
        const mockRandomBytes = new Uint8Array(64) as CsprngArray;
        mockUserKey = new SymmetricCryptoKey(mockRandomBytes) as UserKey;
      });

      it.each([true, false])("returns %s if the user key is set", async (hasKey) => {
        stateProvider.singleUser
          .getFake(mockUserId, USER_KEY)
          .nextState(hasKey ? mockUserKey : null);
        expect(await cryptoService[method](mockUserId)).toBe(hasKey);
      });

      it("returns false when no active userId is set", async () => {
        accountService.activeAccountSubject.next(null);
        expect(await cryptoService[method]()).toBe(false);
      });

      it.each([true, false])(
        "resolves %s for active user id when none is provided",
        async (hasKey) => {
          stateProvider.activeUserId$ = of(mockUserId);
          stateProvider.singleUser
            .getFake(mockUserId, USER_KEY)
            .nextState(hasKey ? mockUserKey : null);
          expect(await cryptoService[method]()).toBe(hasKey);
        },
      );
    },
  );

  describe("getUserKeyWithLegacySupport", () => {
    let mockUserKey: UserKey;
    let mockMasterKey: MasterKey;
    let getMasterKey: jest.SpyInstance;

    beforeEach(() => {
      const mockRandomBytes = new Uint8Array(64) as CsprngArray;
      mockUserKey = new SymmetricCryptoKey(mockRandomBytes) as UserKey;
      mockMasterKey = new SymmetricCryptoKey(new Uint8Array(64) as CsprngArray) as MasterKey;

      getMasterKey = jest.spyOn(masterPasswordService, "masterKey$");
    });

    it("returns the User Key if available", async () => {
      stateProvider.singleUser.getFake(mockUserId, USER_KEY).nextState(mockUserKey);
      const getKeySpy = jest.spyOn(cryptoService, "getUserKey");

      const userKey = await cryptoService.getUserKeyWithLegacySupport(mockUserId);

      expect(getKeySpy).toHaveBeenCalledWith(mockUserId);
      expect(getMasterKey).not.toHaveBeenCalled();

      expect(userKey).toEqual(mockUserKey);
    });

    it("returns the user's master key when User Key is not available", async () => {
      masterPasswordService.masterKeySubject.next(mockMasterKey);

      const userKey = await cryptoService.getUserKeyWithLegacySupport(mockUserId);

      expect(getMasterKey).toHaveBeenCalledWith(mockUserId);
      expect(userKey).toEqual(mockMasterKey);
    });
  });

  describe("everHadUserKey$", () => {
    let everHadUserKeyState: FakeActiveUserState<boolean>;

    beforeEach(() => {
      everHadUserKeyState = stateProvider.activeUser.getFake(USER_EVER_HAD_USER_KEY);
    });

    it("should return true when stored value is true", async () => {
      everHadUserKeyState.nextState(true);

      expect(await firstValueFrom(cryptoService.everHadUserKey$)).toBe(true);
    });

    it("should return false when stored value is false", async () => {
      everHadUserKeyState.nextState(false);

      expect(await firstValueFrom(cryptoService.everHadUserKey$)).toBe(false);
    });

    it("should return false when stored value is null", async () => {
      everHadUserKeyState.nextState(null);

      expect(await firstValueFrom(cryptoService.everHadUserKey$)).toBe(false);
    });
  });

  describe("setUserKey", () => {
    let mockUserKey: UserKey;
    let everHadUserKeyState: FakeSingleUserState<boolean>;

    beforeEach(() => {
      const mockRandomBytes = new Uint8Array(64) as CsprngArray;
      mockUserKey = new SymmetricCryptoKey(mockRandomBytes) as UserKey;
      everHadUserKeyState = stateProvider.singleUser.getFake(mockUserId, USER_EVER_HAD_USER_KEY);

      // Initialize storage
      everHadUserKeyState.nextState(null);
    });

    it("should set everHadUserKey if key is not null to true", async () => {
      await cryptoService.setUserKey(mockUserKey, mockUserId);

      expect(await firstValueFrom(everHadUserKeyState.state$)).toBe(true);
    });

    describe("Auto Key refresh", () => {
      it("sets an Auto key if vault timeout is set to 'never'", async () => {
        await stateProvider.setUserState(VAULT_TIMEOUT, VaultTimeoutStringType.Never, mockUserId);

        await cryptoService.setUserKey(mockUserKey, mockUserId);

        expect(stateService.setUserKeyAutoUnlock).toHaveBeenCalledWith(mockUserKey.keyB64, {
          userId: mockUserId,
        });
      });

      it("clears the Auto key if vault timeout is set to anything other than null", async () => {
        await stateProvider.setUserState(VAULT_TIMEOUT, 10, mockUserId);

        await cryptoService.setUserKey(mockUserKey, mockUserId);

        expect(stateService.setUserKeyAutoUnlock).toHaveBeenCalledWith(null, {
          userId: mockUserId,
        });
      });

      it("clears the old deprecated Auto key whenever a User Key is set", async () => {
        await cryptoService.setUserKey(mockUserKey, mockUserId);

        expect(stateService.setCryptoMasterKeyAuto).toHaveBeenCalledWith(null, {
          userId: mockUserId,
        });
      });
    });

    it("throws if key is null", async () => {
      await expect(cryptoService.setUserKey(null, mockUserId)).rejects.toThrow("No key provided.");
    });

    describe("Pin Key refresh", () => {
      const mockPinKeyEncryptedUserKey = new EncString(
        "2.AAAw2vTUePO+CCyokcIfVw==|DTBNlJ5yVsV2Bsk3UU3H6Q==|YvFBff5gxWqM+UsFB6BKimKxhC32AtjF3IStpU1Ijwg=",
      );
      const mockUserKeyEncryptedPin = new EncString(
        "2.BBBw2vTUePO+CCyokcIfVw==|DTBNlJ5yVsV2Bsk3UU3H6Q==|YvFBff5gxWqM+UsFB6BKimKxhC32AtjF3IStpU1Ijwg=",
      );

      it("sets a pinKeyEncryptedUserKeyPersistent if a userKeyEncryptedPin and pinKeyEncryptedUserKey is set", async () => {
        pinService.createPinKeyEncryptedUserKey.mockResolvedValue(mockPinKeyEncryptedUserKey);
        pinService.getUserKeyEncryptedPin.mockResolvedValue(mockUserKeyEncryptedPin);
        pinService.getPinKeyEncryptedUserKeyPersistent.mockResolvedValue(
          mockPinKeyEncryptedUserKey,
        );

        await cryptoService.setUserKey(mockUserKey, mockUserId);

        expect(pinService.storePinKeyEncryptedUserKey).toHaveBeenCalledWith(
          mockPinKeyEncryptedUserKey,
          false,
          mockUserId,
        );
      });

      it("sets a pinKeyEncryptedUserKeyEphemeral if a userKeyEncryptedPin is set, but a pinKeyEncryptedUserKey is not set", async () => {
        pinService.createPinKeyEncryptedUserKey.mockResolvedValue(mockPinKeyEncryptedUserKey);
        pinService.getUserKeyEncryptedPin.mockResolvedValue(mockUserKeyEncryptedPin);
        pinService.getPinKeyEncryptedUserKeyPersistent.mockResolvedValue(null);

        await cryptoService.setUserKey(mockUserKey, mockUserId);

        expect(pinService.storePinKeyEncryptedUserKey).toHaveBeenCalledWith(
          mockPinKeyEncryptedUserKey,
          true,
          mockUserId,
        );
      });

      it("clears the pinKeyEncryptedUserKeyPersistent and pinKeyEncryptedUserKeyEphemeral if the UserKeyEncryptedPin is not set", async () => {
        pinService.getUserKeyEncryptedPin.mockResolvedValue(null);

        await cryptoService.setUserKey(mockUserKey, mockUserId);

        expect(pinService.clearPinKeyEncryptedUserKeyPersistent).toHaveBeenCalledWith(mockUserId);
        expect(pinService.clearPinKeyEncryptedUserKeyEphemeral).toHaveBeenCalledWith(mockUserId);
      });
    });
  });

  describe("clearKeys", () => {
    it("resolves active user id when called with no user id", async () => {
      let callCount = 0;
      stateProvider.activeUserId$ = stateProvider.activeUserId$.pipe(tap(() => callCount++));

      await cryptoService.clearKeys(null);
      expect(callCount).toBe(1);

      // revert to the original state
      accountService.activeAccount$ = accountService.activeAccountSubject.asObservable();
    });

    describe.each([
      USER_ENCRYPTED_ORGANIZATION_KEYS,
      USER_ENCRYPTED_PROVIDER_KEYS,
      USER_ENCRYPTED_PRIVATE_KEY,
      USER_KEY,
    ])("key removal", (key: UserKeyDefinition<unknown>) => {
      it(`clears ${key.key} for active user when unspecified`, async () => {
        await cryptoService.clearKeys(null);

        const encryptedOrgKeyState = stateProvider.singleUser.getFake(mockUserId, key);
        expect(encryptedOrgKeyState.nextMock).toHaveBeenCalledTimes(1);
        expect(encryptedOrgKeyState.nextMock).toHaveBeenCalledWith(null);
      });

      it(`clears ${key.key} for the specified user when specified`, async () => {
        const userId = "someOtherUser" as UserId;
        await cryptoService.clearKeys(userId);

        const encryptedOrgKeyState = stateProvider.singleUser.getFake(userId, key);
        expect(encryptedOrgKeyState.nextMock).toHaveBeenCalledTimes(1);
        expect(encryptedOrgKeyState.nextMock).toHaveBeenCalledWith(null);
      });
    });
  });

  describe("userPrivateKey$", () => {
    type SetupKeysParams = {
      makeMasterKey: boolean;
      makeUserKey: boolean;
    };

    function setupKeys({ makeMasterKey, makeUserKey }: SetupKeysParams): [UserKey, MasterKey] {
      const userKeyState = stateProvider.singleUser.getFake(mockUserId, USER_KEY);
      const fakeMasterKey = makeMasterKey ? makeSymmetricCryptoKey<MasterKey>(64) : null;
      masterPasswordService.masterKeySubject.next(fakeMasterKey);
      userKeyState.stateSubject.next([mockUserId, null]);
      const fakeUserKey = makeUserKey ? makeSymmetricCryptoKey<UserKey>(64) : null;
      userKeyState.stateSubject.next([mockUserId, fakeUserKey]);
      return [fakeUserKey, fakeMasterKey];
    }

    it("will return users decrypted private key when user has a user key and encrypted private key set", async () => {
      const [userKey] = setupKeys({
        makeMasterKey: false,
        makeUserKey: true,
      });

      const userEncryptedPrivateKeyState = stateProvider.singleUser.getFake(
        mockUserId,
        USER_ENCRYPTED_PRIVATE_KEY,
      );

      const fakeEncryptedUserPrivateKey = makeEncString("1");

      userEncryptedPrivateKeyState.stateSubject.next([
        mockUserId,
        fakeEncryptedUserPrivateKey.encryptedString,
      ]);

      // Decryption of the user private key
      const fakeDecryptedUserPrivateKey = makeStaticByteArray(10, 1);
      encryptService.decryptToBytes.mockResolvedValue(fakeDecryptedUserPrivateKey);

      const fakeUserPublicKey = makeStaticByteArray(10, 2);
      cryptoFunctionService.rsaExtractPublicKey.mockResolvedValue(fakeUserPublicKey);

      const userPrivateKey = await firstValueFrom(cryptoService.userPrivateKey$(mockUserId));

      expect(encryptService.decryptToBytes).toHaveBeenCalledWith(
        fakeEncryptedUserPrivateKey,
        userKey,
      );

      expect(userPrivateKey).toBe(fakeDecryptedUserPrivateKey);
    });

    it("returns null user private key when no user key is found", async () => {
      setupKeys({ makeMasterKey: false, makeUserKey: false });

      const userPrivateKey = await firstValueFrom(cryptoService.userPrivateKey$(mockUserId));

      expect(encryptService.decryptToBytes).not.toHaveBeenCalled();

      expect(userPrivateKey).toBeFalsy();
    });

    it("returns null when user does not have a private key set", async () => {
      setupKeys({ makeUserKey: true, makeMasterKey: false });

      const encryptedUserPrivateKeyState = stateProvider.singleUser.getFake(
        mockUserId,
        USER_ENCRYPTED_PRIVATE_KEY,
      );
      encryptedUserPrivateKeyState.stateSubject.next([mockUserId, null]);

      const userPrivateKey = await firstValueFrom(cryptoService.userPrivateKey$(mockUserId));
      expect(userPrivateKey).toBeFalsy();
    });
  });

  describe("cipherDecryptionKeys$", () => {
    function fakePrivateKeyDecryption(encryptedPrivateKey: Encrypted, key: SymmetricCryptoKey) {
      const output = new Uint8Array(64);
      output.set(encryptedPrivateKey.dataBytes);
      output.set(
        key.key.subarray(0, 64 - encryptedPrivateKey.dataBytes.length),
        encryptedPrivateKey.dataBytes.length,
      );
      return output;
    }

    function fakeOrgKeyDecryption(encryptedString: EncString, userPrivateKey: Uint8Array) {
      const output = new Uint8Array(64);
      output.set(encryptedString.dataBytes);
      output.set(
        userPrivateKey.subarray(0, 64 - encryptedString.dataBytes.length),
        encryptedString.dataBytes.length,
      );
      return output;
    }

    const org1Id = "org1" as OrganizationId;

    type UpdateKeysParams = {
      userKey: UserKey;
      encryptedPrivateKey: EncString;
      orgKeys: Record<string, EncryptedOrganizationKeyData>;
      providerKeys: Record<string, EncryptedString>;
    };

    function updateKeys(keys: Partial<UpdateKeysParams> = {}) {
      if ("userKey" in keys) {
        const userKeyState = stateProvider.singleUser.getFake(mockUserId, USER_KEY);
        userKeyState.stateSubject.next([mockUserId, keys.userKey]);
      }

      if ("encryptedPrivateKey" in keys) {
        const userEncryptedPrivateKey = stateProvider.singleUser.getFake(
          mockUserId,
          USER_ENCRYPTED_PRIVATE_KEY,
        );
        userEncryptedPrivateKey.stateSubject.next([
          mockUserId,
          keys.encryptedPrivateKey.encryptedString,
        ]);
      }

      if ("orgKeys" in keys) {
        const orgKeysState = stateProvider.singleUser.getFake(
          mockUserId,
          USER_ENCRYPTED_ORGANIZATION_KEYS,
        );
        orgKeysState.stateSubject.next([mockUserId, keys.orgKeys]);
      }

      if ("providerKeys" in keys) {
        const providerKeysState = stateProvider.singleUser.getFake(
          mockUserId,
          USER_ENCRYPTED_PROVIDER_KEYS,
        );
        providerKeysState.stateSubject.next([mockUserId, keys.providerKeys]);
      }

      encryptService.decryptToBytes.mockImplementation((encryptedPrivateKey, userKey) => {
        // TOOD: Branch between provider and private key?
        return Promise.resolve(fakePrivateKeyDecryption(encryptedPrivateKey, userKey));
      });

      encryptService.rsaDecrypt.mockImplementation((data, privateKey) => {
        return Promise.resolve(fakeOrgKeyDecryption(data, privateKey));
      });
    }

    it("returns decryption keys when there are no org or provider keys set", async () => {
      updateKeys({
        userKey: makeSymmetricCryptoKey<UserKey>(64),
        encryptedPrivateKey: makeEncString("privateKey"),
      });

      const decryptionKeys = await firstValueFrom(cryptoService.cipherDecryptionKeys$(mockUserId));

      expect(decryptionKeys).not.toBeNull();
      expect(decryptionKeys.userKey).not.toBeNull();
      expect(decryptionKeys.orgKeys).toEqual({});
    });

    it("returns decryption keys when there are org keys", async () => {
      updateKeys({
        userKey: makeSymmetricCryptoKey<UserKey>(64),
        encryptedPrivateKey: makeEncString("privateKey"),
        orgKeys: {
          [org1Id]: { type: "organization", key: makeEncString("org1Key").encryptedString },
        },
      });

      const decryptionKeys = await firstValueFrom(cryptoService.cipherDecryptionKeys$(mockUserId));

      expect(decryptionKeys).not.toBeNull();
      expect(decryptionKeys.userKey).not.toBeNull();
      expect(decryptionKeys.orgKeys).not.toBeNull();
      expect(Object.keys(decryptionKeys.orgKeys)).toHaveLength(1);
      expect(decryptionKeys.orgKeys[org1Id]).not.toBeNull();
      const orgKey = decryptionKeys.orgKeys[org1Id];
      expect(orgKey.keyB64).toContain("org1Key");
    });

    it("returns decryption keys when there is an empty record for provider keys", async () => {
      updateKeys({
        userKey: makeSymmetricCryptoKey<UserKey>(64),
        encryptedPrivateKey: makeEncString("privateKey"),
        orgKeys: {
          [org1Id]: { type: "organization", key: makeEncString("org1Key").encryptedString },
        },
        providerKeys: {},
      });

      const decryptionKeys = await firstValueFrom(cryptoService.cipherDecryptionKeys$(mockUserId));

      expect(decryptionKeys).not.toBeNull();
      expect(decryptionKeys.userKey).not.toBeNull();
      expect(decryptionKeys.orgKeys).not.toBeNull();
      expect(Object.keys(decryptionKeys.orgKeys)).toHaveLength(1);
      expect(decryptionKeys.orgKeys[org1Id]).not.toBeNull();
      const orgKey = decryptionKeys.orgKeys[org1Id];
      expect(orgKey.keyB64).toContain("org1Key");
    });

    it("returns decryption keys when some of the org keys are providers", async () => {
      const org2Id = "org2Id" as OrganizationId;
      updateKeys({
        userKey: makeSymmetricCryptoKey<UserKey>(64),
        encryptedPrivateKey: makeEncString("privateKey"),
        orgKeys: {
          [org1Id]: { type: "organization", key: makeEncString("org1Key").encryptedString },
          [org2Id]: {
            type: "provider",
            key: makeEncString("provider1Key").encryptedString,
            providerId: "provider1",
          },
        },
        providerKeys: {
          provider1: makeEncString("provider1Key").encryptedString,
        },
      });

      const decryptionKeys = await firstValueFrom(cryptoService.cipherDecryptionKeys$(mockUserId));

      expect(decryptionKeys).not.toBeNull();
      expect(decryptionKeys.userKey).not.toBeNull();
      expect(decryptionKeys.orgKeys).not.toBeNull();
      expect(Object.keys(decryptionKeys.orgKeys)).toHaveLength(2);

      const orgKey = decryptionKeys.orgKeys[org1Id];
      expect(orgKey).not.toBeNull();
      expect(orgKey.keyB64).toContain("org1Key");

      const org2Key = decryptionKeys.orgKeys[org2Id];
      expect(org2Key).not.toBeNull();
      expect(org2Key.keyB64).toContain("provider1Key");
    });

    it("returns a stream that pays attention to updates of all data", async () => {
      // Start listening until there have been 6 emissions
      const promise = lastValueFrom(
        cryptoService.cipherDecryptionKeys$(mockUserId).pipe(bufferCount(6), take(1)),
      );

      // User has their UserKey set
      const initialUserKey = makeSymmetricCryptoKey<UserKey>(64);
      updateKeys({
        userKey: initialUserKey,
      });

      // Because switchMap is a little to good at its job
      await awaitAsync();

      // User has their private key set
      const initialPrivateKey = makeEncString("userPrivateKey");
      updateKeys({
        encryptedPrivateKey: initialPrivateKey,
      });

      // Because switchMap is a little to good at its job
      await awaitAsync();

      // Current architecture requires that provider keys are set before org keys
      updateKeys({
        providerKeys: {},
      });

      // Because switchMap is a little to good at its job
      await awaitAsync();

      // User has their org keys set
      updateKeys({
        orgKeys: {
          [org1Id]: { type: "organization", key: makeEncString("org1Key").encryptedString },
        },
      });

      // Out of band user key update
      const updatedUserKey = makeSymmetricCryptoKey<UserKey>(64);
      updateKeys({
        userKey: updatedUserKey,
      });

      const emittedValues = await promise;

      // They start with no data
      expect(emittedValues[0]).toBeNull();

      // They get their user key set
      expect(emittedValues[1]).toEqual({
        userKey: initialUserKey,
        orgKeys: null,
      });

      // Once a private key is set we will attempt org key decryption, even if org keys haven't been set
      expect(emittedValues[2]).toEqual({
        userKey: initialUserKey,
        orgKeys: {},
      });

      // Will emit again when providers alone are set, but this won't change the output until orgs are set
      expect(emittedValues[3]).toEqual({
        userKey: initialUserKey,
        orgKeys: {},
      });

      // Expect org keys to get emitted
      expect(emittedValues[4]).toEqual({
        userKey: initialUserKey,
        orgKeys: {
          [org1Id]: expect.anything(),
        },
      });

      // Expect out of band user key update
      expect(emittedValues[5]).toEqual({
        userKey: updatedUserKey,
        orgKeys: {
          [org1Id]: expect.anything(),
        },
      });
    });
  });
});

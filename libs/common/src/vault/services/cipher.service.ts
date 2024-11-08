import {
  combineLatest,
  filter,
  firstValueFrom,
  map,
  merge,
  Observable,
  shareReplay,
  Subject,
  switchMap,
} from "rxjs";
import { SemVer } from "semver";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { BulkEncryptService } from "@bitwarden/common/platform/abstractions/bulk-encrypt.service";

import { KeyService } from "../../../../key-management/src/abstractions/key.service";
import { ApiService } from "../../abstractions/api.service";
import { SearchService } from "../../abstractions/search.service";
import { AutofillSettingsServiceAbstraction } from "../../autofill/services/autofill-settings.service";
import { DomainSettingsService } from "../../autofill/services/domain-settings.service";
import { UriMatchStrategySetting } from "../../models/domain/domain-service";
import { ErrorResponse } from "../../models/response/error.response";
import { ListResponse } from "../../models/response/list.response";
import { View } from "../../models/view/view";
import { ConfigService } from "../../platform/abstractions/config/config.service";
import { EncryptService } from "../../platform/abstractions/encrypt.service";
import { I18nService } from "../../platform/abstractions/i18n.service";
import { StateService } from "../../platform/abstractions/state.service";
import { sequentialize } from "../../platform/misc/sequentialize";
import { Utils } from "../../platform/misc/utils";
import Domain from "../../platform/models/domain/domain-base";
import { EncArrayBuffer } from "../../platform/models/domain/enc-array-buffer";
import { EncString } from "../../platform/models/domain/enc-string";
import { SymmetricCryptoKey } from "../../platform/models/domain/symmetric-crypto-key";
import { ActiveUserState, StateProvider } from "../../platform/state";
import { CipherId, CollectionId, OrganizationId, UserId } from "../../types/guid";
import { OrgKey, UserKey } from "../../types/key";
import { CipherService as CipherServiceAbstraction } from "../abstractions/cipher.service";
import { CipherFileUploadService } from "../abstractions/file-upload/cipher-file-upload.service";
import { FieldType } from "../enums";
import { CipherType } from "../enums/cipher-type";
import { CipherData } from "../models/data/cipher.data";
import { LocalData } from "../models/data/local.data";
import { Attachment } from "../models/domain/attachment";
import { Card } from "../models/domain/card";
import { Cipher } from "../models/domain/cipher";
import { Fido2Credential } from "../models/domain/fido2-credential";
import { Field } from "../models/domain/field";
import { Identity } from "../models/domain/identity";
import { Login } from "../models/domain/login";
import { LoginUri } from "../models/domain/login-uri";
import { Password } from "../models/domain/password";
import { SecureNote } from "../models/domain/secure-note";
import { SortedCiphersCache } from "../models/domain/sorted-ciphers-cache";
import { CipherBulkDeleteRequest } from "../models/request/cipher-bulk-delete.request";
import { CipherBulkMoveRequest } from "../models/request/cipher-bulk-move.request";
import { CipherBulkRestoreRequest } from "../models/request/cipher-bulk-restore.request";
import { CipherBulkShareRequest } from "../models/request/cipher-bulk-share.request";
import { CipherBulkUpdateCollectionsRequest } from "../models/request/cipher-bulk-update-collections.request";
import { CipherCollectionsRequest } from "../models/request/cipher-collections.request";
import { CipherCreateRequest } from "../models/request/cipher-create.request";
import { CipherPartialRequest } from "../models/request/cipher-partial.request";
import { CipherShareRequest } from "../models/request/cipher-share.request";
import { CipherWithIdRequest } from "../models/request/cipher-with-id.request";
import { CipherRequest } from "../models/request/cipher.request";
import { CipherResponse } from "../models/response/cipher.response";
import { AttachmentView } from "../models/view/attachment.view";
import { CipherView } from "../models/view/cipher.view";
import { FieldView } from "../models/view/field.view";
import { PasswordHistoryView } from "../models/view/password-history.view";
import { AddEditCipherInfo } from "../types/add-edit-cipher-info";

import {
  ADD_EDIT_CIPHER_INFO_KEY,
  DECRYPTED_CIPHERS,
  ENCRYPTED_CIPHERS,
  LOCAL_DATA_KEY,
} from "./key-state/ciphers.state";

const CIPHER_KEY_ENC_MIN_SERVER_VER = new SemVer("2024.2.0");

export class CipherService implements CipherServiceAbstraction {
  private sortedCiphersCache: SortedCiphersCache = new SortedCiphersCache(
    this.sortCiphersByLastUsed,
  );
  /**
   * Observable that forces the `cipherViews$` observable to re-emit with the provided value.
   * Used to let subscribers of `cipherViews$` know that the decrypted ciphers have been cleared for the active user.
   * @private
   */
  private forceCipherViews$: Subject<CipherView[]> = new Subject<CipherView[]>();

  localData$: Observable<Record<CipherId, LocalData>>;
  ciphers$: Observable<Record<CipherId, CipherData>>;

  /**
   * Observable that emits an array of decrypted ciphers for the active user.
   * This observable will not emit until the encrypted ciphers have either been loaded from state or after sync.
   *
   * A `null` value indicates that the latest encrypted ciphers have not been decrypted yet and that
   * decryption is in progress. The latest decrypted ciphers will be emitted once decryption is complete.
   *
   */
  cipherViews$: Observable<CipherView[] | null>;
  addEditCipherInfo$: Observable<AddEditCipherInfo>;

  private localDataState: ActiveUserState<Record<CipherId, LocalData>>;
  private encryptedCiphersState: ActiveUserState<Record<CipherId, CipherData>>;
  private decryptedCiphersState: ActiveUserState<Record<CipherId, CipherView>>;
  private addEditCipherInfoState: ActiveUserState<AddEditCipherInfo>;

  constructor(
    private keyService: KeyService,
    private domainSettingsService: DomainSettingsService,
    private apiService: ApiService,
    private i18nService: I18nService,
    private searchService: SearchService,
    private stateService: StateService,
    private autofillSettingsService: AutofillSettingsServiceAbstraction,
    private encryptService: EncryptService,
    private bulkEncryptService: BulkEncryptService,
    private cipherFileUploadService: CipherFileUploadService,
    private configService: ConfigService,
    private stateProvider: StateProvider,
    private accountService: AccountService,
  ) {
    this.localDataState = this.stateProvider.getActive(LOCAL_DATA_KEY);
    this.encryptedCiphersState = this.stateProvider.getActive(ENCRYPTED_CIPHERS);
    this.decryptedCiphersState = this.stateProvider.getActive(DECRYPTED_CIPHERS);
    this.addEditCipherInfoState = this.stateProvider.getActive(ADD_EDIT_CIPHER_INFO_KEY);

    this.localData$ = this.localDataState.state$.pipe(map((data) => data ?? {}));
    this.ciphers$ = this.encryptedCiphersState.state$.pipe(map((ciphers) => ciphers ?? {}));

    // Decrypted ciphers depend on both ciphers and local data and need to be updated when either changes
    this.cipherViews$ = combineLatest([this.encryptedCiphersState.state$, this.localData$]).pipe(
      filter(([ciphers]) => ciphers != null), // Skip if ciphers haven't been loaded yor synced yet
      switchMap(() => merge(this.forceCipherViews$, this.getAllDecrypted())),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.addEditCipherInfo$ = this.addEditCipherInfoState.state$;
  }

  async setDecryptedCipherCache(value: CipherView[], userId: UserId) {
    // Sometimes we might prematurely decrypt the vault and that will result in no ciphers
    // if we cache it then we may accidentally return it when it's not right, we'd rather try decryption again.
    // We still want to set null though, that is the indicator that the cache isn't valid and we should do decryption.
    if (value == null || value.length !== 0) {
      await this.setDecryptedCiphers(value, userId);
    }
    if (this.searchService != null) {
      if (value == null) {
        await this.searchService.clearIndex();
      } else {
        await this.searchService.indexCiphers(value);
      }
    }
  }

  private async setDecryptedCiphers(value: CipherView[], userId: UserId) {
    const cipherViews: { [id: string]: CipherView } = {};
    value?.forEach((c) => {
      cipherViews[c.id] = c;
    });
    await this.stateProvider.setUserState(DECRYPTED_CIPHERS, cipherViews, userId);
  }

  async clearCache(userId?: UserId): Promise<void> {
    const activeUserId = await firstValueFrom(this.stateProvider.activeUserId$);
    userId ??= activeUserId;
    await this.clearDecryptedCiphersState(userId);

    // Force the cipherView$ observable (which always tracks the active user) to re-emit
    if (userId == activeUserId) {
      this.forceCipherViews$.next(null);
    }
  }

  async encrypt(
    model: CipherView,
    userId: UserId,
    keyForCipherEncryption?: SymmetricCryptoKey,
    keyForCipherKeyDecryption?: SymmetricCryptoKey,
    originalCipher: Cipher = null,
  ): Promise<Cipher> {
    if (model.id != null) {
      if (originalCipher == null) {
        originalCipher = await this.get(model.id);
      }
      if (originalCipher != null) {
        await this.updateModelfromExistingCipher(model, originalCipher, userId);
      }
      this.adjustPasswordHistoryLength(model);
    }

    const cipher = new Cipher();
    cipher.id = model.id;
    cipher.folderId = model.folderId;
    cipher.favorite = model.favorite;
    cipher.organizationId = model.organizationId;
    cipher.type = model.type;
    cipher.collectionIds = model.collectionIds;
    cipher.revisionDate = model.revisionDate;
    cipher.reprompt = model.reprompt;
    cipher.edit = model.edit;

    if (await this.getCipherKeyEncryptionEnabled()) {
      cipher.key = originalCipher?.key ?? null;
      const userOrOrgKey = await this.getKeyForCipherKeyDecryption(cipher, userId);
      // The keyForEncryption is only used for encrypting the cipher key, not the cipher itself, since cipher key encryption is enabled.
      // If the caller has provided a key for cipher key encryption, use it. Otherwise, use the user or org key.
      keyForCipherEncryption ||= userOrOrgKey;
      // If the caller has provided a key for cipher key decryption, use it. Otherwise, use the user or org key.
      keyForCipherKeyDecryption ||= userOrOrgKey;
      return this.encryptCipherWithCipherKey(
        model,
        cipher,
        keyForCipherEncryption,
        keyForCipherKeyDecryption,
      );
    } else {
      keyForCipherEncryption ||= await this.getKeyForCipherKeyDecryption(cipher, userId);
      // We want to ensure that the cipher key is null if cipher key encryption is disabled
      // so that decryption uses the proper key.
      cipher.key = null;
      return this.encryptCipher(model, cipher, keyForCipherEncryption);
    }
  }

  async encryptAttachments(
    attachmentsModel: AttachmentView[],
    key: SymmetricCryptoKey,
  ): Promise<Attachment[]> {
    if (attachmentsModel == null || attachmentsModel.length === 0) {
      return null;
    }

    const promises: Promise<any>[] = [];
    const encAttachments: Attachment[] = [];
    attachmentsModel.forEach(async (model) => {
      const attachment = new Attachment();
      attachment.id = model.id;
      attachment.size = model.size;
      attachment.sizeName = model.sizeName;
      attachment.url = model.url;
      const promise = this.encryptObjProperty(
        model,
        attachment,
        {
          fileName: null,
        },
        key,
      ).then(async () => {
        if (model.key != null) {
          attachment.key = await this.encryptService.encrypt(model.key.key, key);
        }
        encAttachments.push(attachment);
      });
      promises.push(promise);
    });

    await Promise.all(promises);
    return encAttachments;
  }

  async encryptFields(fieldsModel: FieldView[], key: SymmetricCryptoKey): Promise<Field[]> {
    if (!fieldsModel || !fieldsModel.length) {
      return null;
    }

    const self = this;
    const encFields: Field[] = [];
    await fieldsModel.reduce(async (promise, field) => {
      await promise;
      const encField = await self.encryptField(field, key);
      encFields.push(encField);
    }, Promise.resolve());

    return encFields;
  }

  async encryptField(fieldModel: FieldView, key: SymmetricCryptoKey): Promise<Field> {
    const field = new Field();
    field.type = fieldModel.type;
    field.linkedId = fieldModel.linkedId;
    // normalize boolean type field values
    if (fieldModel.type === FieldType.Boolean && fieldModel.value !== "true") {
      fieldModel.value = "false";
    }

    await this.encryptObjProperty(
      fieldModel,
      field,
      {
        name: null,
        value: null,
      },
      key,
    );

    return field;
  }

  async encryptPasswordHistories(
    phModels: PasswordHistoryView[],
    key: SymmetricCryptoKey,
  ): Promise<Password[]> {
    if (!phModels || !phModels.length) {
      return null;
    }

    const self = this;
    const encPhs: Password[] = [];
    await phModels.reduce(async (promise, ph) => {
      await promise;
      const encPh = await self.encryptPasswordHistory(ph, key);
      encPhs.push(encPh);
    }, Promise.resolve());

    return encPhs;
  }

  async encryptPasswordHistory(
    phModel: PasswordHistoryView,
    key: SymmetricCryptoKey,
  ): Promise<Password> {
    const ph = new Password();
    ph.lastUsedDate = phModel.lastUsedDate;

    await this.encryptObjProperty(
      phModel,
      ph,
      {
        password: null,
      },
      key,
    );

    return ph;
  }

  async get(id: string): Promise<Cipher> {
    const ciphers = await firstValueFrom(this.ciphers$);
    // eslint-disable-next-line
    if (ciphers == null || !ciphers.hasOwnProperty(id)) {
      return null;
    }

    const localData = await firstValueFrom(this.localData$);
    const cipherId = id as CipherId;

    return new Cipher(ciphers[cipherId], localData ? localData[cipherId] : null);
  }

  async getAll(): Promise<Cipher[]> {
    const localData = await firstValueFrom(this.localData$);
    const ciphers = await firstValueFrom(this.ciphers$);
    const response: Cipher[] = [];
    for (const id in ciphers) {
      // eslint-disable-next-line
      if (ciphers.hasOwnProperty(id)) {
        const cipherId = id as CipherId;
        response.push(new Cipher(ciphers[cipherId], localData ? localData[cipherId] : null));
      }
    }
    return response;
  }

  /**
   * Decrypts all ciphers for the active user and caches them in memory. If the ciphers have already been decrypted and
   * cached, the cached ciphers are returned.
   * @deprecated Use `cipherViews$` observable instead
   */
  @sequentialize(() => "getAllDecrypted")
  async getAllDecrypted(): Promise<CipherView[]> {
    let decCiphers = await this.getDecryptedCiphers();
    if (decCiphers != null && decCiphers.length !== 0) {
      await this.reindexCiphers();
      return await this.getDecryptedCiphers();
    }

    const activeUserId = await firstValueFrom(this.stateProvider.activeUserId$);

    if (activeUserId == null) {
      return [];
    }

    decCiphers = await this.decryptCiphers(await this.getAll(), activeUserId);

    await this.setDecryptedCipherCache(decCiphers, activeUserId);
    return decCiphers;
  }

  private async getDecryptedCiphers() {
    return Object.values(
      await firstValueFrom(this.decryptedCiphersState.state$.pipe(map((c) => c ?? {}))),
    );
  }

  private async decryptCiphers(ciphers: Cipher[], userId: UserId) {
    const keys = await firstValueFrom(this.keyService.cipherDecryptionKeys$(userId, true));

    if (keys == null || (keys.userKey == null && Object.keys(keys.orgKeys).length === 0)) {
      // return early if there are no keys to decrypt with
      return;
    }

    // Group ciphers by orgId or under 'null' for the user's ciphers
    const grouped = ciphers.reduce(
      (agg, c) => {
        agg[c.organizationId] ??= [];
        agg[c.organizationId].push(c);
        return agg;
      },
      {} as Record<string, Cipher[]>,
    );

    const decCiphers = (
      await Promise.all(
        Object.entries(grouped).map(async ([orgId, groupedCiphers]) => {
          if (await this.configService.getFeatureFlag(FeatureFlag.PM4154_BulkEncryptionService)) {
            return await this.bulkEncryptService.decryptItems(
              groupedCiphers,
              keys.orgKeys[orgId as OrganizationId] ?? keys.userKey,
            );
          } else {
            return await this.encryptService.decryptItems(
              groupedCiphers,
              keys.orgKeys[orgId as OrganizationId] ?? keys.userKey,
            );
          }
        }),
      )
    )
      .flat()
      .sort(this.getLocaleSortingFunction());

    return decCiphers;
  }

  private async reindexCiphers() {
    const userId = await this.stateService.getUserId();
    const reindexRequired =
      this.searchService != null &&
      ((await firstValueFrom(this.searchService.indexedEntityId$)) ?? userId) !== userId;
    if (reindexRequired) {
      await this.searchService.indexCiphers(await this.getDecryptedCiphers(), userId);
    }
  }

  async getAllDecryptedForGrouping(groupingId: string, folder = true): Promise<CipherView[]> {
    const ciphers = await this.getAllDecrypted();

    return ciphers.filter((cipher) => {
      if (cipher.isDeleted) {
        return false;
      }
      if (folder && cipher.folderId === groupingId) {
        return true;
      } else if (
        !folder &&
        cipher.collectionIds != null &&
        cipher.collectionIds.indexOf(groupingId) > -1
      ) {
        return true;
      }

      return false;
    });
  }

  async getAllDecryptedForUrl(
    url: string,
    includeOtherTypes?: CipherType[],
    defaultMatch: UriMatchStrategySetting = null,
  ): Promise<CipherView[]> {
    const ciphers = await this.getAllDecrypted();
    return await this.filterCiphersForUrl(ciphers, url, includeOtherTypes, defaultMatch);
  }

  async filterCiphersForUrl(
    ciphers: CipherView[],
    url: string,
    includeOtherTypes?: CipherType[],
    defaultMatch: UriMatchStrategySetting = null,
  ): Promise<CipherView[]> {
    if (url == null && includeOtherTypes == null) {
      return [];
    }

    const equivalentDomains = await firstValueFrom(
      this.domainSettingsService.getUrlEquivalentDomains(url),
    );
    defaultMatch ??= await firstValueFrom(this.domainSettingsService.defaultUriMatchStrategy$);

    return ciphers.filter((cipher) => {
      const cipherIsLogin = cipher.type === CipherType.Login && cipher.login !== null;

      if (cipher.deletedDate !== null) {
        return false;
      }

      if (
        Array.isArray(includeOtherTypes) &&
        includeOtherTypes.includes(cipher.type) &&
        !cipherIsLogin
      ) {
        return true;
      }

      if (cipherIsLogin) {
        return cipher.login.matchesUri(url, equivalentDomains, defaultMatch);
      }

      return false;
    });
  }

  private async getAllDecryptedCiphersOfType(type: CipherType[]): Promise<CipherView[]> {
    const ciphers = await this.getAllDecrypted();
    return ciphers
      .filter((cipher) => cipher.deletedDate == null && type.includes(cipher.type))
      .sort((a, b) => this.sortCiphersByLastUsedThenName(a, b));
  }

  async getAllFromApiForOrganization(organizationId: string): Promise<CipherView[]> {
    const response = await this.apiService.getCiphersOrganization(organizationId);
    return await this.decryptOrganizationCiphersResponse(response, organizationId);
  }

  async getManyFromApiForOrganization(organizationId: string): Promise<CipherView[]> {
    const response = await this.apiService.send(
      "GET",
      "/ciphers/organization-details/assigned?organizationId=" + organizationId,
      null,
      true,
      true,
    );
    return this.decryptOrganizationCiphersResponse(response, organizationId);
  }

  private async decryptOrganizationCiphersResponse(
    response: ListResponse<CipherResponse>,
    organizationId: string,
  ): Promise<CipherView[]> {
    if (response?.data == null || response.data.length < 1) {
      return [];
    }

    const ciphers = response.data.map((cr) => new Cipher(new CipherData(cr)));
    const key = await this.keyService.getOrgKey(organizationId);
    let decCiphers: CipherView[] = [];
    if (await this.configService.getFeatureFlag(FeatureFlag.PM4154_BulkEncryptionService)) {
      decCiphers = await this.bulkEncryptService.decryptItems(ciphers, key);
    } else {
      decCiphers = await this.encryptService.decryptItems(ciphers, key);
    }

    decCiphers.sort(this.getLocaleSortingFunction());
    return decCiphers;
  }

  async getLastUsedForUrl(url: string, autofillOnPageLoad = false): Promise<CipherView> {
    return this.getCipherForUrl(url, true, false, autofillOnPageLoad);
  }

  async getLastLaunchedForUrl(url: string, autofillOnPageLoad = false): Promise<CipherView> {
    return this.getCipherForUrl(url, false, true, autofillOnPageLoad);
  }

  async getNextCipherForUrl(url: string): Promise<CipherView> {
    return this.getCipherForUrl(url, false, false, false);
  }

  async getNextCardCipher(): Promise<CipherView> {
    const cacheKey = "cardCiphers";

    if (!this.sortedCiphersCache.isCached(cacheKey)) {
      const ciphers = await this.getAllDecryptedCiphersOfType([CipherType.Card]);
      if (!ciphers?.length) {
        return null;
      }

      this.sortedCiphersCache.addCiphers(cacheKey, ciphers);
    }

    return this.sortedCiphersCache.getNext(cacheKey);
  }

  async getNextIdentityCipher(): Promise<CipherView> {
    const cacheKey = "identityCiphers";

    if (!this.sortedCiphersCache.isCached(cacheKey)) {
      const ciphers = await this.getAllDecryptedCiphersOfType([CipherType.Identity]);
      if (!ciphers?.length) {
        return null;
      }

      this.sortedCiphersCache.addCiphers(cacheKey, ciphers);
    }

    return this.sortedCiphersCache.getNext(cacheKey);
  }

  updateLastUsedIndexForUrl(url: string) {
    this.sortedCiphersCache.updateLastUsedIndex(url);
  }

  async updateLastUsedDate(id: string): Promise<void> {
    const userId = await firstValueFrom(this.stateProvider.activeUserId$);
    let ciphersLocalData = await firstValueFrom(this.localData$);

    if (!ciphersLocalData) {
      ciphersLocalData = {};
    }

    const cipherId = id as CipherId;
    if (ciphersLocalData[cipherId]) {
      ciphersLocalData[cipherId].lastUsedDate = new Date().getTime();
    } else {
      ciphersLocalData[cipherId] = {
        lastUsedDate: new Date().getTime(),
      };
    }

    await this.localDataState.update(() => ciphersLocalData);

    const decryptedCipherCache = await this.getDecryptedCiphers();
    if (!decryptedCipherCache) {
      return;
    }

    for (let i = 0; i < decryptedCipherCache.length; i++) {
      const cached = decryptedCipherCache[i];
      if (cached.id === id) {
        cached.localData = ciphersLocalData[id as CipherId];
        break;
      }
    }
    await this.setDecryptedCiphers(decryptedCipherCache, userId);
  }

  async updateLastLaunchedDate(id: string): Promise<void> {
    const userId = await firstValueFrom(this.stateProvider.activeUserId$);
    let ciphersLocalData = await firstValueFrom(this.localData$);

    if (!ciphersLocalData) {
      ciphersLocalData = {};
    }

    const currentTime = new Date().getTime();
    ciphersLocalData[id as CipherId] = {
      lastLaunched: currentTime,
      lastUsedDate: currentTime,
    };

    await this.localDataState.update(() => ciphersLocalData);

    const decryptedCipherCache = await this.getDecryptedCiphers();
    if (!decryptedCipherCache) {
      return;
    }

    for (let i = 0; i < decryptedCipherCache.length; i++) {
      const cached = decryptedCipherCache[i];
      if (cached.id === id) {
        cached.localData = ciphersLocalData[id as CipherId];
        break;
      }
    }
    await this.setDecryptedCiphers(decryptedCipherCache, userId);
  }

  async saveNeverDomain(domain: string): Promise<void> {
    if (domain == null) {
      return;
    }

    let domains = await firstValueFrom(this.domainSettingsService.neverDomains$);
    if (!domains) {
      domains = {};
    }
    domains[domain] = null;
    await this.domainSettingsService.setNeverDomains(domains);
  }

  async createWithServer(cipher: Cipher, orgAdmin?: boolean): Promise<Cipher> {
    let response: CipherResponse;
    if (orgAdmin && cipher.organizationId != null) {
      const request = new CipherCreateRequest(cipher);
      response = await this.apiService.postCipherAdmin(request);
      const data = new CipherData(response, cipher.collectionIds);
      return new Cipher(data);
    } else if (cipher.collectionIds != null) {
      const request = new CipherCreateRequest(cipher);
      response = await this.apiService.postCipherCreate(request);
    } else {
      const request = new CipherRequest(cipher);
      response = await this.apiService.postCipher(request);
    }
    cipher.id = response.id;

    const data = new CipherData(response, cipher.collectionIds);
    const updated = await this.upsert(data);
    // No local data for new ciphers
    return new Cipher(updated[cipher.id as CipherId]);
  }

  async updateWithServer(
    cipher: Cipher,
    orgAdmin?: boolean,
    isNotClone?: boolean,
  ): Promise<Cipher> {
    let response: CipherResponse;
    if (orgAdmin && isNotClone) {
      const request = new CipherRequest(cipher);
      response = await this.apiService.putCipherAdmin(cipher.id, request);
      const data = new CipherData(response, cipher.collectionIds);
      return new Cipher(data, cipher.localData);
    } else if (cipher.edit) {
      const request = new CipherRequest(cipher);
      response = await this.apiService.putCipher(cipher.id, request);
    } else {
      const request = new CipherPartialRequest(cipher);
      response = await this.apiService.putPartialCipher(cipher.id, request);
    }

    const data = new CipherData(response, cipher.collectionIds);
    const updated = await this.upsert(data);
    // updating with server does not change local data
    return new Cipher(updated[cipher.id as CipherId], cipher.localData);
  }

  async shareWithServer(
    cipher: CipherView,
    organizationId: string,
    collectionIds: string[],
    userId: UserId,
  ): Promise<any> {
    const attachmentPromises: Promise<any>[] = [];
    if (cipher.attachments != null) {
      cipher.attachments.forEach((attachment) => {
        if (attachment.key == null) {
          attachmentPromises.push(
            this.shareAttachmentWithServer(attachment, cipher.id, organizationId),
          );
        }
      });
    }
    await Promise.all(attachmentPromises);

    cipher.organizationId = organizationId;
    cipher.collectionIds = collectionIds;
    const encCipher = await this.encryptSharedCipher(cipher, userId);
    const request = new CipherShareRequest(encCipher);
    const response = await this.apiService.putShareCipher(cipher.id, request);
    const data = new CipherData(response, collectionIds);
    await this.upsert(data);
  }

  async shareManyWithServer(
    ciphers: CipherView[],
    organizationId: string,
    collectionIds: string[],
    userId: UserId,
  ): Promise<any> {
    const promises: Promise<any>[] = [];
    const encCiphers: Cipher[] = [];
    for (const cipher of ciphers) {
      cipher.organizationId = organizationId;
      cipher.collectionIds = collectionIds;
      promises.push(
        this.encryptSharedCipher(cipher, userId).then((c) => {
          encCiphers.push(c);
        }),
      );
    }
    await Promise.all(promises);
    const request = new CipherBulkShareRequest(encCiphers, collectionIds);
    try {
      await this.apiService.putShareCiphers(request);
    } catch (e) {
      for (const cipher of ciphers) {
        cipher.organizationId = null;
        cipher.collectionIds = null;
      }
      throw e;
    }
    await this.upsert(encCiphers.map((c) => c.toCipherData()));
  }

  saveAttachmentWithServer(
    cipher: Cipher,
    unencryptedFile: any,
    userId: UserId,
    admin = false,
  ): Promise<Cipher> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsArrayBuffer(unencryptedFile);
      reader.onload = async (evt: any) => {
        try {
          const cData = await this.saveAttachmentRawWithServer(
            cipher,
            unencryptedFile.name,
            evt.target.result,
            userId,
            admin,
          );
          resolve(cData);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => {
        reject("Error reading file.");
      };
    });
  }

  async saveAttachmentRawWithServer(
    cipher: Cipher,
    filename: string,
    data: Uint8Array,
    userId: UserId,
    admin = false,
  ): Promise<Cipher> {
    const encKey = await this.getKeyForCipherKeyDecryption(cipher, userId);
    const cipherKeyEncryptionEnabled = await this.getCipherKeyEncryptionEnabled();

    const cipherEncKey =
      cipherKeyEncryptionEnabled && cipher.key != null
        ? (new SymmetricCryptoKey(
            await this.encryptService.decryptToBytes(cipher.key, encKey),
          ) as UserKey)
        : encKey;

    //if cipher key encryption is disabled but the item has an individual key,
    //then we rollback to using the user key as the main key of encryption of the item
    //in order to keep item and it's attachments with the same encryption level
    if (cipher.key != null && !cipherKeyEncryptionEnabled) {
      const model = await cipher.decrypt(await this.getKeyForCipherKeyDecryption(cipher, userId));
      cipher = await this.encrypt(model, userId);
      await this.updateWithServer(cipher);
    }

    const encFileName = await this.encryptService.encrypt(filename, cipherEncKey);

    const dataEncKey = await this.keyService.makeDataEncKey(cipherEncKey);
    const encData = await this.encryptService.encryptToBytes(new Uint8Array(data), dataEncKey[0]);

    const response = await this.cipherFileUploadService.upload(
      cipher,
      encFileName,
      encData,
      admin,
      dataEncKey,
    );

    const cData = new CipherData(response, cipher.collectionIds);
    if (!admin) {
      await this.upsert(cData);
    }
    return new Cipher(cData);
  }

  async saveCollectionsWithServer(cipher: Cipher): Promise<Cipher> {
    const request = new CipherCollectionsRequest(cipher.collectionIds);
    const response = await this.apiService.putCipherCollections(cipher.id, request);
    // The response will now check for an unavailable value. This value determines whether
    // the user still has Can Manage access to the item after updating.
    if (response.unavailable) {
      await this.delete(cipher.id);
      return;
    }
    const data = new CipherData(response.cipher);
    const updated = await this.upsert(data);
    return new Cipher(updated[cipher.id as CipherId], cipher.localData);
  }

  async saveCollectionsWithServerAdmin(cipher: Cipher): Promise<void> {
    const request = new CipherCollectionsRequest(cipher.collectionIds);
    await this.apiService.putCipherCollectionsAdmin(cipher.id, request);
  }

  /**
   * Bulk update collections for many ciphers with the server
   * @param orgId
   * @param cipherIds
   * @param collectionIds
   * @param removeCollections - If true, the collectionIds will be removed from the ciphers, otherwise they will be added
   */
  async bulkUpdateCollectionsWithServer(
    orgId: OrganizationId,
    cipherIds: CipherId[],
    collectionIds: CollectionId[],
    removeCollections: boolean = false,
  ): Promise<void> {
    const request = new CipherBulkUpdateCollectionsRequest(
      orgId,
      cipherIds,
      collectionIds,
      removeCollections,
    );

    await this.apiService.send("POST", "/ciphers/bulk-collections", request, true, false);

    // Update the local state
    const ciphers = await firstValueFrom(this.ciphers$);

    for (const id of cipherIds) {
      const cipher = ciphers[id];
      if (cipher) {
        if (removeCollections) {
          cipher.collectionIds = cipher.collectionIds?.filter(
            (cid) => !collectionIds.includes(cid as CollectionId),
          );
        } else {
          // Append to the collectionIds if it's not already there
          cipher.collectionIds = [...new Set([...(cipher.collectionIds ?? []), ...collectionIds])];
        }
      }
    }

    await this.clearCache();
    await this.encryptedCiphersState.update(() => ciphers);
  }

  async upsert(cipher: CipherData | CipherData[]): Promise<Record<CipherId, CipherData>> {
    const ciphers = cipher instanceof CipherData ? [cipher] : cipher;
    return await this.updateEncryptedCipherState((current) => {
      ciphers.forEach((c) => (current[c.id as CipherId] = c));
      return current;
    });
  }

  async replace(ciphers: { [id: string]: CipherData }, userId: UserId): Promise<any> {
    await this.updateEncryptedCipherState(() => ciphers, userId);
  }

  /**
   * Updates ciphers for the currently active user. Inactive users can only clear all ciphers, for now.
   * @param update update callback for encrypted cipher data
   * @returns
   */
  private async updateEncryptedCipherState(
    update: (current: Record<CipherId, CipherData>) => Record<CipherId, CipherData>,
    userId: UserId = null,
  ): Promise<Record<CipherId, CipherData>> {
    userId ||= await firstValueFrom(this.stateProvider.activeUserId$);
    await this.clearDecryptedCiphersState(userId);
    const updatedCiphers = await this.stateProvider
      .getUser(userId, ENCRYPTED_CIPHERS)
      .update((current) => {
        const result = update(current ?? {});
        return result;
      });
    return updatedCiphers;
  }

  async clear(userId?: UserId): Promise<void> {
    userId ??= await firstValueFrom(this.stateProvider.activeUserId$);
    await this.clearEncryptedCiphersState(userId);
    await this.clearCache(userId);
  }

  async moveManyWithServer(ids: string[], folderId: string): Promise<any> {
    await this.apiService.putMoveCiphers(new CipherBulkMoveRequest(ids, folderId));

    let ciphers = await firstValueFrom(this.ciphers$);
    if (ciphers == null) {
      ciphers = {};
    }

    ids.forEach((id) => {
      // eslint-disable-next-line
      if (ciphers.hasOwnProperty(id)) {
        ciphers[id as CipherId].folderId = folderId;
      }
    });

    await this.clearCache();
    await this.encryptedCiphersState.update(() => ciphers);
  }

  async delete(id: string | string[]): Promise<any> {
    const ciphers = await firstValueFrom(this.ciphers$);
    if (ciphers == null) {
      return;
    }

    if (typeof id === "string") {
      const cipherId = id as CipherId;
      if (ciphers[cipherId] == null) {
        return;
      }
      delete ciphers[cipherId];
    } else {
      (id as CipherId[]).forEach((i) => {
        delete ciphers[i];
      });
    }

    await this.clearCache();
    await this.encryptedCiphersState.update(() => ciphers);
  }

  async deleteWithServer(id: string, asAdmin = false): Promise<any> {
    if (asAdmin) {
      await this.apiService.deleteCipherAdmin(id);
    } else {
      await this.apiService.deleteCipher(id);
    }

    await this.delete(id);
  }

  async deleteManyWithServer(ids: string[], asAdmin = false): Promise<any> {
    const request = new CipherBulkDeleteRequest(ids);
    if (asAdmin) {
      await this.apiService.deleteManyCiphersAdmin(request);
    } else {
      await this.apiService.deleteManyCiphers(request);
    }
    await this.delete(ids);
  }

  async deleteAttachment(id: string, attachmentId: string): Promise<void> {
    let ciphers = await firstValueFrom(this.ciphers$);
    const cipherId = id as CipherId;
    // eslint-disable-next-line
    if (ciphers == null || !ciphers.hasOwnProperty(id) || ciphers[cipherId].attachments == null) {
      return;
    }

    for (let i = 0; i < ciphers[cipherId].attachments.length; i++) {
      if (ciphers[cipherId].attachments[i].id === attachmentId) {
        ciphers[cipherId].attachments.splice(i, 1);
      }
    }

    await this.clearCache();
    await this.encryptedCiphersState.update(() => {
      if (ciphers == null) {
        ciphers = {};
      }
      return ciphers;
    });
  }

  async deleteAttachmentWithServer(id: string, attachmentId: string): Promise<void> {
    try {
      await this.apiService.deleteCipherAttachment(id, attachmentId);
    } catch (e) {
      return Promise.reject((e as ErrorResponse).getSingleMessage());
    }
    await this.deleteAttachment(id, attachmentId);
  }

  sortCiphersByLastUsed(a: CipherView, b: CipherView): number {
    const aLastUsed =
      a.localData && a.localData.lastUsedDate ? (a.localData.lastUsedDate as number) : null;
    const bLastUsed =
      b.localData && b.localData.lastUsedDate ? (b.localData.lastUsedDate as number) : null;

    const bothNotNull = aLastUsed != null && bLastUsed != null;
    if (bothNotNull && aLastUsed < bLastUsed) {
      return 1;
    }
    if (aLastUsed != null && bLastUsed == null) {
      return -1;
    }

    if (bothNotNull && aLastUsed > bLastUsed) {
      return -1;
    }
    if (bLastUsed != null && aLastUsed == null) {
      return 1;
    }

    return 0;
  }

  sortCiphersByLastUsedThenName(a: CipherView, b: CipherView): number {
    const result = this.sortCiphersByLastUsed(a, b);
    if (result !== 0) {
      return result;
    }

    return this.getLocaleSortingFunction()(a, b);
  }

  getLocaleSortingFunction(): (a: CipherView, b: CipherView) => number {
    return (a, b) => {
      let aName = a.name;
      let bName = b.name;

      if (aName == null && bName != null) {
        return -1;
      }
      if (aName != null && bName == null) {
        return 1;
      }
      if (aName == null && bName == null) {
        return 0;
      }

      const result = this.i18nService.collator
        ? this.i18nService.collator.compare(aName, bName)
        : aName.localeCompare(bName);

      if (result !== 0 || a.type !== CipherType.Login || b.type !== CipherType.Login) {
        return result;
      }

      if (a.login.username != null) {
        aName += a.login.username;
      }

      if (b.login.username != null) {
        bName += b.login.username;
      }

      return this.i18nService.collator
        ? this.i18nService.collator.compare(aName, bName)
        : aName.localeCompare(bName);
    };
  }

  async softDelete(id: string | string[]): Promise<any> {
    let ciphers = await firstValueFrom(this.ciphers$);
    if (ciphers == null) {
      return;
    }

    const setDeletedDate = (cipherId: CipherId) => {
      if (ciphers[cipherId] == null) {
        return;
      }
      ciphers[cipherId].deletedDate = new Date().toISOString();
    };

    if (typeof id === "string") {
      setDeletedDate(id as CipherId);
    } else {
      (id as string[]).forEach(setDeletedDate);
    }

    await this.clearCache();
    await this.encryptedCiphersState.update(() => {
      if (ciphers == null) {
        ciphers = {};
      }
      return ciphers;
    });
  }

  async softDeleteWithServer(id: string, asAdmin = false): Promise<any> {
    if (asAdmin) {
      await this.apiService.putDeleteCipherAdmin(id);
    } else {
      await this.apiService.putDeleteCipher(id);
    }

    await this.softDelete(id);
  }

  async softDeleteManyWithServer(ids: string[], asAdmin = false): Promise<any> {
    const request = new CipherBulkDeleteRequest(ids);
    if (asAdmin) {
      await this.apiService.putDeleteManyCiphersAdmin(request);
    } else {
      await this.apiService.putDeleteManyCiphers(request);
    }

    await this.softDelete(ids);
  }

  async restore(
    cipher: { id: string; revisionDate: string } | { id: string; revisionDate: string }[],
  ) {
    let ciphers = await firstValueFrom(this.ciphers$);
    if (ciphers == null) {
      return;
    }

    const clearDeletedDate = (c: { id: string; revisionDate: string }) => {
      const cipherId = c.id as CipherId;
      if (ciphers[cipherId] == null) {
        return;
      }
      ciphers[cipherId].deletedDate = null;
      ciphers[cipherId].revisionDate = c.revisionDate;
    };

    if (cipher.constructor.name === Array.name) {
      (cipher as { id: string; revisionDate: string }[]).forEach(clearDeletedDate);
    } else {
      clearDeletedDate(cipher as { id: string; revisionDate: string });
    }

    await this.clearCache();
    await this.encryptedCiphersState.update(() => {
      if (ciphers == null) {
        ciphers = {};
      }
      return ciphers;
    });
  }

  async restoreWithServer(id: string, asAdmin = false): Promise<any> {
    let response;
    if (asAdmin) {
      response = await this.apiService.putRestoreCipherAdmin(id);
    } else {
      response = await this.apiService.putRestoreCipher(id);
    }

    await this.restore({ id: id, revisionDate: response.revisionDate });
  }

  /**
   * No longer using an asAdmin Param. Org Vault bulkRestore will assess if an item is unassigned or editable
   * The Org Vault will pass those ids an array as well as the orgId when calling bulkRestore
   */
  async restoreManyWithServer(ids: string[], orgId: string = null): Promise<void> {
    let response;

    if (orgId) {
      const request = new CipherBulkRestoreRequest(ids, orgId);
      response = await this.apiService.putRestoreManyCiphersAdmin(request);
    } else {
      const request = new CipherBulkRestoreRequest(ids);
      response = await this.apiService.putRestoreManyCiphers(request);
    }

    const restores: { id: string; revisionDate: string }[] = [];
    for (const cipher of response.data) {
      restores.push({ id: cipher.id, revisionDate: cipher.revisionDate });
    }
    await this.restore(restores);
  }

  async getKeyForCipherKeyDecryption(cipher: Cipher, userId: UserId): Promise<UserKey | OrgKey> {
    return (
      (await this.keyService.getOrgKey(cipher.organizationId)) ||
      ((await this.keyService.getUserKeyWithLegacySupport(userId)) as UserKey)
    );
  }

  async setAddEditCipherInfo(value: AddEditCipherInfo) {
    await this.addEditCipherInfoState.update(() => value, {
      shouldUpdate: (current) => !(current == null && value == null),
    });
  }

  async getRotatedData(
    originalUserKey: UserKey,
    newUserKey: UserKey,
    userId: UserId,
  ): Promise<CipherWithIdRequest[]> {
    if (originalUserKey == null) {
      throw new Error("Original user key is required to rotate ciphers");
    }
    if (newUserKey == null) {
      throw new Error("New user key is required to rotate ciphers");
    }

    let encryptedCiphers: CipherWithIdRequest[] = [];

    const ciphers = await firstValueFrom(this.cipherViews$);
    if (!ciphers) {
      return encryptedCiphers;
    }

    const userCiphers = ciphers.filter((c) => c.organizationId == null);
    if (userCiphers.length === 0) {
      return encryptedCiphers;
    }
    encryptedCiphers = await Promise.all(
      userCiphers.map(async (cipher) => {
        const encryptedCipher = await this.encrypt(cipher, userId, newUserKey, originalUserKey);
        return new CipherWithIdRequest(encryptedCipher);
      }),
    );

    return encryptedCiphers;
  }

  // Helpers

  // In the case of a cipher that is being shared with an organization, we want to decrypt the
  // cipher key with the user's key and then re-encrypt it with the organization's key.
  private async encryptSharedCipher(model: CipherView, userId: UserId): Promise<Cipher> {
    const keyForCipherKeyDecryption = await this.keyService.getUserKeyWithLegacySupport(userId);
    return await this.encrypt(model, userId, null, keyForCipherKeyDecryption);
  }

  private async updateModelfromExistingCipher(
    model: CipherView,
    originalCipher: Cipher,
    userId: UserId,
  ): Promise<void> {
    const existingCipher = await originalCipher.decrypt(
      await this.getKeyForCipherKeyDecryption(originalCipher, userId),
    );
    model.passwordHistory = existingCipher.passwordHistory || [];
    if (model.type === CipherType.Login && existingCipher.type === CipherType.Login) {
      if (
        existingCipher.login.password != null &&
        existingCipher.login.password !== "" &&
        existingCipher.login.password !== model.login.password
      ) {
        const ph = new PasswordHistoryView();
        ph.password = existingCipher.login.password;
        ph.lastUsedDate = model.login.passwordRevisionDate = new Date();
        model.passwordHistory.splice(0, 0, ph);
      } else {
        model.login.passwordRevisionDate = existingCipher.login.passwordRevisionDate;
      }
    }
    if (existingCipher.hasFields) {
      const existingHiddenFields = existingCipher.fields.filter(
        (f) =>
          f.type === FieldType.Hidden &&
          f.name != null &&
          f.name !== "" &&
          f.value != null &&
          f.value !== "",
      );
      const hiddenFields =
        model.fields == null
          ? []
          : model.fields.filter(
              (f) => f.type === FieldType.Hidden && f.name != null && f.name !== "",
            );
      existingHiddenFields.forEach((ef) => {
        const matchedField = hiddenFields.find((f) => f.name === ef.name);
        if (matchedField == null || matchedField.value !== ef.value) {
          const ph = new PasswordHistoryView();
          ph.password = ef.name + ": " + ef.value;
          ph.lastUsedDate = new Date();
          model.passwordHistory.splice(0, 0, ph);
        }
      });
    }
  }

  private adjustPasswordHistoryLength(model: CipherView) {
    if (model.passwordHistory != null && model.passwordHistory.length === 0) {
      model.passwordHistory = null;
    } else if (model.passwordHistory != null && model.passwordHistory.length > 5) {
      // only save last 5 history
      model.passwordHistory = model.passwordHistory.slice(0, 5);
    }
  }

  private async shareAttachmentWithServer(
    attachmentView: AttachmentView,
    cipherId: string,
    organizationId: string,
  ): Promise<any> {
    const attachmentResponse = await this.apiService.nativeFetch(
      new Request(attachmentView.url, { cache: "no-store" }),
    );
    if (attachmentResponse.status !== 200) {
      throw Error("Failed to download attachment: " + attachmentResponse.status.toString());
    }

    const encBuf = await EncArrayBuffer.fromResponse(attachmentResponse);
    const activeUserId = await firstValueFrom(this.accountService.activeAccount$);
    const userKey = await this.keyService.getUserKeyWithLegacySupport(activeUserId.id);
    const decBuf = await this.encryptService.decryptToBytes(encBuf, userKey);

    let encKey: UserKey | OrgKey;
    encKey = await this.keyService.getOrgKey(organizationId);
    encKey ||= (await this.keyService.getUserKeyWithLegacySupport()) as UserKey;

    const dataEncKey = await this.keyService.makeDataEncKey(encKey);

    const encFileName = await this.encryptService.encrypt(attachmentView.fileName, encKey);
    const encData = await this.encryptService.encryptToBytes(new Uint8Array(decBuf), dataEncKey[0]);

    const fd = new FormData();
    try {
      const blob = new Blob([encData.buffer], { type: "application/octet-stream" });
      fd.append("key", dataEncKey[1].encryptedString);
      fd.append("data", blob, encFileName.encryptedString);
    } catch (e) {
      if (Utils.isNode && !Utils.isBrowser) {
        fd.append("key", dataEncKey[1].encryptedString);
        fd.append(
          "data",
          Buffer.from(encData.buffer) as any,
          {
            filepath: encFileName.encryptedString,
            contentType: "application/octet-stream",
          } as any,
        );
      } else {
        throw e;
      }
    }

    try {
      await this.apiService.postShareCipherAttachment(
        cipherId,
        attachmentView.id,
        fd,
        organizationId,
      );
    } catch (e) {
      throw new Error((e as ErrorResponse).getSingleMessage());
    }
  }

  private async encryptObjProperty<V extends View, D extends Domain>(
    model: V,
    obj: D,
    map: any,
    key: SymmetricCryptoKey,
  ): Promise<void> {
    const promises = [];
    const self = this;

    for (const prop in map) {
      // eslint-disable-next-line
      if (!map.hasOwnProperty(prop)) {
        continue;
      }

      (function (theProp, theObj) {
        const p = Promise.resolve()
          .then(() => {
            const modelProp = (model as any)[map[theProp] || theProp];
            if (modelProp && modelProp !== "") {
              return self.encryptService.encrypt(modelProp, key);
            }
            return null;
          })
          .then((val: EncString) => {
            (theObj as any)[theProp] = val;
          });
        promises.push(p);
      })(prop, obj);
    }

    await Promise.all(promises);
  }

  private async encryptCipherData(cipher: Cipher, model: CipherView, key: SymmetricCryptoKey) {
    switch (cipher.type) {
      case CipherType.Login:
        cipher.login = new Login();
        cipher.login.passwordRevisionDate = model.login.passwordRevisionDate;
        cipher.login.autofillOnPageLoad = model.login.autofillOnPageLoad;
        await this.encryptObjProperty(
          model.login,
          cipher.login,
          {
            username: null,
            password: null,
            totp: null,
          },
          key,
        );

        if (model.login.uris != null) {
          cipher.login.uris = [];
          model.login.uris = model.login.uris.filter((u) => u.uri != null && u.uri !== "");
          for (let i = 0; i < model.login.uris.length; i++) {
            const loginUri = new LoginUri();
            loginUri.match = model.login.uris[i].match;
            await this.encryptObjProperty(
              model.login.uris[i],
              loginUri,
              {
                uri: null,
              },
              key,
            );
            const uriHash = await this.encryptService.hash(model.login.uris[i].uri, "sha256");
            loginUri.uriChecksum = await this.encryptService.encrypt(uriHash, key);
            cipher.login.uris.push(loginUri);
          }
        }

        if (model.login.fido2Credentials != null) {
          cipher.login.fido2Credentials = await Promise.all(
            model.login.fido2Credentials.map(async (viewKey) => {
              const domainKey = new Fido2Credential();
              await this.encryptObjProperty(
                viewKey,
                domainKey,
                {
                  credentialId: null,
                  keyType: null,
                  keyAlgorithm: null,
                  keyCurve: null,
                  keyValue: null,
                  rpId: null,
                  rpName: null,
                  userHandle: null,
                  userName: null,
                  userDisplayName: null,
                  origin: null,
                },
                key,
              );
              domainKey.counter = await this.encryptService.encrypt(String(viewKey.counter), key);
              domainKey.discoverable = await this.encryptService.encrypt(
                String(viewKey.discoverable),
                key,
              );
              domainKey.creationDate = viewKey.creationDate;
              return domainKey;
            }),
          );
        }
        return;
      case CipherType.SecureNote:
        cipher.secureNote = new SecureNote();
        cipher.secureNote.type = model.secureNote.type;
        return;
      case CipherType.Card:
        cipher.card = new Card();
        await this.encryptObjProperty(
          model.card,
          cipher.card,
          {
            cardholderName: null,
            brand: null,
            number: null,
            expMonth: null,
            expYear: null,
            code: null,
          },
          key,
        );
        return;
      case CipherType.Identity:
        cipher.identity = new Identity();
        await this.encryptObjProperty(
          model.identity,
          cipher.identity,
          {
            title: null,
            firstName: null,
            middleName: null,
            lastName: null,
            address1: null,
            address2: null,
            address3: null,
            city: null,
            state: null,
            postalCode: null,
            country: null,
            company: null,
            email: null,
            phone: null,
            ssn: null,
            username: null,
            passportNumber: null,
            licenseNumber: null,
          },
          key,
        );
        return;
      default:
        throw new Error("Unknown cipher type.");
    }
  }

  private async getAutofillOnPageLoadDefault() {
    return await firstValueFrom(this.autofillSettingsService.autofillOnPageLoadDefault$);
  }

  private async getCipherForUrl(
    url: string,
    lastUsed: boolean,
    lastLaunched: boolean,
    autofillOnPageLoad: boolean,
  ): Promise<CipherView> {
    const cacheKey = autofillOnPageLoad ? "autofillOnPageLoad-" + url : url;

    if (!this.sortedCiphersCache.isCached(cacheKey)) {
      let ciphers = await this.getAllDecryptedForUrl(url);
      if (!ciphers) {
        return null;
      }

      if (autofillOnPageLoad) {
        const autofillOnPageLoadDefault = await this.getAutofillOnPageLoadDefault();

        ciphers = ciphers.filter(
          (cipher) =>
            cipher.login.autofillOnPageLoad ||
            (cipher.login.autofillOnPageLoad == null && autofillOnPageLoadDefault !== false),
        );
        if (ciphers.length === 0) {
          return null;
        }
      }

      this.sortedCiphersCache.addCiphers(cacheKey, ciphers);
    }

    if (lastLaunched) {
      return this.sortedCiphersCache.getLastLaunched(cacheKey);
    } else if (lastUsed) {
      return this.sortedCiphersCache.getLastUsed(cacheKey);
    } else {
      return this.sortedCiphersCache.getNext(cacheKey);
    }
  }

  private async clearEncryptedCiphersState(userId: UserId) {
    await this.stateProvider.setUserState(ENCRYPTED_CIPHERS, {}, userId);
  }

  private async clearDecryptedCiphersState(userId: UserId) {
    await this.setDecryptedCiphers(null, userId);
    this.clearSortedCiphers();
  }

  private clearSortedCiphers() {
    this.sortedCiphersCache.clear();
  }

  /**
   * Encrypts a cipher object.
   * @param model The cipher view model.
   * @param cipher The cipher object.
   * @param key The encryption key to encrypt with. This can be the org key, user key or cipher key, but must never be null
   */
  private async encryptCipher(
    model: CipherView,
    cipher: Cipher,
    key: SymmetricCryptoKey,
  ): Promise<Cipher> {
    if (key == null) {
      throw new Error(
        "Key to encrypt cipher must not be null. Use the org key, user key or cipher key.",
      );
    }

    await Promise.all([
      this.encryptObjProperty(
        model,
        cipher,
        {
          name: null,
          notes: null,
        },
        key,
      ),
      this.encryptCipherData(cipher, model, key),
      this.encryptFields(model.fields, key).then((fields) => {
        cipher.fields = fields;
      }),
      this.encryptPasswordHistories(model.passwordHistory, key).then((ph) => {
        cipher.passwordHistory = ph;
      }),
      this.encryptAttachments(model.attachments, key).then((attachments) => {
        cipher.attachments = attachments;
      }),
    ]);
    return cipher;
  }

  private async encryptCipherWithCipherKey(
    model: CipherView,
    cipher: Cipher,
    keyForCipherKeyEncryption: SymmetricCryptoKey,
    keyForCipherKeyDecryption: SymmetricCryptoKey,
  ): Promise<Cipher> {
    // First, we get the key for cipher key encryption, in its decrypted form
    let decryptedCipherKey: SymmetricCryptoKey;
    if (cipher.key == null) {
      decryptedCipherKey = await this.keyService.makeCipherKey();
    } else {
      decryptedCipherKey = new SymmetricCryptoKey(
        await this.encryptService.decryptToBytes(cipher.key, keyForCipherKeyDecryption),
      );
    }

    // Then, we have to encrypt the cipher key with the proper key.
    cipher.key = await this.encryptService.encrypt(
      decryptedCipherKey.key,
      keyForCipherKeyEncryption,
    );

    // Finally, we can encrypt the cipher with the decrypted cipher key.
    return this.encryptCipher(model, cipher, decryptedCipherKey);
  }

  private async getCipherKeyEncryptionEnabled(): Promise<boolean> {
    const featureEnabled = await this.configService.getFeatureFlag(FeatureFlag.CipherKeyEncryption);
    const meetsServerVersion = await firstValueFrom(
      this.configService.checkServerMeetsVersionRequirement$(CIPHER_KEY_ENC_MIN_SERVER_VER),
    );
    return featureEnabled && meetsServerVersion;
  }
}

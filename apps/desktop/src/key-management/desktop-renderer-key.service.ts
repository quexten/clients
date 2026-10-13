import { BehaviorSubject, Observable, distinctUntilChanged, firstValueFrom, map } from "rxjs";

import { AccountCryptographicStateService } from "@bitwarden/common/key-management/account-cryptography/account-cryptographic-state.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { CommandDefinition, MessageListener } from "@bitwarden/common/platform/messaging";
import { StateProvider } from "@bitwarden/common/platform/state";
import { UserId } from "@bitwarden/common/types/guid";
import { UserKey } from "@bitwarden/common/types/key";
import { BiometricsService, DefaultKeyService } from "@bitwarden/key-management";
// eslint-disable-next-line no-restricted-imports
import {
  CryptoFunctionService,
  EncryptService,
  SymmetricCryptoKey,
} from "@bitwarden/legacy-crypto";

import { UNLOCK_COMPLETED } from "./unlock/unlock-ipc.types";

// Main owns the user key; these messages announce key changes across the process boundary.
const LOCKED = new CommandDefinition<{ userId: UserId }>("locked");
const LOGGED_OUT = new CommandDefinition<{ userId: UserId }>("logout");

/**
 * The renderer's {@link KeyService}. Main owns the user key, so the renderer does not store its own
 * copy in `USER_KEY` state. Instead this service keeps a local cache that is seeded from main and
 * updated by the `unlockCompleted` / `locked` / `logout` messages main broadcasts. Decryption still
 * happens in the renderer, keyed off {@link userKey$}.
 */
export class DesktopRendererKeyService extends DefaultKeyService {
  private readonly userKeys$ = new BehaviorSubject<Record<UserId, UserKey | null>>({});

  constructor(
    cryptoFunctionService: CryptoFunctionService,
    encryptService: EncryptService,
    platformUtilService: PlatformUtilsService,
    logService: LogService,
    stateService: StateService,
    stateProvider: StateProvider,
    accountCryptographyStateService: AccountCryptographicStateService,
    biometricsService: BiometricsService,
    private readonly messageListener: MessageListener,
  ) {
    super(
      cryptoFunctionService,
      encryptService,
      platformUtilService,
      logService,
      stateService,
      stateProvider,
      accountCryptographyStateService,
      biometricsService,
    );

    this.messageListener
      .messages$(UNLOCK_COMPLETED)
      .subscribe(({ userId, userKeyB64 }) =>
        this.setKey(userId, SymmetricCryptoKey.fromString(userKeyB64) as UserKey),
      );
    this.messageListener.messages$(LOCKED).subscribe(({ userId }) => this.clearKey(userId));
    this.messageListener.messages$(LOGGED_OUT).subscribe(({ userId }) => this.clearKey(userId));

    void this.loadInitialUserKeys();
  }

  override userKey$(userId: UserId): Observable<UserKey | null> {
    return this.userKeys$.pipe(
      map((keys) => keys[userId] ?? null),
      // Rewriting the same key must not make consumers, e.g. vault decryption, start over.
      distinctUntilChanged((a, b) => a?.keyB64 === b?.keyB64),
    );
  }

  override async hasUserKey(userId: UserId): Promise<boolean> {
    if (userId == null) {
      return false;
    }

    return (await firstValueFrom(this.userKey$(userId))) != null;
  }

  private async loadInitialUserKeys(): Promise<void> {
    const { unlocked } = await ipc.keyManagement.unlock.getUnlockSessions();

    const keys: Record<UserId, UserKey | null> = {};
    for (const [userId, seed] of Object.entries(unlocked)) {
      keys[userId as UserId] = SymmetricCryptoKey.fromString(seed.userKeyB64) as UserKey;
    }
    this.userKeys$.next(keys);
  }

  private setKey(userId: UserId, key: UserKey): void {
    this.userKeys$.next({ ...this.userKeys$.value, [userId]: key });
  }

  private clearKey(userId: UserId): void {
    this.userKeys$.next({ ...this.userKeys$.value, [userId]: null });
  }
}

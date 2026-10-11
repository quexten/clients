// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Injectable } from "@angular/core";
import { Observable, Subject, concatMap, firstValueFrom } from "rxjs";

import {
  MASTER_PASSWORD_UNLOCK_DATA,
  USER_KEY,
} from "@bitwarden/common/key-management/state-definitions";
import { MessageListener } from "@bitwarden/common/platform/messaging";
import { UserKey } from "@bitwarden/common/types/key";
// eslint-disable-next-line no-restricted-imports
import { SymmetricCryptoKey } from "@bitwarden/legacy-crypto";
import { StateProvider } from "@bitwarden/state";
import {
  KeyConnectorUnlockData,
  UnlockEvent,
  UnlockMethod,
  UnlockService,
} from "@bitwarden/unlock";
import { UserId } from "@bitwarden/user-core";

import { UNLOCK_COMPLETED, UnlockRequest } from "./unlock-ipc.types";

/**
 * The renderer's {@link UnlockService}. Main owns the session, so each unlock is forwarded to main
 * over IPC, and the returned key is written into the renderer's `USER_KEY` state. Unlocks main
 * performs itself (biometric auto-prompt, shared unlock, boot auto-unlock) arrive over
 * `unlockCompleted` and are handled the same way.
 */
@Injectable()
export class RendererUnlockService implements UnlockService {
  private readonly onUnlockActions: Array<
    (userId: UserId, userKey: SymmetricCryptoKey, method: UnlockMethod) => Promise<void>
  > = [];
  private readonly _unlocked$ = new Subject<UnlockEvent>();
  readonly unlocked$: Observable<UnlockEvent> = this._unlocked$.asObservable();

  constructor(
    private readonly stateProvider: StateProvider,
    private readonly messageListener: MessageListener,
  ) {
    this.messageListener
      .messages$(UNLOCK_COMPLETED)
      .pipe(
        concatMap(({ userId, userKeyB64, method }) =>
          this.onUnlockCompleted(userId, userKeyB64, method),
        ),
      )
      .subscribe();
  }

  async unlockWithPin(userId: UserId, pin: string): Promise<void> {
    await this.unlock({ userId, method: UnlockMethod.Pin, pin });
  }

  async unlockWithMasterPassword(userId: UserId, masterPassword: string): Promise<void> {
    const unlockData = await firstValueFrom(
      this.stateProvider.getUser(userId, MASTER_PASSWORD_UNLOCK_DATA).state$,
    );

    await this.unlock({
      userId,
      method: UnlockMethod.MasterPassword,
      password: masterPassword,
      masterPasswordUnlockData: unlockData != null ? JSON.stringify(unlockData) : null,
    });
  }

  async unlockWithBiometrics(userId: UserId): Promise<void> {
    await this.unlock({ userId, method: UnlockMethod.Biometrics });
  }

  async unlockWithKeyConnector(
    userId: UserId,
    keyConnectorUnlockData: KeyConnectorUnlockData,
  ): Promise<void> {
    await this.unlock({
      userId,
      method: UnlockMethod.KeyConnector,
      url: keyConnectorUnlockData.url,
      keyConnectorKeyWrappedUserKey: keyConnectorUnlockData.keyConnectorKeyWrappedUserKey,
    });
  }

  async unlockWithDecryptedUserKey(
    userId: UserId,
    userKey: SymmetricCryptoKey,
    method: UnlockMethod = UnlockMethod.DecryptedUserKey,
  ): Promise<void> {
    await this.unlock({
      userId,
      method: UnlockMethod.DecryptedUserKey,
      userKeyB64: userKey.toBase64(),
      unlockMethod: method,
    });
  }

  async unlockFromSharedUnlock(userId: UserId, userKey: SymmetricCryptoKey): Promise<void> {
    await this.unlock({
      userId,
      method: UnlockMethod.DecryptedUserKey,
      userKeyB64: userKey.toBase64(),
      unlockMethod: UnlockMethod.SharedUnlock,
    });
  }

  async unlockWithAutoUnlockKey(userId: UserId): Promise<boolean> {
    const { userKeyB64 } = await ipc.keyManagement.session.unlock({
      userId,
      method: UnlockMethod.AutoKey,
    });
    if (userKeyB64 == null) {
      return false;
    }
    await this.seedUserKey(userId, userKeyB64);
    return true;
  }

  registerOnUnlockAction(
    action: (userId: UserId, userKey: SymmetricCryptoKey, method: UnlockMethod) => Promise<void>,
  ): void {
    this.onUnlockActions.push(action);
  }

  async runOnUnlockActions(
    userId: UserId,
    userKey: SymmetricCryptoKey,
    method: UnlockMethod,
  ): Promise<void> {
    for (const action of this.onUnlockActions) {
      await action(userId, userKey, method);
    }
    this._unlocked$.next({ userId, method });
  }

  private async unlock(request: UnlockRequest): Promise<void> {
    const { userKeyB64 } = await ipc.keyManagement.session.unlock(request);
    if (userKeyB64 == null) {
      throw new Error("Unlock failed");
    }
    await this.seedUserKey(request.userId, userKeyB64);
  }

  private async seedUserKey(userId: UserId, userKeyB64: string): Promise<void> {
    await this.stateProvider.setUserState(
      USER_KEY,
      SymmetricCryptoKey.fromString(userKeyB64) as UserKey,
      userId,
    );
  }

  private async onUnlockCompleted(
    userId: UserId,
    userKeyB64: string,
    method: UnlockMethod,
  ): Promise<void> {
    await this.seedUserKey(userId, userKeyB64);
    await this.runOnUnlockActions(userId, SymmetricCryptoKey.fromString(userKeyB64), method);
  }
}

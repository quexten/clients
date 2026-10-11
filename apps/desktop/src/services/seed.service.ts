import { Injectable } from "@angular/core";

import { USER_KEY } from "@bitwarden/common/key-management/state-definitions";
import { UserKey } from "@bitwarden/common/types/key";
// eslint-disable-next-line no-restricted-imports
import { SymmetricCryptoKey } from "@bitwarden/legacy-crypto";
import { StateProvider } from "@bitwarden/state";
import { UserId } from "@bitwarden/user-core";

/**
 * Seeds the renderer's SDK client from the session state the main process owns. Writing the user
 * key into the renderer's `USER_KEY` state makes `DefaultSdkService.internalClient$` re-initialize
 * an unlocked client automatically.
 */
@Injectable()
export class SeedService {
  constructor(private readonly stateProvider: StateProvider) {}

  /** Re-seeds every account main reports as unlocked. Run on renderer boot / re-appearance. */
  async seed(): Promise<void> {
    const { unlocked } = await ipc.keyManagement.session.requestSeed();
    for (const [userId, seed] of Object.entries(unlocked)) {
      await this.seedUserKey(userId as UserId, seed.userKeyB64);
    }
  }

  async seedUserKey(userId: UserId, userKeyB64: string): Promise<void> {
    await this.stateProvider.setUserState(
      USER_KEY,
      SymmetricCryptoKey.fromString(userKeyB64) as UserKey,
      userId,
    );
  }
}

import { filter, startWith, Subject, switchMap } from "rxjs";

import { MessageListener } from "@bitwarden/common/platform/messaging";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/services/cipher.service";
import { perUserCache$ } from "@bitwarden/common/vault/utils/observable-utilities";

/** What main's `CipherService` sends each time its list views change. */
const LIST_VIEWS_CHANGED = "updateOverlayCiphers";

/**
 * The renderer's cipher service. Takes the list views from main, which owns the session and
 * already decrypted them, instead of decrypting the whole vault a second time.
 */
export class DesktopRendererCipherService extends CipherService {
  private readonly clearListViews$ = new Subject<UserId | null>();

  constructor(
    private readonly messageListener: MessageListener,
    ...cipherServiceArgs: ConstructorParameters<typeof CipherService>
  ) {
    super(...cipherServiceArgs);
  }

  // Fetches on first use and whenever main announces new list views, so the renderer never asks
  // before main caught up with a change.
  override cipherListViewsIncludingRestricted$ = perUserCache$(
    (userId: UserId) =>
      this.messageListener.allMessages$.pipe(
        filter((message) => message.command === LIST_VIEWS_CHANGED),
        startWith(null),
        switchMap(() => ipc.vault.getCipherListViews(userId)),
      ),
    this.clearListViews$,
  );

  /** Drops the renderer's copy of the list views too, e.g. on lock. */
  override async clearCache(userId?: UserId): Promise<void> {
    await super.clearCache(userId);
    this.clearListViews$.next(userId ?? null);
  }
}

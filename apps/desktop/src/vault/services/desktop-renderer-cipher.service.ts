import {
  concatMap,
  distinctUntilChanged,
  filter,
  map,
  merge,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
} from "rxjs";

import { MessageListener } from "@bitwarden/common/platform/messaging";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { CipherService } from "@bitwarden/common/vault/services/cipher.service";
import { perUserCache$ } from "@bitwarden/common/vault/utils/observable-utilities";
import { KeyService } from "@bitwarden/key-management";
import { CipherListView } from "@bitwarden/sdk-internal";

/** What main's `CipherService` sends each time its list views change. */
const LIST_VIEWS_CHANGED = "updateOverlayCiphers";

/**
 * The renderer's cipher service. Takes the list views from main, which owns the session and
 * already decrypted them, instead of decrypting the whole vault a second time.
 */
export class DesktopRendererCipherService extends CipherService {
  private readonly clearListViews$ = new Subject<UserId | null>();
  private readonly refetchListViews$ = new Subject<UserId | null>();
  private readonly userKeyService: KeyService;

  constructor(
    private readonly messageListener: MessageListener,
    ...cipherServiceArgs: ConstructorParameters<typeof CipherService>
  ) {
    super(...cipherServiceArgs);
    this.userKeyService = cipherServiceArgs[0];
  }

  // List views exist only while unlocked: a lock drops them, and nothing is fetched until the
  // next unlock.
  override cipherListViewsIncludingRestricted$ = perUserCache$(
    (userId: UserId) =>
      this.userKeyService.userKey$(userId).pipe(
        map((userKey) => userKey != null),
        distinctUntilChanged(),
        switchMap((unlocked) => (unlocked ? this.listViewsFromMain$(userId) : of(null))),
      ),
    this.clearListViews$,
  );

  /** Drops the renderer's copy of the list views too, then asks main for current ones. */
  override async clearCache(userId?: UserId): Promise<void> {
    await super.clearCache(userId);
    this.clearListViews$.next(userId ?? null);
    // Main may have announced its last change before this clear, e.g. during the sync after
    // login, so waiting for its next announcement could wait forever.
    this.refetchListViews$.next(userId ?? null);
  }

  // Fetches on first use, after a cache clear, and whenever main announces new list views.
  private listViewsFromMain$(userId: UserId): Observable<CipherListView[]> {
    return merge(
      this.messageListener.allMessages$.pipe(
        filter((message) => message.command === LIST_VIEWS_CHANGED),
      ),
      this.refetchListViews$.pipe(filter((id) => id === userId || id === null)),
    ).pipe(
      startWith(null),
      switchMap(() => ipc.vault.getCipherListViews(userId)),
      // The vault list waits for the decryption failures to be known; they live in memory
      // state, per process, so main's arrive with its list views.
      concatMap(async ({ listViews, failures }) => {
        await this.setFailedDecryptedCiphers(
          (failures ?? []).map((failure) => CipherView.fromJSON(failure)),
          userId,
        );
        return listViews;
      }),
    );
  }
}

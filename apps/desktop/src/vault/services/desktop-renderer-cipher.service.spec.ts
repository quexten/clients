import { mock } from "jest-mock-extended";
import { BehaviorSubject, firstValueFrom, Subject } from "rxjs";

import { Message, MessageListener } from "@bitwarden/common/platform/messaging";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { CipherService } from "@bitwarden/common/vault/services/cipher.service";
import { CipherListView } from "@bitwarden/sdk-internal";

import { DesktopRendererCipherService } from "./desktop-renderer-cipher.service";

describe("DesktopRendererCipherService", () => {
  const userId = "user-id" as UserId;
  let messages$: Subject<Message<Record<string, unknown>>>;
  let getCipherListViews: jest.Mock;
  let userKey$: BehaviorSubject<unknown>;
  let service: DesktopRendererCipherService;

  /** Lets pending promises and the observables they feed settle. */
  const flush = () => new Promise((resolve) => setTimeout(resolve));
  const listViews = (name: string) => [{ id: "cipher-id", name }] as unknown as CipherListView[];
  /** What main answers: its list views, and the ciphers it failed to decrypt. */
  const fromMain = (name: string, failures: object[] = []) => ({
    listViews: listViews(name),
    failures,
  });

  beforeEach(() => {
    messages$ = new Subject();
    getCipherListViews = jest.fn().mockResolvedValue(fromMain("first"));
    (global as any).ipc = { vault: { getCipherListViews } };

    // Only the list-view stream is under test; the inherited dependencies stay mocks, except
    // the key service, whose user key tells whether the user is unlocked.
    userKey$ = new BehaviorSubject<unknown>({ key: "user-key" });
    const keyService = mock<any>();
    keyService.userKey$.mockReturnValue(userKey$);
    const cipherServiceDeps = [
      keyService,
      ...Array.from({ length: 14 }, () => mock<any>()),
    ] as ConstructorParameters<typeof CipherService>;
    service = new DesktopRendererCipherService(
      new MessageListener(messages$),
      ...cipherServiceDeps,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).ipc;
  });

  it("takes the list views from main instead of decrypting them", async () => {
    const views = await firstValueFrom(service.cipherListViewsIncludingRestricted$(userId));

    expect(views).toEqual(listViews("first"));
    expect(getCipherListViews).toHaveBeenCalledWith(userId);
  });

  it("takes main's decryption failures too, which the vault list waits for", async () => {
    // The failures live in memory state, per process: main's never reach the renderer.
    getCipherListViews.mockResolvedValue(fromMain("first", [{ id: "failed-id", name: "failed" }]));
    const setFailed = jest.spyOn(service, "setFailedDecryptedCiphers").mockResolvedValue(undefined);

    await firstValueFrom(service.cipherListViewsIncludingRestricted$(userId));

    const [failures, failuresUserId] = setFailed.mock.calls[0];
    expect(failures.map((cipher) => [cipher.id, cipher instanceof CipherView])).toEqual([
      ["failed-id", true],
    ]);
    expect(failuresUserId).toBe(userId);
  });

  it("treats a missing failures answer as none", async () => {
    // Main's failures stream replays null after a cache clear in main.
    getCipherListViews.mockResolvedValue({ listViews: listViews("first"), failures: null });
    jest.spyOn(service, "setFailedDecryptedCiphers").mockResolvedValue(undefined);

    const views = await firstValueFrom(service.cipherListViewsIncludingRestricted$(userId));

    expect(views).toEqual(listViews("first"));
    expect(service.setFailedDecryptedCiphers).toHaveBeenCalledWith([], userId);
  });

  it("fetches again when main announces new list views", async () => {
    const emitted: (CipherListView[] | null)[] = [];
    const subscription = service
      .cipherListViewsIncludingRestricted$(userId)
      .subscribe((views) => emitted.push(views));
    await Promise.resolve();

    getCipherListViews.mockResolvedValue(fromMain("second"));
    messages$.next({ command: "updateOverlayCiphers" });
    await flush();

    expect(emitted.at(-1)).toEqual(listViews("second"));
    expect(getCipherListViews).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it("asks main again after a cache clear, even when main has nothing new to announce", async () => {
    // E.g. the sync after login: main decrypts and announces once, then the renderer's sync
    // clears its cache.
    const emitted: (CipherListView[] | null)[] = [];
    const subscription = service
      .cipherListViewsIncludingRestricted$(userId)
      .subscribe((views) => emitted.push(views));
    await Promise.resolve();
    jest.spyOn(CipherService.prototype, "clearCache").mockResolvedValue(undefined);

    getCipherListViews.mockResolvedValue(fromMain("after clear"));
    await service.clearCache(userId);
    await flush();

    expect(emitted.at(-1)).toEqual(listViews("after clear"));
    subscription.unsubscribe();
  });

  it("drops its copy of the list views when the user locks, and fetches none", async () => {
    const emitted: (CipherListView[] | null)[] = [];
    const subscription = service
      .cipherListViewsIncludingRestricted$(userId)
      .subscribe((views) => emitted.push(views));
    await Promise.resolve();
    jest.spyOn(CipherService.prototype, "clearCache").mockResolvedValue(undefined);

    userKey$.next(null);
    await service.clearCache(userId);
    await Promise.resolve();

    expect(emitted.at(-1)).toBeNull();
    expect(getCipherListViews).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });
});

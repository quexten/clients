import { mock } from "jest-mock-extended";
import { firstValueFrom, Subject } from "rxjs";

import { Message, MessageListener } from "@bitwarden/common/platform/messaging";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/services/cipher.service";
import { CipherListView } from "@bitwarden/sdk-internal";

import { DesktopRendererCipherService } from "./desktop-renderer-cipher.service";

describe("DesktopRendererCipherService", () => {
  const userId = "user-id" as UserId;
  let messages$: Subject<Message<Record<string, unknown>>>;
  let getCipherListViews: jest.Mock;
  let service: DesktopRendererCipherService;

  const listViews = (name: string) => [{ id: "cipher-id", name }] as unknown as CipherListView[];

  beforeEach(() => {
    messages$ = new Subject();
    getCipherListViews = jest.fn().mockResolvedValue(listViews("first"));
    (global as any).ipc = { vault: { getCipherListViews } };

    // Only the list-view stream is under test; the inherited dependencies stay mocks.
    const cipherServiceDeps = Array.from({ length: 15 }, () =>
      mock<any>(),
    ) as ConstructorParameters<typeof CipherService>;
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

  it("fetches again when main announces new list views", async () => {
    const emitted: (CipherListView[] | null)[] = [];
    const subscription = service
      .cipherListViewsIncludingRestricted$(userId)
      .subscribe((views) => emitted.push(views));
    await Promise.resolve();

    getCipherListViews.mockResolvedValue(listViews("second"));
    messages$.next({ command: "updateOverlayCiphers" });
    await Promise.resolve();
    await Promise.resolve();

    expect(emitted.at(-1)).toEqual(listViews("second"));
    expect(getCipherListViews).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it("drops its copy of the list views when the cache is cleared", async () => {
    const emitted: (CipherListView[] | null)[] = [];
    const subscription = service
      .cipherListViewsIncludingRestricted$(userId)
      .subscribe((views) => emitted.push(views));
    await Promise.resolve();

    jest.spyOn(CipherService.prototype, "clearCache").mockResolvedValue(undefined);
    await service.clearCache(userId);

    expect(emitted.at(-1)).toBeNull();
    subscription.unsubscribe();
  });
});

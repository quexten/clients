import { ipcMain } from "electron";
import { firstValueFrom } from "rxjs";

import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/services/cipher.service";
import { filterOutNullish } from "@bitwarden/common/vault/utils/observable-utilities";

import { CipherListViewsResponse, GET_CIPHER_LIST_VIEWS_CHANNEL } from "../vault-ipc.types";

/**
 * The main-process IPC surface for the vault. Main owns the session and already decrypts the list
 * views, so the renderer takes them from here instead of decrypting the whole vault again.
 */
export class MainVaultIpcListener {
  constructor(private readonly cipherService: CipherService) {}

  init(): void {
    ipcMain.handle(
      GET_CIPHER_LIST_VIEWS_CHANNEL,
      async (_event, userId: UserId): Promise<CipherListViewsResponse> => {
        const listViews = await firstValueFrom(
          this.cipherService.cipherListViewsIncludingRestricted$(userId).pipe(filterOutNullish()),
        );
        // Replays null after a cache clear, until the next decrypt sets the failures again.
        const failures =
          (await firstValueFrom(this.cipherService.failedToDecryptCiphers$(userId))) ?? [];

        return { listViews, failures: JSON.parse(JSON.stringify(failures)) };
      },
    );
  }
}

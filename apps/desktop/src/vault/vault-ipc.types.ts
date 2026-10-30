import { Jsonify } from "type-fest";

import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { CipherListView } from "@bitwarden/sdk-internal";

/** IPC channel on which the renderer asks main for a user's decrypted cipher list views. */
export const GET_CIPHER_LIST_VIEWS_CHANNEL = "vault.getCipherListViews";

/** Main's answer on {@link GET_CIPHER_LIST_VIEWS_CHANNEL}. */
export type CipherListViewsResponse = {
  listViews: CipherListView[];
  /**
   * The ciphers main failed to decrypt. They live in memory state, which each process keeps on its
   * own, so the renderer only learns them from here.
   */
  failures: Jsonify<CipherView>[];
};

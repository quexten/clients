import { ipcRenderer } from "electron";

import { UserId } from "@bitwarden/common/types/guid";
import { CipherListView } from "@bitwarden/sdk-internal";

import { GET_CIPHER_LIST_VIEWS_CHANNEL } from "./vault-ipc.types";

export default {
  getCipherListViews: (userId: UserId): Promise<CipherListView[]> =>
    ipcRenderer.invoke(GET_CIPHER_LIST_VIEWS_CHANNEL, userId),
};

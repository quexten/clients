import { ipcRenderer } from "electron";

import { UserId } from "@bitwarden/common/types/guid";

import { CipherListViewsResponse, GET_CIPHER_LIST_VIEWS_CHANNEL } from "./vault-ipc.types";

export default {
  getCipherListViews: (userId: UserId): Promise<CipherListViewsResponse> =>
    ipcRenderer.invoke(GET_CIPHER_LIST_VIEWS_CHANNEL, userId),
};

import { contextBridge, ipcRenderer } from "electron";

import { SSH_APPROVAL_IPC_CHANNELS } from "../autofill/models/ipc-channels";
import { MiniUnlockMethod, MiniUnlockResult } from "../autofill/models/mini-unlock";
import { SshApprovalState } from "../autofill/models/ssh-approval";

/**
 * Preload script for the SSH approval window.
 *
 * Exposes only what the approval window needs. Before modifying, read:
 * https://www.electronjs.org/docs/latest/tutorial/tutorial-preload
 * https://www.electronjs.org/docs/latest/api/context-bridge
 */
export const ipc = {
  getState: (): Promise<SshApprovalState | null> =>
    ipcRenderer.invoke(SSH_APPROVAL_IPC_CHANNELS.GET_STATE),
  onStateChanged: (fn: (state: SshApprovalState) => void): void => {
    ipcRenderer.on(SSH_APPROVAL_IPC_CHANNELS.STATE_CHANGED, (_event, state: SshApprovalState) =>
      fn(state),
    );
  },
  unlock: (method: MiniUnlockMethod, secret?: string): Promise<MiniUnlockResult> =>
    ipcRenderer.invoke(SSH_APPROVAL_IPC_CHANNELS.UNLOCK, method, secret),
  respond: (accepted: boolean): Promise<void> =>
    ipcRenderer.invoke(SSH_APPROVAL_IPC_CHANNELS.RESPOND, accepted),
  resize: (height: number): void => {
    ipcRenderer.send(SSH_APPROVAL_IPC_CHANNELS.RESIZE, height);
  },
};

contextBridge.exposeInMainWorld("ipc", ipc);

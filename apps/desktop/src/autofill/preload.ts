import { ipcRenderer } from "electron";

import { DesktopAutofillPreload } from "./desktop-autofill.preload";
import { AutotypeConfig } from "./models/autotype-config";
import { AutotypeMatchError } from "./models/autotype-errors";
import { AutotypeVaultData } from "./models/autotype-vault-data";
import {
  AUTOTYPE_MVP_IPC_CHANNELS,
  MAGNIFY_IPC_CHANNELS,
  SSH_AGENT_IPC_CHANNELS,
} from "./models/ipc-channels";
import { MagnifyCommandRequest, MagnifyCommandResponse } from "./models/magnify-commands";

const sshAgent = {
  init: async () => {
    await ipcRenderer.invoke(SSH_AGENT_IPC_CHANNELS.INIT);
  },
  replace: (keys: { name: string; privateKey: string; cipherId: string }[]): Promise<void> =>
    ipcRenderer.invoke(SSH_AGENT_IPC_CHANNELS.REPLACE, keys),
  signRequestResponse: async (requestId: number, accepted: boolean) => {
    await ipcRenderer.invoke(SSH_AGENT_IPC_CHANNELS.SIGN_REQUEST_RESPONSE, { requestId, accepted });
  },
  listRequestResponse: async (requestId: number, accepted: boolean) => {
    await ipcRenderer.invoke(SSH_AGENT_IPC_CHANNELS.LIST_KEYS_RESPONSE, { requestId, accepted });
  },
  isLoaded(): Promise<boolean> {
    return ipcRenderer.invoke(SSH_AGENT_IPC_CHANNELS.IS_LOADED);
  },
  stop: async () => ipcRenderer.invoke(SSH_AGENT_IPC_CHANNELS.STOP),
};

// MVP, delete with PM-41067
const autotypeMvp = {
  configure: (config: AutotypeConfig) => {
    ipcRenderer.send(AUTOTYPE_MVP_IPC_CHANNELS.CONFIGURE, config);
  },
  toggle: (enable: boolean) => {
    ipcRenderer.send(AUTOTYPE_MVP_IPC_CHANNELS.TOGGLE, enable);
  },
  listenRequest: (
    fn: (
      windowTitle: string,
      completeCallback: (error: Error | null, response: AutotypeVaultData | null) => void,
    ) => void,
  ) => {
    ipcRenderer.on(
      AUTOTYPE_MVP_IPC_CHANNELS.LISTEN,
      (
        _event,
        data: {
          windowTitle: string;
        },
      ) => {
        const { windowTitle } = data;

        fn(windowTitle, (error, vaultData) => {
          if (error) {
            const matchError: AutotypeMatchError = {
              windowTitle,
              errorMessage: error.message,
            };
            ipcRenderer.send(AUTOTYPE_MVP_IPC_CHANNELS.EXECUTION_ERROR, matchError);
            return;
          }

          if (vaultData !== null) {
            ipcRenderer.send(AUTOTYPE_MVP_IPC_CHANNELS.EXECUTE, vaultData);
          }
        });
      },
    );
  },
};

const magnify = {
  toggleMagnify: (enable: boolean) => {
    ipcRenderer.send(MAGNIFY_IPC_CHANNELS.TOGGLE, enable);
  },
  listenMagnifyCommand: (
    fn: (
      request: MagnifyCommandRequest,
      completeCallback: (error: Error | null, response: MagnifyCommandResponse | null) => void,
    ) => void,
  ) => {
    ipcRenderer.on(
      MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RELAY,
      (_event, request: MagnifyCommandRequest) => {
        fn(request, (error, response) => {
          if (error) {
            ipcRenderer.send(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RELAY_ERROR, error.message);
            return;
          }

          if (response !== null) {
            ipcRenderer.send(MAGNIFY_IPC_CHANNELS.MAGNIFY_COMMAND_RESPONSE, response);
          }
        });
      },
    );
  },
};

export default {
  desktopAutofill: DesktopAutofillPreload,

  sshAgent,

  autotypeMvp,

  magnify,
};

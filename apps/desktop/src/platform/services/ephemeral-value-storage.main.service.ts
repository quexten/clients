import { ipcMain } from "electron";

export class EphemeralValueStorageService {
  private sharedSecrets = new Map<string, string>();

  constructor() {
    ipcMain.handle("setEphemeralValue", async (event, { key, value }) => {
      this.sharedSecrets.set(key, value);
    });
    ipcMain.handle("getEphemeralValue", async (event, key: string) => {
      return this.sharedSecrets.get(key);
    });
    ipcMain.handle("deleteEphemeralValue", async (event, key: string) => {
      this.sharedSecrets.delete(key);
    });
  }
}

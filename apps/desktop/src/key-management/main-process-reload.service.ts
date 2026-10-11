import { ProcessReloadServiceAbstraction } from "@bitwarden/common/key-management/process-reload";

/**
 * The {@link ProcessReloadServiceAbstraction} implementation for the Electron main process.
 *
 * The renderer clears its memory by crashing + reloading itself, but the main process has no
 * renderer to reload. A main-process lock/logout only needs to clear in-memory state, so this is a
 * no-op.
 */
export class MainProcessReloadService extends ProcessReloadServiceAbstraction {
  async reloadProcess(): Promise<void> {}
}

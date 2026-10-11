import { SystemService } from "@bitwarden/common/platform/abstractions/system.service";

/**
 * The {@link SystemService} implementation for the Electron main process. Clipboard clearing is
 * owned by the renderer, so these are no-ops in main.
 */
export class MainSystemService extends SystemService {
  async clearClipboard(clipboardValue: string, timeoutMs?: number): Promise<void> {}

  async clearPendingClipboard(): Promise<any> {}
}

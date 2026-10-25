import { Injectable, NgZone, inject } from "@angular/core";

import {
  MiniUnlockMethod,
  MiniUnlockResult,
  SshApprovalState,
} from "../../autofill/models/ssh-approval";

/** Wraps the preload bridge so components stay testable and run callbacks inside Angular. */
@Injectable({
  providedIn: "root",
})
export class ApprovalIpcService {
  private readonly zone = inject(NgZone);

  getState(): Promise<SshApprovalState | null> {
    return window.ipc.getState();
  }

  onStateChanged(fn: (state: SshApprovalState) => void): void {
    // Bridge callbacks arrive outside the Angular zone.
    window.ipc.onStateChanged((state: SshApprovalState) => this.zone.run(() => fn(state)));
  }

  unlock(method: MiniUnlockMethod, secret?: string): Promise<MiniUnlockResult> {
    return window.ipc.unlock(method, secret);
  }

  respond(accepted: boolean): Promise<void> {
    return window.ipc.respond(accepted);
  }

  resize(height: number): void {
    window.ipc.resize(height);
  }
}

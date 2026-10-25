import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
} from "@angular/core";

import { SshApprovalMode, SshApprovalState } from "../../autofill/models/ssh-approval";
import { ApprovalIpcService } from "../services/approval-ipc.service";

import { ApproveRequestComponent } from "./components/approve-request/approve-request.component";
import { MiniUnlockComponent } from "./components/mini-unlock/mini-unlock.component";

@Component({
  selector: "ssh-approval-root",
  standalone: true,
  imports: [ApproveRequestComponent, MiniUnlockComponent],
  template: `
    @if (state(); as s) {
      @if (s.mode === Mode.Unlock && s.unlockOptions) {
        <mini-unlock [options]="s.unlockOptions" [strings]="s.strings" />
      } @else if (s.mode === Mode.Approve && s.request) {
        <approve-request [request]="s.request" [strings]="s.strings" />
      }
    }
  `,
  host: { style: "display: block" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly ipc = inject(ApprovalIpcService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly Mode = SshApprovalMode;
  protected readonly state = signal<SshApprovalState | null>(null);

  constructor() {
    this.ipc.onStateChanged((state) => this.state.set(state));
    void this.ipc.getState().then((state) => this.state.set(state));

    // Fit the window to whatever view is showing.
    afterNextRender(() => {
      if (typeof ResizeObserver === "undefined") {
        return;
      }
      const observer = new ResizeObserver(() =>
        this.ipc.resize(this.host.nativeElement.scrollHeight),
      );
      observer.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}

import { ChangeDetectionStrategy, Component, inject, input, signal } from "@angular/core";

import { SshApprovalRequest, SshApprovalStrings } from "../../../../autofill/models/ssh-approval";
import { ApprovalIpcService } from "../../../services/approval-ipc.service";

@Component({
  selector: "approve-request",
  standalone: true,
  templateUrl: "./approve-request.component.html",
  styleUrl: "./approve-request.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApproveRequestComponent {
  private readonly ipc = inject(ApprovalIpcService);

  readonly request = input.required<SshApprovalRequest>();
  readonly strings = input.required<SshApprovalStrings>();

  protected readonly busy = signal(false);

  protected respond(accepted: boolean): void {
    this.busy.set(true);
    void this.ipc.respond(accepted);
  }
}

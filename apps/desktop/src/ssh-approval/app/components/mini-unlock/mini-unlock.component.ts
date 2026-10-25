import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";

import {
  MiniUnlockMethod,
  MiniUnlockOptions,
  MiniUnlockResult,
  SshApprovalStrings,
} from "../../../../autofill/models/ssh-approval";
import { ApprovalIpcService } from "../../../services/approval-ipc.service";

// Same priority as the lock screen: biometrics, then PIN, then master password.
const METHOD_ORDER: MiniUnlockMethod[] = [
  MiniUnlockMethod.Biometrics,
  MiniUnlockMethod.Pin,
  MiniUnlockMethod.MasterPassword,
];

@Component({
  selector: "mini-unlock",
  standalone: true,
  templateUrl: "./mini-unlock.component.html",
  styleUrl: "./mini-unlock.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniUnlockComponent {
  private readonly ipc = inject(ApprovalIpcService);

  readonly options = input.required<MiniUnlockOptions>();
  readonly strings = input.required<SshApprovalStrings>();

  protected readonly Method = MiniUnlockMethod;
  protected readonly methods = computed(() => METHOD_ORDER.filter((m) => this.options()[m]));

  private readonly chosen = signal<MiniUnlockMethod | null>(null);
  protected readonly method = computed(() => this.chosen() ?? this.methods()[0] ?? null);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly secretInput = viewChild<ElementRef<HTMLInputElement>>("secret");

  constructor() {
    // Focus the field whenever it appears, e.g. after switching tabs.
    effect(() => this.secretInput()?.nativeElement.focus());
  }

  protected label(method: MiniUnlockMethod): string {
    const strings = this.strings();
    switch (method) {
      case MiniUnlockMethod.Biometrics:
        return strings.unlockWithBiometrics;
      case MiniUnlockMethod.Pin:
        return strings.pin;
      case MiniUnlockMethod.MasterPassword:
        return strings.masterPassword;
    }
  }

  protected select(method: MiniUnlockMethod): void {
    this.chosen.set(method);
    this.error.set(null);
  }

  protected submit(event: Event, secret: string): void {
    event.preventDefault();
    const method = this.method();
    if (method == null || method === MiniUnlockMethod.Biometrics) {
      return;
    }
    void this.unlock(method, secret);
  }

  protected unlockWithBiometrics(): void {
    void this.unlock(MiniUnlockMethod.Biometrics);
  }

  private async unlock(method: MiniUnlockMethod, secret?: string): Promise<void> {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.ipc.unlock(method, secret);
      this.error.set(this.errorFor(method, result));
    } catch {
      this.error.set(this.strings().errorOccurred);
    } finally {
      this.busy.set(false);
    }
  }

  // On success main switches the window to the approval view, so there is nothing to show.
  private errorFor(method: MiniUnlockMethod, result: MiniUnlockResult): string | null {
    const strings = this.strings();
    switch (result) {
      case MiniUnlockResult.Success:
      case MiniUnlockResult.Cancelled:
        return null;
      case MiniUnlockResult.Invalid:
        return method === MiniUnlockMethod.Pin ? strings.invalidPin : strings.invalidMasterPassword;
      case MiniUnlockResult.TooManyAttempts:
        return strings.tooManyAttempts;
      default:
        return strings.errorOccurred;
    }
  }
}

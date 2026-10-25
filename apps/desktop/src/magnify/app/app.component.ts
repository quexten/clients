import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  signal,
  viewChild,
} from "@angular/core";

import { MagnifyAuthStatus } from "../../autofill/models/magnify-commands";
import { MiniUnlockState } from "../../autofill/models/mini-unlock";
import { MiniUnlockComponent } from "../../mini-unlock/mini-unlock.component";
import { CommandService } from "../services/command-service";

import { SearchBarComponent } from "./components/search-bar/search-bar.component";
import { VaultAuthStatusComponent } from "./components/vault-auth-status/vault-auth-status.component";
import { SEARCH_BAR_HEIGHT, VAULT_AUTH_STATUS_HEIGHT } from "./utils/magnify-layout";

@Component({
  selector: "magnify-root",
  standalone: true,
  imports: [SearchBarComponent, VaultAuthStatusComponent, MiniUnlockComponent],
  template: `
    @if (authStatus() === AuthStatus.Unlocked) {
      <search-bar />
    } @else if (authStatus() === AuthStatus.Locked && unlockState(); as state) {
      <div #unlockView class="magnify-unlock">
        <mini-unlock [options]="state.options" [strings]="state.strings" (unlocked)="refresh()" />
      </div>
    } @else if (authStatus() !== null) {
      <vault-auth-status [status]="authStatus()!" />
    }
  `,
  styles: `
    .magnify-unlock {
      border-radius: 12px;
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  protected readonly AuthStatus = MagnifyAuthStatus;
  private readonly _authStatus = signal<MagnifyAuthStatus | null>(null);
  readonly authStatus = this._authStatus.asReadonly();

  protected readonly unlockState = signal<MiniUnlockState | null>(null);
  private readonly unlockView = viewChild<ElementRef<HTMLElement>>("unlockView");

  constructor(private readonly commandService: CommandService) {
    // Fit the window to the mini unlock while it shows; its height changes with tabs and errors.
    effect((onCleanup) => {
      const el = this.unlockView()?.nativeElement;
      if (el == null || typeof ResizeObserver === "undefined") {
        return;
      }
      const observer = new ResizeObserver(() => this.commandService.resize(el.scrollHeight));
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });

    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    let status: MagnifyAuthStatus;
    try {
      status = await this.commandService.getAuthStatus();
    } catch {
      status = MagnifyAuthStatus.Locked;
    }

    if (status === MagnifyAuthStatus.Locked) {
      this.unlockState.set(
        await this.commandService.getUnlockState().catch((): MiniUnlockState | null => null),
      );
    }
    this._authStatus.set(status);

    if (status === MagnifyAuthStatus.Unlocked) {
      this.commandService.resize(SEARCH_BAR_HEIGHT);
    } else if (this.unlockState() == null) {
      this.commandService.resize(VAULT_AUTH_STATUS_HEIGHT);
    }
  }
}

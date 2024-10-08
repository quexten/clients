import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { Router } from "@angular/router";
import { Observable, shareReplay } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { BillingAccountProfileStateService } from "@bitwarden/common/billing/abstractions";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import {
  CardComponent,
  FormFieldModule,
  SectionComponent,
  SectionHeaderComponent,
  TypographyModule,
  IconButtonModule,
  BadgeModule,
  ColorPasswordModule,
} from "@bitwarden/components";

import { BitTotpCountdownComponent } from "../../components/totp-countdown/totp-countdown.component";

@Component({
  selector: "app-login-credentials-view",
  templateUrl: "login-credentials-view.component.html",
  standalone: true,
  imports: [
    CommonModule,
    JslibModule,
    CardComponent,
    SectionComponent,
    SectionHeaderComponent,
    TypographyModule,
    FormFieldModule,
    IconButtonModule,
    BadgeModule,
    ColorPasswordModule,
    BitTotpCountdownComponent,
  ],
})
export class LoginCredentialsViewComponent {
  @Input() cipher: CipherView;

  isPremium$: Observable<boolean> =
    this.billingAccountProfileStateService.hasPremiumFromAnySource$.pipe(
      shareReplay({ refCount: true, bufferSize: 1 }),
    );
  showPasswordCount: boolean = false;
  passwordRevealed: boolean = false;
  totpCopyCode: string;

  constructor(
    private billingAccountProfileStateService: BillingAccountProfileStateService,
    private router: Router,
  ) {}

  async getPremium() {
    await this.router.navigate(["/premium"]);
  }

  pwToggleValue(evt: boolean) {
    this.passwordRevealed = evt;
  }

  togglePasswordCount() {
    this.showPasswordCount = !this.showPasswordCount;
  }

  setTotpCopyCode(e: any) {
    this.totpCopyCode = e;
  }
}

import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";

import { TwoFactorAuthAuthenticatorComponent } from "@bitwarden/angular/auth/components/two-factor-auth/two-factor-auth-authenticator.component";
import { TwoFactorAuthComponent as BaseTwoFactorAuthComponent } from "@bitwarden/angular/auth/components/two-factor-auth/two-factor-auth.component";
import { TwoFactorOptionsComponent } from "@bitwarden/angular/auth/components/two-factor-auth/two-factor-options.component";
import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nPipe } from "@bitwarden/angular/platform/pipes/i18n.pipe";
import { TwoFactorProviderType } from "@bitwarden/common/auth/enums/two-factor-provider-type";
import {
  ButtonModule,
  FormFieldModule,
  AsyncActionsModule,
  CheckboxModule,
  DialogModule,
  LinkModule,
  TypographyModule,
} from "@bitwarden/components";

import BrowserPopupUtils from "../../platform/popup/browser-popup-utils";

@Component({
  standalone: true,
  templateUrl:
    "../../../../../libs/angular/src/auth/components/two-factor-auth/two-factor-auth.component.html",
  selector: "app-two-factor-auth",
  imports: [
    CommonModule,
    JslibModule,
    DialogModule,
    ButtonModule,
    LinkModule,
    TypographyModule,
    ReactiveFormsModule,
    FormFieldModule,
    AsyncActionsModule,
    RouterLink,
    CheckboxModule,
    TwoFactorOptionsComponent,
    TwoFactorAuthAuthenticatorComponent,
  ],
  providers: [I18nPipe],
})
export class TwoFactorAuthComponent extends BaseTwoFactorAuthComponent implements OnInit {
  async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    if (await BrowserPopupUtils.inPopout(this.win)) {
      this.selectedProviderType = TwoFactorProviderType.Email;
    }
  }
}

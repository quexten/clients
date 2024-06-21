import { DialogModule } from "@angular/cdk/dialog";
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nPipe } from "@bitwarden/angular/platform/pipes/i18n.pipe";
import { AuthResult } from "@bitwarden/common/auth/models/domain/auth-result";
import { LinkModule, TypographyModule, CheckboxModule } from "@bitwarden/components";

import { TwoFactorAuthAuthenticatorComponent } from "../../../../../libs/angular/src/auth/components/two-factor-auth/two-factor-auth-authenticator.component";
import { TwoFactorAuthComponent as BaseTwoFactorAuthComponent } from "../../../../../libs/angular/src/auth/components/two-factor-auth/two-factor-auth.component";
import { TwoFactorOptionsComponent } from "../../../../../libs/angular/src/auth/components/two-factor-auth/two-factor-options.component";
import { AsyncActionsModule } from "../../../../../libs/components/src/async-actions";
import { ButtonModule } from "../../../../../libs/components/src/button";
import { FormFieldModule } from "../../../../../libs/components/src/form-field";

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
export class TwoFactorAuthComponent extends BaseTwoFactorAuthComponent {
  protected override handleMigrateEncryptionKey(result: AuthResult): boolean {
    if (!result.requiresEncryptionKeyMigration) {
      return false;
    }
    // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.router.navigate(["migrate-legacy-encryption"]);
    return true;
  }
}

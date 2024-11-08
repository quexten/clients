import { CommonModule } from "@angular/common";
import { booleanAttribute, Component, Input, OnInit } from "@angular/core";
import { Router, RouterModule } from "@angular/router";
import { firstValueFrom, map, Observable } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherRepromptType, CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { CipherAuthorizationService } from "@bitwarden/common/vault/services/cipher-authorization.service";
import {
  DialogService,
  IconButtonModule,
  ItemModule,
  MenuModule,
  ToastService,
} from "@bitwarden/components";
import { PasswordRepromptService } from "@bitwarden/vault";

import { VaultPopupAutofillService } from "../../../services/vault-popup-autofill.service";
import { AddEditQueryParams } from "../add-edit/add-edit-v2.component";

@Component({
  standalone: true,
  selector: "app-item-more-options",
  templateUrl: "./item-more-options.component.html",
  imports: [ItemModule, IconButtonModule, MenuModule, CommonModule, JslibModule, RouterModule],
})
export class ItemMoreOptionsComponent implements OnInit {
  @Input({
    required: true,
  })
  cipher: CipherView;

  /**
   * Flag to hide the autofill menu options. Used for items that are
   * already in the autofill list suggestion.
   */
  @Input({ transform: booleanAttribute })
  hideAutofillOptions: boolean;

  protected autofillAllowed$ = this.vaultPopupAutofillService.autofillAllowed$;
  protected canClone$: Observable<boolean>;

  /** Boolean dependent on the current user having access to an organization */
  protected hasOrganizations = false;

  constructor(
    private cipherService: CipherService,
    private passwordRepromptService: PasswordRepromptService,
    private toastService: ToastService,
    private dialogService: DialogService,
    private router: Router,
    private i18nService: I18nService,
    private vaultPopupAutofillService: VaultPopupAutofillService,
    private accountService: AccountService,
    private organizationService: OrganizationService,
    private cipherAuthorizationService: CipherAuthorizationService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.hasOrganizations = await this.organizationService.hasOrganizations();
    this.canClone$ = this.cipherAuthorizationService.canCloneCipher$(this.cipher);
  }

  get canEdit() {
    return this.cipher.edit;
  }

  /**
   * Determines if the cipher can be autofilled.
   */
  get canAutofill() {
    return [CipherType.Login, CipherType.Card, CipherType.Identity].includes(this.cipher.type);
  }

  get isLogin() {
    return this.cipher.type === CipherType.Login;
  }

  get favoriteText() {
    return this.cipher.favorite ? "unfavorite" : "favorite";
  }

  async doAutofill() {
    await this.vaultPopupAutofillService.doAutofill(this.cipher);
  }

  async doAutofillAndSave() {
    await this.vaultPopupAutofillService.doAutofillAndSave(this.cipher, false);
  }

  /**
   * Toggles the favorite status of the cipher and updates it on the server.
   */
  async toggleFavorite() {
    this.cipher.favorite = !this.cipher.favorite;
    const activeUserId = await firstValueFrom(
      this.accountService.activeAccount$.pipe(map((a) => a?.id)),
    );
    const encryptedCipher = await this.cipherService.encrypt(this.cipher, activeUserId);
    await this.cipherService.updateWithServer(encryptedCipher);
    this.toastService.showToast({
      variant: "success",
      title: null,
      message: this.i18nService.t(
        this.cipher.favorite ? "itemAddedToFavorites" : "itemRemovedFromFavorites",
      ),
    });
  }

  /**
   * Navigate to the clone cipher page with the current cipher as the source.
   * A password reprompt is attempted if the cipher requires it.
   * A confirmation dialog is shown if the cipher has FIDO2 credentials.
   */
  async clone() {
    if (
      this.cipher.reprompt === CipherRepromptType.Password &&
      !(await this.passwordRepromptService.showPasswordPrompt())
    ) {
      return;
    }

    if (this.cipher.login?.hasFido2Credentials) {
      const confirmed = await this.dialogService.openSimpleDialog({
        title: { key: "passkeyNotCopied" },
        content: { key: "passkeyNotCopiedAlert" },
        type: "info",
      });

      if (!confirmed) {
        return;
      }
    }

    await this.router.navigate(["/clone-cipher"], {
      queryParams: {
        clone: true.toString(),
        cipherId: this.cipher.id,
        type: this.cipher.type.toString(),
      } as AddEditQueryParams,
    });
  }

  /** Prompts for password when necessary then navigates to the assign collections route */
  async conditionallyNavigateToAssignCollections() {
    if (this.cipher.reprompt && !(await this.passwordRepromptService.showPasswordPrompt())) {
      return;
    }

    await this.router.navigate(["/assign-collections"], {
      queryParams: { cipherId: this.cipher.id },
    });
  }
}

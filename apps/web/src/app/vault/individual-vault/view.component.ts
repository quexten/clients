import { DIALOG_DATA, DialogConfig, DialogRef } from "@angular/cdk/dialog";
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Inject, OnInit } from "@angular/core";
import { Observable } from "rxjs";

import { CollectionView } from "@bitwarden/admin-console/common";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { CollectionId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { ViewPasswordHistoryService } from "@bitwarden/common/vault/abstractions/view-password-history.service";
import { CipherType } from "@bitwarden/common/vault/enums/cipher-type";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { CipherAuthorizationService } from "@bitwarden/common/vault/services/cipher-authorization.service";
import {
  AsyncActionsModule,
  DialogModule,
  DialogService,
  ToastService,
} from "@bitwarden/components";

import { PremiumUpgradePromptService } from "../../../../../../libs/common/src/vault/abstractions/premium-upgrade-prompt.service";
import { CipherViewComponent } from "../../../../../../libs/vault/src/cipher-view/cipher-view.component";
import { SharedModule } from "../../shared/shared.module";
import { WebVaultPremiumUpgradePromptService } from "../services/web-premium-upgrade-prompt.service";
import { WebViewPasswordHistoryService } from "../services/web-view-password-history.service";

export interface ViewCipherDialogParams {
  cipher: CipherView;

  /**
   * Optional list of collections the cipher is assigned to. If none are provided, they will be loaded using the
   * `CipherService` and the `collectionIds` property of the cipher.
   */
  collections?: CollectionView[];

  /**
   * Optional collection ID used to know the collection filter selected.
   */
  activeCollectionId?: CollectionId;

  /**
   * If true, the edit button will be disabled in the dialog.
   */
  disableEdit?: boolean;
}

export enum ViewCipherDialogResult {
  Edited = "edited",
  Deleted = "deleted",
  PremiumUpgrade = "premiumUpgrade",
}

export interface ViewCipherDialogCloseResult {
  action: ViewCipherDialogResult;
}

/**
 * Component for viewing a cipher, presented in a dialog.
 * @deprecated Use the VaultItemDialogComponent instead.
 */
@Component({
  selector: "app-vault-view",
  templateUrl: "view.component.html",
  standalone: true,
  imports: [CipherViewComponent, CommonModule, AsyncActionsModule, DialogModule, SharedModule],
  providers: [
    { provide: ViewPasswordHistoryService, useClass: WebViewPasswordHistoryService },
    { provide: PremiumUpgradePromptService, useClass: WebVaultPremiumUpgradePromptService },
  ],
})
export class ViewComponent implements OnInit {
  cipher: CipherView;
  collections?: CollectionView[];
  onDeletedCipher = new EventEmitter<CipherView>();
  cipherTypeString: string;
  organization: Organization;

  canDeleteCipher$: Observable<boolean>;

  constructor(
    @Inject(DIALOG_DATA) public params: ViewCipherDialogParams,
    private dialogRef: DialogRef<ViewCipherDialogCloseResult>,
    private i18nService: I18nService,
    private dialogService: DialogService,
    private messagingService: MessagingService,
    private logService: LogService,
    private cipherService: CipherService,
    private toastService: ToastService,
    private organizationService: OrganizationService,
    private cipherAuthorizationService: CipherAuthorizationService,
  ) {}

  /**
   * Lifecycle hook for component initialization.
   */
  async ngOnInit() {
    this.cipher = this.params.cipher;
    this.collections = this.params.collections;
    this.cipherTypeString = this.getCipherViewTypeString();
    if (this.cipher.organizationId) {
      this.organization = await this.organizationService.get(this.cipher.organizationId);
    }

    this.canDeleteCipher$ = this.cipherAuthorizationService.canDeleteCipher$(this.cipher, [
      this.params.activeCollectionId,
    ]);
  }

  /**
   * Method to handle cipher deletion. Called when a user clicks the delete button.
   */
  delete = async () => {
    const confirmed = await this.dialogService.openSimpleDialog({
      title: { key: "deleteItem" },
      content: {
        key: this.cipher.isDeleted ? "permanentlyDeleteItemConfirmation" : "deleteItemConfirmation",
      },
      type: "warning",
    });

    if (!confirmed) {
      return;
    }

    try {
      await this.deleteCipher();
      this.toastService.showToast({
        variant: "success",
        title: this.i18nService.t("success"),
        message: this.i18nService.t(
          this.cipher.isDeleted ? "permanentlyDeletedItem" : "deletedItem",
        ),
      });
      this.onDeletedCipher.emit(this.cipher);
      this.messagingService.send(
        this.cipher.isDeleted ? "permanentlyDeletedCipher" : "deletedCipher",
      );
    } catch (e) {
      this.logService.error(e);
    }

    this.dialogRef.close({ action: ViewCipherDialogResult.Deleted });
  };

  /**
   * Helper method to delete cipher.
   */
  protected async deleteCipher(): Promise<void> {
    const asAdmin = this.organization?.canEditAllCiphers;
    if (this.cipher.isDeleted) {
      await this.cipherService.deleteWithServer(this.cipher.id, asAdmin);
    } else {
      await this.cipherService.softDeleteWithServer(this.cipher.id, asAdmin);
    }
  }

  /**
   * Method to handle cipher editing. Called when a user clicks the edit button.
   */
  async edit(): Promise<void> {
    this.dialogRef.close({ action: ViewCipherDialogResult.Edited });
  }

  /**
   * Method to get cipher view type string, used for the dialog title.
   * E.g. "View login" or "View note".
   * @returns The localized string for the cipher type
   */
  getCipherViewTypeString(): string {
    if (!this.cipher) {
      return null;
    }

    switch (this.cipher.type) {
      case CipherType.Login:
        return this.i18nService.t("viewItemType", this.i18nService.t("typeLogin").toLowerCase());
      case CipherType.SecureNote:
        return this.i18nService.t("viewItemType", this.i18nService.t("note").toLowerCase());
      case CipherType.Card:
        return this.i18nService.t("viewItemType", this.i18nService.t("typeCard").toLowerCase());
      case CipherType.Identity:
        return this.i18nService.t("viewItemType", this.i18nService.t("typeIdentity").toLowerCase());
      default:
        return null;
    }
  }
}

/**
 * Strongly typed helper to open a cipher view dialog
 * @param dialogService Instance of the dialog service that will be used to open the dialog
 * @param config Configuration for the dialog
 * @returns A reference to the opened dialog
 */
export function openViewCipherDialog(
  dialogService: DialogService,
  config: DialogConfig<ViewCipherDialogParams>,
): DialogRef<ViewCipherDialogCloseResult> {
  return dialogService.open(ViewComponent, config);
}

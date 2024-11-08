import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { CommonModule } from "@angular/common";
import { Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { Router } from "@angular/router";
import { firstValueFrom, Observable, Subject } from "rxjs";
import { map } from "rxjs/operators";

import { CollectionView } from "@bitwarden/admin-console/common";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { BillingAccountProfileStateService } from "@bitwarden/common/billing/abstractions";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { CipherId, CollectionId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { PremiumUpgradePromptService } from "@bitwarden/common/vault/abstractions/premium-upgrade-prompt.service";
import { ViewPasswordHistoryService } from "@bitwarden/common/vault/abstractions/view-password-history.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { CipherAuthorizationService } from "@bitwarden/common/vault/services/cipher-authorization.service";
import {
  AsyncActionsModule,
  ButtonModule,
  DialogModule,
  DialogService,
  ItemModule,
  ToastService,
} from "@bitwarden/components";
import {
  CipherAttachmentsComponent,
  CipherFormConfig,
  CipherFormGenerationService,
  CipherFormModule,
  CipherViewComponent,
} from "@bitwarden/vault";

import { SharedModule } from "../../../shared/shared.module";
import {
  AttachmentDialogCloseResult,
  AttachmentDialogResult,
  AttachmentsV2Component,
} from "../../individual-vault/attachments-v2.component";
import { WebCipherFormGenerationService } from "../../services/web-cipher-form-generation.service";
import { WebVaultPremiumUpgradePromptService } from "../../services/web-premium-upgrade-prompt.service";
import { WebViewPasswordHistoryService } from "../../services/web-view-password-history.service";

export type VaultItemDialogMode = "view" | "form";

export interface VaultItemDialogParams {
  /**
   * The mode of the dialog.
   * - `view` is for viewing an existing cipher.
   * - `form` is for editing or creating a new cipher.
   */
  mode: VaultItemDialogMode;

  /**
   * The configuration object for the dialog and form.
   */
  formConfig: CipherFormConfig;

  /**
   * If true, the "edit" button will be disabled in the dialog.
   */
  disableForm?: boolean;

  /**
   * The ID of the active collection. This is know the collection filter selected by the user.
   */
  activeCollectionId?: CollectionId;

  /**
   * If true, the dialog is being opened from the admin console.
   */
  isAdminConsoleAction?: boolean;
}

export enum VaultItemDialogResult {
  /**
   * A cipher was saved (created or updated).
   */
  Saved = "saved",

  /**
   * A cipher was deleted.
   */
  Deleted = "deleted",

  /**
   * The dialog was closed to navigate the user the premium upgrade page.
   */
  PremiumUpgrade = "premiumUpgrade",
}

@Component({
  selector: "app-vault-item-dialog",
  templateUrl: "vault-item-dialog.component.html",
  standalone: true,
  imports: [
    ButtonModule,
    CipherViewComponent,
    DialogModule,
    CommonModule,
    SharedModule,
    CipherFormModule,
    CipherAttachmentsComponent,
    AsyncActionsModule,
    ItemModule,
  ],
  providers: [
    { provide: PremiumUpgradePromptService, useClass: WebVaultPremiumUpgradePromptService },
    { provide: ViewPasswordHistoryService, useClass: WebViewPasswordHistoryService },
    { provide: CipherFormGenerationService, useClass: WebCipherFormGenerationService },
  ],
})
export class VaultItemDialogComponent implements OnInit, OnDestroy {
  /**
   * Reference to the dialog content element. Used to scroll to the top of the dialog when switching modes.
   * @protected
   */
  @ViewChild("dialogContent")
  protected dialogContent: ElementRef<HTMLElement>;

  /**
   * Tracks if the cipher was ever modified while the dialog was open. Used to ensure the dialog emits the correct result
   * in case of closing with the X button or ESC key.
   * @private
   */
  private _cipherModified: boolean = false;

  /**
   * The original mode of the form when the dialog is first opened.
   * Used to determine if the form should switch to edit mode after successfully creating a new cipher.
   * @private
   */
  private _originalFormMode = this.params.formConfig.mode;

  /**
   * Subject to emit when the form is ready to be displayed.
   * @private
   */
  private _formReadySubject = new Subject<void>();

  /**
   * Tracks if the dialog is performing the initial load. Used to display a spinner while loading.
   * @private
   */
  protected performingInitialLoad: boolean = true;

  /**
   * The title of the dialog. Updates based on the dialog mode and cipher type.
   * @protected
   */
  protected title: string;

  /**
   * The current cipher being viewed. Undefined if creating a new cipher.
   * @protected
   */
  protected cipher?: CipherView;

  /**
   * The organization the current cipher belongs to. Undefined if creating a new cipher.
   * @protected
   */
  protected organization?: Organization;

  /**
   * The collections the current cipher is assigned to. Undefined if creating a new cipher.
   * @protected
   */
  protected collections?: CollectionView[];

  /**
   * Flag to indicate if the user has access to attachments via a premium subscription.
   * @protected
   */
  protected canAccessAttachments$ = this.billingAccountProfileStateService.hasPremiumFromAnySource$;

  protected get loadingForm() {
    return this.loadForm && !this.formReady;
  }

  protected get disableEdit() {
    return this.params.disableForm;
  }

  protected get canDelete() {
    return this.cipher?.edit ?? false;
  }

  protected get showDelete() {
    // Don't show the delete button when cloning a cipher
    if (this.params.mode == "form" && this.formConfig.mode === "clone") {
      return false;
    }
    // Never show the delete button for new ciphers
    return this.cipher != null;
  }

  protected get showCipherView() {
    return this.cipher != undefined && (this.params.mode === "view" || this.loadingForm);
  }

  /**
   * Flag to initialize/attach the form component.
   */
  protected loadForm = this.params.mode === "form";

  /**
   * Flag to indicate the form is ready to be displayed.
   */
  protected formReady = false;

  protected formConfig: CipherFormConfig = this.params.formConfig;

  protected canDeleteCipher$: Observable<boolean>;

  constructor(
    @Inject(DIALOG_DATA) protected params: VaultItemDialogParams,
    private dialogRef: DialogRef<VaultItemDialogResult>,
    private dialogService: DialogService,
    private i18nService: I18nService,
    private toastService: ToastService,
    private messagingService: MessagingService,
    private logService: LogService,
    private cipherService: CipherService,
    private accountService: AccountService,
    private router: Router,
    private billingAccountProfileStateService: BillingAccountProfileStateService,
    private premiumUpgradeService: PremiumUpgradePromptService,
    private cipherAuthorizationService: CipherAuthorizationService,
  ) {
    this.updateTitle();
  }

  async ngOnInit() {
    this.cipher = await this.getDecryptedCipherView(this.formConfig);

    if (this.cipher) {
      this.collections = this.formConfig.collections.filter((c) =>
        this.cipher.collectionIds?.includes(c.id),
      );
      this.organization = this.formConfig.organizations.find(
        (o) => o.id === this.cipher.organizationId,
      );

      this.canDeleteCipher$ = this.cipherAuthorizationService.canDeleteCipher$(
        this.cipher,
        [this.params.activeCollectionId],
        this.params.isAdminConsoleAction,
      );
    }

    this.performingInitialLoad = false;
  }

  ngOnDestroy() {
    // If the cipher was modified, be sure we emit the saved result in case the dialog was closed with the X button or ESC key.
    if (this._cipherModified) {
      this.dialogRef.close(VaultItemDialogResult.Saved);
    }
  }

  /**
   * Called by the CipherFormComponent when the cipher is saved successfully.
   * @param cipherView - The newly saved cipher.
   */
  protected async onCipherSaved(cipherView: CipherView) {
    // We successfully saved the cipher, update the dialog state and switch to view mode.
    this.cipher = cipherView;
    this.collections = this.formConfig.collections.filter((c) =>
      cipherView.collectionIds?.includes(c.id),
    );

    // If the cipher was newly created (via add/clone), switch the form to edit for subsequent edits.
    if (this._originalFormMode === "add" || this._originalFormMode === "clone") {
      this.formConfig.mode = "edit";
    }
    this.formConfig.originalCipher = await this.cipherService.get(cipherView.id);
    this._cipherModified = true;
    await this.changeMode("view");
  }

  /**
   * Called by the CipherFormComponent when the form is ready to be displayed.
   */
  protected onFormReady() {
    this.formReady = true;
    this._formReadySubject.next();
  }

  delete = async () => {
    if (!this.cipher) {
      return;
    }
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
      this.messagingService.send(
        this.cipher.isDeleted ? "permanentlyDeletedCipher" : "deletedCipher",
      );
    } catch (e) {
      this.logService.error(e);
    }
    this._cipherModified = false;
    this.dialogRef.close(VaultItemDialogResult.Deleted);
  };

  openAttachmentsDialog = async () => {
    const canAccessAttachments = await firstValueFrom(this.canAccessAttachments$);

    if (!canAccessAttachments) {
      await this.premiumUpgradeService.promptForPremium();
      return;
    }

    const dialogRef = this.dialogService.open<AttachmentDialogCloseResult, { cipherId: CipherId }>(
      AttachmentsV2Component,
      {
        data: {
          cipherId: this.formConfig.originalCipher?.id as CipherId,
        },
      },
    );

    const result = await firstValueFrom(dialogRef.closed);

    if (
      result.action === AttachmentDialogResult.Removed ||
      result.action === AttachmentDialogResult.Uploaded
    ) {
      this._cipherModified = true;
    }
  };

  switchToEdit = async () => {
    if (!this.cipher) {
      return;
    }
    await this.changeMode("form");
  };

  cancel = async () => {
    // We're in View mode, we don't have a cipher, or we were cloning, close the dialog.
    if (this.params.mode === "view" || this.cipher == null || this.formConfig.mode === "clone") {
      this.dialogRef.close(this._cipherModified ? VaultItemDialogResult.Saved : undefined);
      return;
    }

    // We're in Form mode, and we have a cipher, switch back to View mode.
    await this.changeMode("view");
  };

  private async getDecryptedCipherView(config: CipherFormConfig) {
    if (config.originalCipher == null) {
      return;
    }
    const activeUserId = await firstValueFrom(
      this.accountService.activeAccount$.pipe(map((a) => a?.id)),
    );
    return await config.originalCipher.decrypt(
      await this.cipherService.getKeyForCipherKeyDecryption(config.originalCipher, activeUserId),
    );
  }

  private updateTitle() {
    let partOne: string;

    if (this.params.mode === "view") {
      partOne = "viewItemType";
    } else if (this.formConfig.mode === "edit" || this.formConfig.mode === "partial-edit") {
      partOne = "editItemHeader";
    } else {
      partOne = "newItemHeader";
    }

    const type = this.cipher?.type ?? this.formConfig.cipherType ?? CipherType.Login;

    switch (type) {
      case CipherType.Login:
        this.title = this.i18nService.t(partOne, this.i18nService.t("typeLogin").toLowerCase());
        break;
      case CipherType.Card:
        this.title = this.i18nService.t(partOne, this.i18nService.t("typeCard").toLowerCase());
        break;
      case CipherType.Identity:
        this.title = this.i18nService.t(partOne, this.i18nService.t("typeIdentity").toLowerCase());
        break;
      case CipherType.SecureNote:
        this.title = this.i18nService.t(partOne, this.i18nService.t("note").toLowerCase());
        break;
    }
  }

  /**
   * Changes the mode of the dialog. When switching to Form mode, the form is initialized first then displayed once ready.
   * @param mode
   * @private
   */
  private async changeMode(mode: VaultItemDialogMode) {
    this.formReady = false;

    if (mode == "form") {
      this.loadForm = true;
      // Wait for the formReadySubject to emit before continuing.
      // This helps prevent flashing an empty dialog while the form is initializing.
      await firstValueFrom(this._formReadySubject);
    } else {
      this.loadForm = false;
    }

    this.params.mode = mode;
    this.updateTitle();
    // Scroll to the top of the dialog content when switching modes.
    this.dialogContent.nativeElement.parentElement.scrollTop = 0;

    // Update the URL query params to reflect the new mode.
    await this.router.navigate([], {
      queryParams: {
        action: mode === "form" ? "edit" : "view",
        itemId: this.cipher?.id,
      },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  /**
   * Helper method to delete cipher.
   */
  private async deleteCipher(): Promise<void> {
    const asAdmin = this.organization?.canEditAllCiphers;
    if (this.cipher.isDeleted) {
      await this.cipherService.deleteWithServer(this.cipher.id, asAdmin);
    } else {
      await this.cipherService.softDeleteWithServer(this.cipher.id, asAdmin);
    }
  }

  /**
   * Opens the VaultItemDialog.
   * @param dialogService
   * @param params
   */
  static open(dialogService: DialogService, params: VaultItemDialogParams) {
    return dialogService.open<VaultItemDialogResult, VaultItemDialogParams>(
      VaultItemDialogComponent,
      {
        data: params,
      },
    );
  }
}

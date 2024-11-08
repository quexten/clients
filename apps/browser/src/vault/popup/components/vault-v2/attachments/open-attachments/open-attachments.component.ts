import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { firstValueFrom, map } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { BillingAccountProfileStateService } from "@bitwarden/common/billing/abstractions";
import { ProductTierType } from "@bitwarden/common/billing/enums";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { CipherId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import {
  BadgeModule,
  CardComponent,
  ItemModule,
  ToastService,
  TypographyModule,
} from "@bitwarden/components";

import BrowserPopupUtils from "../../../../../../platform/popup/browser-popup-utils";
import { FilePopoutUtilsService } from "../../../../../../tools/popup/services/file-popout-utils.service";

@Component({
  standalone: true,
  selector: "app-open-attachments",
  templateUrl: "./open-attachments.component.html",
  imports: [BadgeModule, CommonModule, ItemModule, JslibModule, TypographyModule, CardComponent],
})
export class OpenAttachmentsComponent implements OnInit {
  /** Cipher `id` */
  @Input({ required: true }) cipherId: CipherId;

  /** True when the attachments window should be opened in a popout */
  openAttachmentsInPopout: boolean;

  /** True when the user has access to premium or h  */
  canAccessAttachments: boolean;

  /** True when the cipher is a part of a free organization */
  cipherIsAPartOfFreeOrg: boolean;

  constructor(
    private router: Router,
    private billingAccountProfileStateService: BillingAccountProfileStateService,
    private cipherService: CipherService,
    private organizationService: OrganizationService,
    private toastService: ToastService,
    private i18nService: I18nService,
    private filePopoutUtilsService: FilePopoutUtilsService,
    private accountService: AccountService,
  ) {
    this.billingAccountProfileStateService.hasPremiumFromAnySource$
      .pipe(takeUntilDestroyed())
      .subscribe((canAccessPremium) => {
        this.canAccessAttachments = canAccessPremium;
      });
  }

  async ngOnInit(): Promise<void> {
    this.openAttachmentsInPopout = this.filePopoutUtilsService.showFilePopoutMessage(window);

    if (!this.cipherId) {
      return;
    }

    const cipherDomain = await this.cipherService.get(this.cipherId);
    const activeUserId = await firstValueFrom(
      this.accountService.activeAccount$.pipe(map((a) => a?.id)),
    );
    const cipher = await cipherDomain.decrypt(
      await this.cipherService.getKeyForCipherKeyDecryption(cipherDomain, activeUserId),
    );

    if (!cipher.organizationId) {
      this.cipherIsAPartOfFreeOrg = false;
      return;
    }

    const org = await this.organizationService.get(cipher.organizationId);

    this.cipherIsAPartOfFreeOrg = org.productTierType === ProductTierType.Free;
  }

  /** Routes the user to the attachments screen, if available */
  async openAttachments() {
    if (!this.canAccessAttachments) {
      await this.router.navigate(["/premium"]);
      return;
    }

    if (this.cipherIsAPartOfFreeOrg) {
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("freeOrgsCannotUseAttachments"),
      });
      return;
    }

    await this.router.navigate(["/attachments"], { queryParams: { cipherId: this.cipherId } });

    // Open the attachments page in a popout
    // This is done after the router navigation to ensure that the navigation
    // is included in the `PopupRouterCacheService` history
    if (this.openAttachmentsInPopout) {
      await BrowserPopupUtils.openCurrentPagePopout(window);
    }
  }
}

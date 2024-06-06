import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { combineLatest, map, Observable } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import {
  IconButtonModule,
  SectionComponent,
  SectionHeaderComponent,
  TypographyModule,
} from "@bitwarden/components";

import BrowserPopupUtils from "../../../../../platform/popup/browser-popup-utils";
import { VaultPopupItemsService } from "../../../services/vault-popup-items.service";
import { PopupCipherView } from "../../../views/popup-cipher.view";
import { VaultListItemsContainerComponent } from "../vault-list-items-container/vault-list-items-container.component";

@Component({
  standalone: true,
  imports: [
    CommonModule,
    SectionComponent,
    TypographyModule,
    VaultListItemsContainerComponent,
    JslibModule,
    SectionHeaderComponent,
    IconButtonModule,
  ],
  selector: "app-autofill-vault-list-items",
  templateUrl: "autofill-vault-list-items.component.html",
})
export class AutofillVaultListItemsComponent {
  /**
   * The list of ciphers that can be used to autofill the current page.
   * @protected
   */
  protected autofillCiphers$: Observable<PopupCipherView[]> =
    this.vaultPopupItemsService.autoFillCiphers$;

  /**
   * Flag indicating whether the refresh button should be shown. Only shown when the popup is within the FF sidebar.
   * @protected
   */
  protected showRefresh: boolean = BrowserPopupUtils.inSidebar(window);

  /**
   * Observable that determines whether the empty autofill tip should be shown.
   * The tip is shown when there are no ciphers to autofill, no filter is applied, and autofill is allowed in
   * the current context (e.g. not in a popout).
   * @protected
   */
  protected showEmptyAutofillTip$: Observable<boolean> = combineLatest([
    this.vaultPopupItemsService.hasFilterApplied$,
    this.autofillCiphers$,
    this.vaultPopupItemsService.autofillAllowed$,
  ]).pipe(
    map(([hasFilter, ciphers, canAutoFill]) => !hasFilter && canAutoFill && ciphers.length === 0),
  );

  constructor(private vaultPopupItemsService: VaultPopupItemsService) {
    // TODO: Migrate logic to show Autofill policy toast PM-8144
  }

  /**
   * Refreshes the current tab to re-populate the autofill ciphers.
   * @protected
   */
  protected refreshCurrentTab() {
    this.vaultPopupItemsService.refreshCurrentTab();
  }
}

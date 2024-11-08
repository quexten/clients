import { Injectable } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import {
  combineLatest,
  firstValueFrom,
  map,
  Observable,
  of,
  shareReplay,
  startWith,
  Subject,
  switchMap,
} from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherRepromptType, CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { LoginUriView } from "@bitwarden/common/vault/models/view/login-uri.view";
import { ToastService } from "@bitwarden/components";
import { PasswordRepromptService } from "@bitwarden/vault";

import {
  AutofillService,
  PageDetail,
} from "../../../autofill/services/abstractions/autofill.service";
import { BrowserApi } from "../../../platform/browser/browser-api";
import BrowserPopupUtils from "../../../platform/popup/browser-popup-utils";
import { closeViewVaultItemPopout, VaultPopoutType } from "../utils/vault-popout-window";

@Injectable({
  providedIn: "root",
})
export class VaultPopupAutofillService {
  private _refreshCurrentTab$ = new Subject<void>();
  private senderTabId$: Observable<number | undefined> = this.route.queryParams.pipe(
    map((params) => (params?.senderTabId ? parseInt(params.senderTabId, 10) : undefined)),
  );
  /**
   * Observable that contains the current tab to be considered for autofill.
   * This can be the tab from the current window if opened in a Popup OR
   * the sending tab when opened the single action Popout (specified by the senderTabId route query parameter)
   */
  currentAutofillTab$: Observable<chrome.tabs.Tab | null> = combineLatest([
    this.senderTabId$,
    this._refreshCurrentTab$.pipe(startWith(null)),
  ]).pipe(
    switchMap(async ([senderTabId]) => {
      if (senderTabId) {
        return await BrowserApi.getTab(senderTabId);
      }

      if (BrowserPopupUtils.inPopout(window)) {
        return null;
      }
      return await BrowserApi.getTabFromCurrentWindow();
    }),
    shareReplay({ refCount: false, bufferSize: 1 }),
  );

  /**
   * Observable that indicates whether autofill is allowed in the current context.
   * Autofill is allowed when there is a current tab and the popup is not in a popout window.
   */
  autofillAllowed$: Observable<boolean> = this.currentAutofillTab$.pipe(map((tab) => !!tab));

  private _currentPageDetails$: Observable<PageDetail[]> = this.currentAutofillTab$.pipe(
    switchMap((tab) => {
      if (!tab) {
        return of([]);
      }
      return this.autofillService.collectPageDetailsFromTab$(tab);
    }),
    shareReplay({ refCount: false, bufferSize: 1 }),
  );

  constructor(
    private autofillService: AutofillService,
    private i18nService: I18nService,
    private toastService: ToastService,
    private platformUtilService: PlatformUtilsService,
    private passwordRepromptService: PasswordRepromptService,
    private cipherService: CipherService,
    private messagingService: MessagingService,
    private route: ActivatedRoute,
    private accountService: AccountService,
  ) {
    this._currentPageDetails$.subscribe();
  }

  private async _internalDoAutofill(
    cipher: CipherView,
    tab: chrome.tabs.Tab,
    pageDetails: PageDetail[],
  ): Promise<boolean> {
    if (
      cipher.reprompt !== CipherRepromptType.None &&
      !(await this.passwordRepromptService.showPasswordPrompt())
    ) {
      return false;
    }

    if (tab == null || pageDetails.length === 0) {
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("autofillError"),
      });
      return false;
    }

    try {
      const totpCode = await this.autofillService.doAutoFill({
        tab,
        cipher,
        pageDetails,
        doc: window.document,
        fillNewPassword: true,
        allowTotpAutofill: true,
      });

      if (totpCode != null) {
        this.platformUtilService.copyToClipboard(totpCode, { window: window });
      }
    } catch {
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("autofillError"),
      });
      return false;
    }

    return true;
  }

  private async _closePopup(cipher: CipherView, tab: chrome.tabs.Tab | null) {
    if (BrowserPopupUtils.inSingleActionPopout(window, VaultPopoutType.viewVaultItem) && tab.id) {
      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("autoFillSuccess"),
      });
      setTimeout(async () => {
        await BrowserApi.focusTab(tab.id);
        await closeViewVaultItemPopout(`${VaultPopoutType.viewVaultItem}_${cipher.id}`);
      }, 1000);

      return;
    }

    if (!BrowserPopupUtils.inPopup(window)) {
      return;
    }

    if (this.platformUtilService.isFirefox() || this.platformUtilService.isSafari()) {
      BrowserApi.closePopup(window);
      return;
    }

    // Slight delay to fix bug in Chromium browsers where popup closes without copying totp to clipboard
    setTimeout(() => BrowserApi.closePopup(window), 50);
  }

  /**
   * Re-fetch the current tab
   */
  refreshCurrentTab() {
    this._refreshCurrentTab$.next(null);
  }

  /**
   * Attempts to autofill the given cipher. Returns true if the autofill was successful, false otherwise.
   * Will copy any TOTP code to the clipboard if available after successful autofill.
   * @param cipher
   * @param closePopup If true, will close the popup window after successful autofill. Defaults to true.
   */
  async doAutofill(cipher: CipherView, closePopup = true): Promise<boolean> {
    const tab = await firstValueFrom(this.currentAutofillTab$);
    const pageDetails = await firstValueFrom(this._currentPageDetails$);

    const didAutofill = await this._internalDoAutofill(cipher, tab, pageDetails);

    if (didAutofill && closePopup) {
      await this._closePopup(cipher, tab);
    }

    return didAutofill;
  }

  /**
   * Attempts to autofill the given cipher and, upon successful autofill, saves the URI to the cipher.
   * Will copy any TOTP code to the clipboard if available after successful autofill.
   * @param cipher The cipher to autofill and save. Only Login ciphers are supported.
   * @param closePopup If true, will close the popup window after successful autofill.
   * If false, will show a success toast instead. Defaults to true.
   */
  async doAutofillAndSave(cipher: CipherView, closePopup = true): Promise<boolean> {
    // We can only save URIs for login ciphers
    if (cipher.type !== CipherType.Login) {
      return false;
    }

    const pageDetails = await firstValueFrom(this._currentPageDetails$);
    const tab = await firstValueFrom(this.currentAutofillTab$);

    const didAutofill = await this._internalDoAutofill(cipher, tab, pageDetails);

    if (!didAutofill) {
      return false;
    }

    const didSaveUri = await this._saveNewUri(cipher, tab);

    if (!didSaveUri) {
      return false;
    }

    if (closePopup) {
      await this._closePopup(cipher, tab);
    } else {
      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("autoFillSuccessAndSavedUri"),
      });
    }

    return true;
  }

  /**
   * Saves the current tab's URL as a new URI for the given cipher. If the cipher already has a URI for the tab,
   * this method does nothing and returns true.
   * @private
   */
  private async _saveNewUri(cipher: CipherView, tab: chrome.tabs.Tab): Promise<boolean> {
    cipher.login.uris ??= [];

    if (cipher.login.uris.some((uri) => uri.uri === tab.url)) {
      // Cipher already has a URI for this tab
      return true;
    }

    const loginUri = new LoginUriView();
    loginUri.uri = tab.url;
    cipher.login.uris.push(loginUri);

    try {
      const activeUserId = await firstValueFrom(
        this.accountService.activeAccount$.pipe(map((a) => a?.id)),
      );
      const encCipher = await this.cipherService.encrypt(cipher, activeUserId);
      await this.cipherService.updateWithServer(encCipher);
      this.messagingService.send("editedCipher");
      return true;
    } catch {
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("unexpectedError"),
      });
      return false;
    }
  }
}

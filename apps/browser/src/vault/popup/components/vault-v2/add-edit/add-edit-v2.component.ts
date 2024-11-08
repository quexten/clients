import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Params, Router } from "@angular/router";
import { firstValueFrom, map, switchMap } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { EventCollectionService } from "@bitwarden/common/abstractions/event/event-collection.service";
import { EventType } from "@bitwarden/common/enums";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { CipherId, CollectionId, OrganizationId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { AddEditCipherInfo } from "@bitwarden/common/vault/types/add-edit-cipher-info";
import { AsyncActionsModule, ButtonModule, SearchModule } from "@bitwarden/components";
import {
  CipherFormConfig,
  CipherFormConfigService,
  CipherFormGenerationService,
  CipherFormMode,
  CipherFormModule,
  DefaultCipherFormConfigService,
  OptionalInitialValues,
  TotpCaptureService,
} from "@bitwarden/vault";

import { BrowserFido2UserInterfaceSession } from "../../../../../autofill/fido2/services/browser-fido2-user-interface.service";
import BrowserPopupUtils from "../../../../../platform/popup/browser-popup-utils";
import { PopOutComponent } from "../../../../../platform/popup/components/pop-out.component";
import { PopupFooterComponent } from "../../../../../platform/popup/layout/popup-footer.component";
import { PopupHeaderComponent } from "../../../../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../../../../platform/popup/layout/popup-page.component";
import { PopupRouterCacheService } from "../../../../../platform/popup/view-cache/popup-router-cache.service";
import { PopupCloseWarningService } from "../../../../../popup/services/popup-close-warning.service";
import { BrowserCipherFormGenerationService } from "../../../services/browser-cipher-form-generation.service";
import { BrowserTotpCaptureService } from "../../../services/browser-totp-capture.service";
import {
  fido2PopoutSessionData$,
  Fido2SessionData,
} from "../../../utils/fido2-popout-session-data";
import { VaultPopoutType } from "../../../utils/vault-popout-window";
import { OpenAttachmentsComponent } from "../attachments/open-attachments/open-attachments.component";

/**
 * Helper class to parse query parameters for the AddEdit route.
 */
class QueryParams {
  constructor(params: Params) {
    this.cipherId = params.cipherId;
    this.type = params.type != undefined ? parseInt(params.type, null) : undefined;
    this.clone = params.clone === "true";
    this.folderId = params.folderId;
    this.organizationId = params.organizationId;
    this.collectionId = params.collectionId;
    this.uri = params.uri;
    this.username = params.username;
    this.name = params.name;
  }

  /**
   * The ID of the cipher to edit or clone.
   */
  cipherId?: CipherId;

  /**
   * The type of cipher to create.
   */
  type?: CipherType;

  /**
   * Whether to clone the cipher.
   */
  clone?: boolean;

  /**
   * Optional folderId to pre-select.
   */
  folderId?: string;

  /**
   * Optional organizationId to pre-select.
   */
  organizationId?: OrganizationId;

  /**
   * Optional collectionId to pre-select.
   */
  collectionId?: CollectionId;

  /**
   * Optional URI to pre-fill for login ciphers.
   */
  uri?: string;

  /**
   * Optional username to pre-fill for login/identity ciphers.
   */
  username?: string;

  /**
   * Optional name to pre-fill for the cipher.
   */
  name?: string;
}

export type AddEditQueryParams = Partial<Record<keyof QueryParams, string>>;

@Component({
  selector: "app-add-edit-v2",
  templateUrl: "add-edit-v2.component.html",
  standalone: true,
  providers: [
    { provide: CipherFormConfigService, useClass: DefaultCipherFormConfigService },
    { provide: TotpCaptureService, useClass: BrowserTotpCaptureService },
    { provide: CipherFormGenerationService, useClass: BrowserCipherFormGenerationService },
  ],
  imports: [
    CommonModule,
    SearchModule,
    JslibModule,
    FormsModule,
    ButtonModule,
    OpenAttachmentsComponent,
    PopupPageComponent,
    PopupHeaderComponent,
    PopupFooterComponent,
    CipherFormModule,
    AsyncActionsModule,
    PopOutComponent,
  ],
})
export class AddEditV2Component implements OnInit {
  headerText: string;
  config: CipherFormConfig;

  get loading() {
    return this.config == null;
  }

  get originalCipherId(): CipherId | null {
    return this.config?.originalCipher?.id as CipherId;
  }

  private fido2PopoutSessionData$ = fido2PopoutSessionData$();
  private fido2PopoutSessionData: Fido2SessionData;

  private get inFido2PopoutWindow() {
    return BrowserPopupUtils.inPopout(window) && this.fido2PopoutSessionData.isFido2Session;
  }

  private get inSingleActionPopout() {
    return BrowserPopupUtils.inSingleActionPopout(window, VaultPopoutType.addEditVaultItem);
  }

  constructor(
    private route: ActivatedRoute,
    private i18nService: I18nService,
    private addEditFormConfigService: CipherFormConfigService,
    private popupCloseWarningService: PopupCloseWarningService,
    private popupRouterCacheService: PopupRouterCacheService,
    private router: Router,
    private cipherService: CipherService,
    private eventCollectionService: EventCollectionService,
  ) {
    this.subscribeToParams();
  }

  async ngOnInit() {
    this.fido2PopoutSessionData = await firstValueFrom(this.fido2PopoutSessionData$);

    if (BrowserPopupUtils.inPopout(window)) {
      this.popupCloseWarningService.enable();
    }
  }

  /**
   * Called before the form is submitted, allowing us to handle Fido2 user verification.
   */
  protected checkFido2UserVerification: () => Promise<boolean> = async () => {
    if (!this.inFido2PopoutWindow) {
      // Not in a Fido2 popout window, no need to handle user verification.
      return true;
    }

    // TODO use fido2 user verification service once user verification for passkeys is approved for production.
    // We are bypassing user verification pending approval for production.
    return true;
  };

  /**
   * Handle back button
   */
  async handleBackButton() {
    if (this.inFido2PopoutWindow) {
      this.popupCloseWarningService.disable();
      BrowserFido2UserInterfaceSession.abortPopout(this.fido2PopoutSessionData.sessionId);
      return;
    }

    if (this.inSingleActionPopout) {
      await BrowserPopupUtils.closeSingleActionPopout(VaultPopoutType.addEditVaultItem);
      return;
    }

    await this.popupRouterCacheService.back();
  }

  async onCipherSaved(cipher: CipherView) {
    if (BrowserPopupUtils.inPopout(window)) {
      this.popupCloseWarningService.disable();
    }

    if (this.inFido2PopoutWindow) {
      BrowserFido2UserInterfaceSession.confirmNewCredentialResponse(
        this.fido2PopoutSessionData.sessionId,
        cipher.id,
        this.fido2PopoutSessionData.userVerification,
      );
      return;
    }

    if (this.inSingleActionPopout) {
      await BrowserPopupUtils.closeSingleActionPopout(VaultPopoutType.addEditVaultItem, 1000);
      return;
    }

    // When the cipher is in edit / partial edit, the previous page was the view-cipher page.
    // In the case of creating a new cipher, the user should go view-cipher page but we need to also
    // remove it from the history stack. This avoids the user having to click back twice on the
    // view-cipher page.
    if (this.config.mode === "edit" || this.config.mode === "partial-edit") {
      await this.popupRouterCacheService.back();
    } else {
      await this.router.navigate(["/view-cipher"], {
        replaceUrl: true,
        queryParams: { cipherId: cipher.id },
      });
    }
  }

  subscribeToParams(): void {
    this.route.queryParams
      .pipe(
        takeUntilDestroyed(),
        map((params) => new QueryParams(params)),
        switchMap(async (params) => {
          let mode: CipherFormMode;
          if (params.cipherId == null) {
            mode = "add";
          } else {
            mode = params.clone ? "clone" : "edit";
          }
          const config = await this.addEditFormConfigService.buildConfig(
            mode,
            params.cipherId,
            params.type,
          );

          if (config.mode === "edit" && !config.originalCipher.edit) {
            config.mode = "partial-edit";
          }

          config.initialValues = this.setInitialValuesFromParams(params);

          // The browser notification bar and overlay use addEditCipherInfo$ to pass modified cipher details to the form
          // Attempt to fetch them here and overwrite the initialValues if present
          const cachedCipherInfo = await firstValueFrom(this.cipherService.addEditCipherInfo$);

          if (cachedCipherInfo != null) {
            // Cached cipher info has priority over queryParams
            config.initialValues = {
              ...config.initialValues,
              ...mapAddEditCipherInfoToInitialValues(cachedCipherInfo),
            };
            // Be sure to clear the "cached" cipher info, so it doesn't get used again
            await this.cipherService.setAddEditCipherInfo(null);
          }

          if (["edit", "partial-edit"].includes(config.mode) && config.originalCipher?.id) {
            await this.eventCollectionService.collect(
              EventType.Cipher_ClientViewed,
              config.originalCipher.id,
              false,
              config.originalCipher.organizationId,
            );
          }

          return config;
        }),
      )
      .subscribe((config) => {
        this.config = config;
        this.headerText = this.setHeader(config.mode, config.cipherType);
      });
  }

  setInitialValuesFromParams(params: QueryParams) {
    const initialValues = {} as OptionalInitialValues;
    if (params.folderId) {
      initialValues.folderId = params.folderId;
    }
    if (params.organizationId) {
      initialValues.organizationId = params.organizationId;
    }
    if (params.collectionId) {
      initialValues.collectionIds = [params.collectionId];
    }
    if (params.uri) {
      initialValues.loginUri = params.uri;
    }
    if (params.username) {
      initialValues.username = params.username;
    }
    if (params.name) {
      initialValues.name = params.name;
    }
    return initialValues;
  }

  setHeader(mode: CipherFormMode, type: CipherType) {
    const partOne = mode === "edit" || mode === "partial-edit" ? "editItemHeader" : "newItemHeader";

    switch (type) {
      case CipherType.Login:
        return this.i18nService.t(partOne, this.i18nService.t("typeLogin").toLocaleLowerCase());
      case CipherType.Card:
        return this.i18nService.t(partOne, this.i18nService.t("typeCard").toLocaleLowerCase());
      case CipherType.Identity:
        return this.i18nService.t(partOne, this.i18nService.t("typeIdentity").toLocaleLowerCase());
      case CipherType.SecureNote:
        return this.i18nService.t(partOne, this.i18nService.t("note").toLocaleLowerCase());
    }
  }
}

/**
 * Helper to map the old AddEditCipherInfo to the new OptionalInitialValues type used by the CipherForm
 * @param cipherInfo
 */
const mapAddEditCipherInfoToInitialValues = (
  cipherInfo: AddEditCipherInfo | null,
): OptionalInitialValues => {
  const initialValues: OptionalInitialValues = {};

  if (cipherInfo == null) {
    return initialValues;
  }

  if (cipherInfo.collectionIds != null) {
    initialValues.collectionIds = cipherInfo.collectionIds as CollectionId[];
  }

  if (cipherInfo.cipher == null) {
    return initialValues;
  }

  const cipher = cipherInfo.cipher;

  if (cipher.folderId != null) {
    initialValues.folderId = cipher.folderId;
  }

  if (cipher.organizationId != null) {
    initialValues.organizationId = cipher.organizationId as OrganizationId;
  }

  if (cipher.name != null) {
    initialValues.name = cipher.name;
  }

  if (cipher.type === CipherType.Login) {
    const login = cipher.login;

    if (login != null) {
      if (login.uris != null && login.uris.length > 0) {
        initialValues.loginUri = login.uris[0].uri;
      }

      if (login.username != null) {
        initialValues.username = login.username;
      }

      if (login.password != null) {
        initialValues.password = login.password;
      }
    }
  }

  if (cipher.type === CipherType.Identity && cipher.identity?.username != null) {
    initialValues.username = cipher.identity.username;
  }

  return initialValues;
};

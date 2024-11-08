import { Directive, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { firstValueFrom, map } from "rxjs";

import { CollectionService, CollectionView } from "@bitwarden/admin-console/common";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { Cipher } from "@bitwarden/common/vault/models/domain/cipher";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { ToastService } from "@bitwarden/components";

@Directive()
export class CollectionsComponent implements OnInit {
  @Input() cipherId: string;
  @Input() allowSelectNone = false;
  @Output() onSavedCollections = new EventEmitter();

  formPromise: Promise<any>;
  cipher: CipherView;
  collectionIds: string[];
  collections: CollectionView[] = [];
  organization: Organization;

  protected cipherDomain: Cipher;

  constructor(
    protected collectionService: CollectionService,
    protected platformUtilsService: PlatformUtilsService,
    protected i18nService: I18nService,
    protected cipherService: CipherService,
    protected organizationService: OrganizationService,
    private logService: LogService,
    private accountService: AccountService,
    private toastService: ToastService,
  ) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.cipherDomain = await this.loadCipher();
    this.collectionIds = this.loadCipherCollections();
    const activeUserId = await firstValueFrom(
      this.accountService.activeAccount$.pipe(map((a) => a?.id)),
    );
    this.cipher = await this.cipherDomain.decrypt(
      await this.cipherService.getKeyForCipherKeyDecryption(this.cipherDomain, activeUserId),
    );
    this.collections = await this.loadCollections();

    this.collections.forEach((c) => ((c as any).checked = false));
    if (this.collectionIds != null) {
      this.collections.forEach((c) => {
        (c as any).checked = this.collectionIds != null && this.collectionIds.indexOf(c.id) > -1;
      });
    }

    if (this.organization == null) {
      this.organization = await this.organizationService.get(this.cipher.organizationId);
    }
  }

  async submit(): Promise<boolean> {
    const selectedCollectionIds = this.collections
      .filter((c) => {
        if (this.organization.canEditAllCiphers) {
          return !!(c as any).checked;
        } else {
          return !!(c as any).checked && !c.readOnly;
        }
      })
      .map((c) => c.id);
    if (!this.allowSelectNone && selectedCollectionIds.length === 0) {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: this.i18nService.t("selectOneCollection"),
      });
      return false;
    }
    this.cipherDomain.collectionIds = selectedCollectionIds;
    try {
      this.formPromise = this.saveCollections();
      await this.formPromise;
      this.onSavedCollections.emit();
      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("editedItem"),
      });
      return true;
    } catch (e) {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: e.message,
      });
      return false;
    }
  }

  protected loadCipher() {
    return this.cipherService.get(this.cipherId);
  }

  protected loadCipherCollections() {
    return this.cipherDomain.collectionIds;
  }

  protected async loadCollections() {
    const allCollections = await this.collectionService.getAllDecrypted();
    return allCollections.filter(
      (c) => !c.readOnly && c.organizationId === this.cipher.organizationId,
    );
  }

  protected saveCollections() {
    return this.cipherService.saveCollectionsWithServer(this.cipherDomain);
  }
}

import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import {
  CollectionAdminService,
  CollectionAdminView,
  Unassigned,
} from "@bitwarden/admin-console/common";
import { JslibModule } from "@bitwarden/angular/jslib.module";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { ProductTierType } from "@bitwarden/common/billing/enums";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { TreeNode } from "@bitwarden/common/vault/models/domain/tree-node";
import {
  BreadcrumbsModule,
  DialogService,
  MenuModule,
  SearchModule,
  SimpleDialogOptions,
} from "@bitwarden/components";

import { HeaderModule } from "../../../layouts/header/header.module";
import { SharedModule } from "../../../shared";
import { CollectionDialogTabType } from "../../components/collection-dialog";
import {
  All,
  RoutedVaultFilterModel,
} from "../../individual-vault/vault-filter/shared/models/routed-vault-filter.model";

@Component({
  standalone: true,
  selector: "app-org-vault-header",
  templateUrl: "./vault-header.component.html",
  imports: [
    CommonModule,
    MenuModule,
    SharedModule,
    BreadcrumbsModule,
    HeaderModule,
    SearchModule,
    JslibModule,
  ],
})
export class VaultHeaderComponent implements OnInit {
  protected All = All;
  protected Unassigned = Unassigned;

  /**
   * Boolean to determine the loading state of the header.
   * Shows a loading spinner if set to true
   */
  @Input() loading: boolean;

  /** Current active fitler */
  @Input() filter: RoutedVaultFilterModel;

  /** The organization currently being viewed */
  @Input() organization: Organization;

  /** Currently selected collection */
  @Input() collection?: TreeNode<CollectionAdminView>;

  /** The current search text in the header */
  @Input() searchText: string;

  /** Emits an event when the new item button is clicked in the header */
  @Output() onAddCipher = new EventEmitter<CipherType | undefined>();

  /** Emits an event when the new collection button is clicked in the header */
  @Output() onAddCollection = new EventEmitter<void>();

  /** Emits an event when the edit collection button is clicked in the header */
  @Output() onEditCollection = new EventEmitter<{
    tab: CollectionDialogTabType;
    readonly: boolean;
  }>();

  /** Emits an event when the delete collection button is clicked in the header */
  @Output() onDeleteCollection = new EventEmitter<void>();

  /** Emits an event when the search text changes in the header*/
  @Output() searchTextChanged = new EventEmitter<string>();

  protected CollectionDialogTabType = CollectionDialogTabType;
  protected organizations$ = this.organizationService.organizations$;

  /**
   * Whether the extension refresh feature flag is enabled.
   */
  protected extensionRefreshEnabled = false;

  /** The cipher type enum. */
  protected CipherType = CipherType;

  constructor(
    private organizationService: OrganizationService,
    private i18nService: I18nService,
    private dialogService: DialogService,
    private collectionAdminService: CollectionAdminService,
    private router: Router,
    private configService: ConfigService,
  ) {}

  async ngOnInit() {
    this.extensionRefreshEnabled = await this.configService.getFeatureFlag(
      FeatureFlag.ExtensionRefresh,
    );
  }

  get title() {
    const headerType = this.i18nService.t("collections").toLowerCase();

    if (this.collection != null) {
      return this.collection.node.name;
    }

    if (this.filter.collectionId === Unassigned) {
      return this.i18nService.t("unassigned");
    }

    return this.organization?.name
      ? `${this.organization?.name} ${headerType}`
      : this.i18nService.t("collections");
  }

  get icon() {
    return this.filter.collectionId !== undefined ? "bwi-collection" : "";
  }

  protected get showBreadcrumbs() {
    return this.filter.collectionId !== undefined && this.filter.collectionId !== All;
  }

  /**
   * A list of collection filters that form a chain from the organization root to currently selected collection.
   * Begins from the organization root and excludes the currently selected collection.
   */
  protected get collections() {
    if (this.collection == undefined) {
      return [];
    }

    const collections = [this.collection];
    while (collections[collections.length - 1].parent != undefined) {
      collections.push(collections[collections.length - 1].parent);
    }

    return collections
      .slice(1)
      .reverse()
      .map((treeNode) => treeNode.node);
  }

  private showFreeOrgUpgradeDialog(): void {
    const orgUpgradeSimpleDialogOpts: SimpleDialogOptions = {
      title: this.i18nService.t("upgradeOrganization"),
      content: this.i18nService.t(
        this.organization.canEditSubscription
          ? "freeOrgMaxCollectionReachedManageBilling"
          : "freeOrgMaxCollectionReachedNoManageBilling",
        this.organization.maxCollections,
      ),
      type: "primary",
    };

    if (this.organization.canEditSubscription) {
      orgUpgradeSimpleDialogOpts.acceptButtonText = this.i18nService.t("upgrade");
    } else {
      orgUpgradeSimpleDialogOpts.acceptButtonText = this.i18nService.t("ok");
      orgUpgradeSimpleDialogOpts.cancelButtonText = null; // hide secondary btn
    }

    const simpleDialog = this.dialogService.openSimpleDialogRef(orgUpgradeSimpleDialogOpts);

    // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    firstValueFrom(simpleDialog.closed).then((result: boolean | undefined) => {
      if (!result) {
        return;
      }

      if (result && this.organization.canEditSubscription) {
        // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.router.navigate(["/organizations", this.organization.id, "billing", "subscription"], {
          queryParams: { upgrade: true },
        });
      }
    });
  }

  get canEditCollection(): boolean {
    // Only edit collections if not editing "Unassigned"
    if (this.collection === undefined) {
      return false;
    }

    // Otherwise, check if we can edit the specified collection
    return this.collection.node.canEdit(this.organization);
  }

  addCipher(cipherType?: CipherType) {
    this.onAddCipher.emit(cipherType);
  }

  async addCollection() {
    if (this.organization.productTierType === ProductTierType.Free) {
      const collections = await this.collectionAdminService.getAll(this.organization.id);
      if (collections.length === this.organization.maxCollections) {
        this.showFreeOrgUpgradeDialog();
        return;
      }
    }

    this.onAddCollection.emit();
  }

  async editCollection(tab: CollectionDialogTabType, readonly: boolean): Promise<void> {
    this.onEditCollection.emit({ tab, readonly });
  }

  get canDeleteCollection(): boolean {
    // Only delete collections if not deleting "Unassigned"
    if (this.collection === undefined) {
      return false;
    }

    // Otherwise, check if we can delete the specified collection
    return this.collection.node.canDelete(this.organization);
  }

  get canViewCollectionInfo(): boolean {
    return this.collection.node.canViewCollectionInfo(this.organization);
  }

  get canCreateCollection(): boolean {
    return this.organization?.canCreateNewCollections;
  }

  get canCreateCipher(): boolean {
    if (this.organization?.isProviderUser && !this.organization?.isMember) {
      return false;
    }
    return true;
  }

  deleteCollection() {
    this.onDeleteCollection.emit();
  }

  onSearchTextChanged(t: string) {
    this.searchText = t;
    this.searchTextChanged.emit(t);
  }
}

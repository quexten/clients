import { DIALOG_DATA, DialogConfig, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject, OnDestroy } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { combineLatest, of, Subject, switchMap, takeUntil } from "rxjs";

import {
  CollectionAdminService,
  OrganizationUserApiService,
  CollectionView,
} from "@bitwarden/admin-console/common";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { DialogService } from "@bitwarden/components";

import { GroupService, GroupView } from "../../../admin-console/organizations/core";
import {
  AccessItemType,
  AccessItemValue,
  AccessItemView,
  AccessSelectorModule,
  convertToSelectionView,
  mapGroupToAccessItemView,
  mapUserToAccessItemView,
  PermissionMode,
} from "../../../admin-console/organizations/shared/components/access-selector";
import { SharedModule } from "../../../shared";

export interface BulkCollectionsDialogParams {
  organizationId: string;
  collections: CollectionView[];
}

export enum BulkCollectionsDialogResult {
  Saved = "saved",
  Canceled = "canceled",
}

@Component({
  imports: [SharedModule, AccessSelectorModule],
  selector: "app-bulk-collections-dialog",
  templateUrl: "bulk-collections-dialog.component.html",
  standalone: true,
})
export class BulkCollectionsDialogComponent implements OnDestroy {
  protected readonly PermissionMode = PermissionMode;

  protected formGroup = this.formBuilder.group({
    access: [[] as AccessItemValue[]],
  });
  protected loading = true;
  protected organization: Organization;
  protected accessItems: AccessItemView[] = [];
  protected numCollections: number;

  private destroy$ = new Subject<void>();

  constructor(
    @Inject(DIALOG_DATA) private params: BulkCollectionsDialogParams,
    private dialogRef: DialogRef<BulkCollectionsDialogResult>,
    private formBuilder: FormBuilder,
    private organizationService: OrganizationService,
    private groupService: GroupService,
    private organizationUserApiService: OrganizationUserApiService,
    private platformUtilsService: PlatformUtilsService,
    private i18nService: I18nService,
    private collectionAdminService: CollectionAdminService,
  ) {
    this.numCollections = this.params.collections.length;
    const organization$ = this.organizationService.get$(this.params.organizationId);
    const groups$ = organization$.pipe(
      switchMap((organization) => {
        if (!organization.useGroups) {
          return of([] as GroupView[]);
        }
        return this.groupService.getAll(organization.id);
      }),
    );

    combineLatest([
      organization$,
      groups$,
      this.organizationUserApiService.getAllMiniUserDetails(this.params.organizationId),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([organization, groups, users]) => {
        this.organization = organization;

        this.accessItems = [].concat(
          groups.map(mapGroupToAccessItemView),
          users.data.map(mapUserToAccessItemView),
        );

        this.loading = false;
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  submit = async () => {
    const users = this.formGroup.controls.access.value
      .filter((v) => v.type === AccessItemType.Member)
      .map(convertToSelectionView);

    const groups = this.formGroup.controls.access.value
      .filter((v) => v.type === AccessItemType.Group)
      .map(convertToSelectionView);

    await this.collectionAdminService.bulkAssignAccess(
      this.organization.id,
      this.params.collections.map((c) => c.id),
      users,
      groups,
    );

    this.platformUtilsService.showToast("success", null, this.i18nService.t("editedCollections"));

    this.dialogRef.close(BulkCollectionsDialogResult.Saved);
  };

  static open(dialogService: DialogService, config: DialogConfig<BulkCollectionsDialogParams>) {
    return dialogService.open<BulkCollectionsDialogResult, BulkCollectionsDialogParams>(
      BulkCollectionsDialogComponent,
      config,
    );
  }
}

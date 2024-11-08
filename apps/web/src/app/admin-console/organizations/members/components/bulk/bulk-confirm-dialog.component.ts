import { DIALOG_DATA, DialogConfig } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { firstValueFrom, map, Observable, switchMap } from "rxjs";

import {
  OrganizationUserApiService,
  OrganizationUserBulkConfirmRequest,
  OrganizationUserBulkPublicKeyResponse,
  OrganizationUserBulkResponse,
} from "@bitwarden/admin-console/common";
import { OrganizationUserStatusType } from "@bitwarden/common/admin-console/enums";
import { ProviderUserBulkPublicKeyResponse } from "@bitwarden/common/admin-console/models/response/provider/provider-user-bulk-public-key.response";
import { ProviderUserBulkResponse } from "@bitwarden/common/admin-console/models/response/provider/provider-user-bulk.response";
import { ListResponse } from "@bitwarden/common/models/response/list.response";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { SymmetricCryptoKey } from "@bitwarden/common/platform/models/domain/symmetric-crypto-key";
import { StateProvider } from "@bitwarden/common/platform/state";
import { OrganizationId } from "@bitwarden/common/types/guid";
import { OrgKey } from "@bitwarden/common/types/key";
import { DialogService } from "@bitwarden/components";
import { KeyService } from "@bitwarden/key-management";

import { BaseBulkConfirmComponent } from "./base-bulk-confirm.component";
import { BulkUserDetails } from "./bulk-status.component";

type BulkConfirmDialogParams = {
  organizationId: string;
  users: BulkUserDetails[];
};

@Component({
  templateUrl: "bulk-confirm-dialog.component.html",
})
export class BulkConfirmDialogComponent extends BaseBulkConfirmComponent {
  organizationId: string;
  organizationKey$: Observable<OrgKey>;
  users: BulkUserDetails[];

  constructor(
    protected keyService: KeyService,
    @Inject(DIALOG_DATA) protected dialogParams: BulkConfirmDialogParams,
    protected encryptService: EncryptService,
    private organizationUserApiService: OrganizationUserApiService,
    protected i18nService: I18nService,
    private stateProvider: StateProvider,
  ) {
    super(keyService, encryptService, i18nService);

    this.organizationId = dialogParams.organizationId;
    this.organizationKey$ = this.stateProvider.activeUserId$.pipe(
      switchMap((userId) => this.keyService.orgKeys$(userId)),
      map((organizationKeysById) => organizationKeysById[this.organizationId as OrganizationId]),
      takeUntilDestroyed(),
    );
    this.users = dialogParams.users;
  }

  protected getCryptoKey = async (): Promise<SymmetricCryptoKey> =>
    await firstValueFrom(this.organizationKey$);

  protected getPublicKeys = async (): Promise<
    ListResponse<OrganizationUserBulkPublicKeyResponse | ProviderUserBulkPublicKeyResponse>
  > =>
    await this.organizationUserApiService.postOrganizationUsersPublicKey(
      this.organizationId,
      this.filteredUsers.map((user) => user.id),
    );

  protected isAccepted = (user: BulkUserDetails) =>
    user.status === OrganizationUserStatusType.Accepted;

  protected postConfirmRequest = async (
    userIdsWithKeys: { id: string; key: string }[],
  ): Promise<ListResponse<OrganizationUserBulkResponse | ProviderUserBulkResponse>> => {
    const request = new OrganizationUserBulkConfirmRequest(userIdsWithKeys);
    return await this.organizationUserApiService.postOrganizationUserBulkConfirm(
      this.organizationId,
      request,
    );
  };

  static open(dialogService: DialogService, config: DialogConfig<BulkConfirmDialogParams>) {
    return dialogService.open(BulkConfirmDialogComponent, config);
  }
}

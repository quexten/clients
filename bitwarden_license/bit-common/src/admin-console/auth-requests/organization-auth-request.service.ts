import {
  OrganizationUserApiService,
  OrganizationUserResetPasswordDetailsResponse,
} from "@bitwarden/admin-console/common";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { EncString } from "@bitwarden/common/platform/models/domain/enc-string";
import { SymmetricCryptoKey } from "@bitwarden/common/platform/models/domain/symmetric-crypto-key";
import { KeyService } from "@bitwarden/key-management";

import { OrganizationAuthRequestApiService } from "./organization-auth-request-api.service";
import { OrganizationAuthRequestUpdateRequest } from "./organization-auth-request-update.request";
import { PendingAuthRequestView } from "./pending-auth-request.view";

export class OrganizationAuthRequestService {
  constructor(
    private organizationAuthRequestApiService: OrganizationAuthRequestApiService,
    private keyService: KeyService,
    private encryptService: EncryptService,
    private organizationUserApiService: OrganizationUserApiService,
  ) {}

  async listPendingRequests(organizationId: string): Promise<PendingAuthRequestView[]> {
    return await this.organizationAuthRequestApiService.listPendingRequests(organizationId);
  }

  async denyPendingRequests(organizationId: string, ...requestIds: string[]): Promise<void> {
    await this.organizationAuthRequestApiService.denyPendingRequests(organizationId, ...requestIds);
  }

  async approvePendingRequests(
    organizationId: string,
    authRequests: PendingAuthRequestView[],
  ): Promise<void> {
    const organizationUserIds = authRequests.map((r) => r.organizationUserId);
    const details =
      await this.organizationUserApiService.getManyOrganizationUserAccountRecoveryDetails(
        organizationId,
        organizationUserIds,
      );

    if (
      details == null ||
      details.data.length == 0 ||
      details.data.some((d) => d.resetPasswordKey == null)
    ) {
      throw new Error(
        "All users must be enrolled in account recovery (password reset) in order for the requests to be approved.",
      );
    }

    const requestsToApprove = await Promise.all(
      authRequests.map(async (r) => {
        const detail = details.data.find((d) => d.organizationUserId === r.organizationUserId);
        const encryptedKey = await this.getEncryptedUserKey(organizationId, r.publicKey, detail);

        return new OrganizationAuthRequestUpdateRequest(r.id, true, encryptedKey.encryptedString);
      }),
    );

    await this.organizationAuthRequestApiService.bulkUpdatePendingRequests(
      organizationId,
      requestsToApprove,
    );
  }

  async approvePendingRequest(organizationId: string, authRequest: PendingAuthRequestView) {
    const details = await this.organizationUserApiService.getOrganizationUserResetPasswordDetails(
      organizationId,
      authRequest.organizationUserId,
    );

    if (details == null || details.resetPasswordKey == null) {
      throw new Error(
        "The user must be enrolled in account recovery (password reset) in order for the request to be approved.",
      );
    }

    const encryptedKey = await this.getEncryptedUserKey(
      organizationId,
      authRequest.publicKey,
      details,
    );

    await this.organizationAuthRequestApiService.approvePendingRequest(
      organizationId,
      authRequest.id,
      encryptedKey,
    );
  }

  async denyPendingRequest(organizationId: string, requestId: string) {
    await this.organizationAuthRequestApiService.denyPendingRequest(organizationId, requestId);
  }

  /**
   * Creates a copy of the user key that has been encrypted with the provided device's public key.
   * @param organizationId
   * @param devicePublicKey
   * @param resetPasswordDetails
   * @private
   */
  private async getEncryptedUserKey(
    organizationId: string,
    devicePublicKey: string,
    resetPasswordDetails: OrganizationUserResetPasswordDetailsResponse,
  ): Promise<EncString> {
    const encryptedUserKey = resetPasswordDetails.resetPasswordKey;
    const encryptedOrgPrivateKey = resetPasswordDetails.encryptedPrivateKey;
    const devicePubKey = Utils.fromB64ToArray(devicePublicKey);

    // Decrypt Organization's encrypted Private Key with org key
    const orgSymKey = await this.keyService.getOrgKey(organizationId);
    const decOrgPrivateKey = await this.encryptService.decryptToBytes(
      new EncString(encryptedOrgPrivateKey),
      orgSymKey,
    );

    // Decrypt user key with decrypted org private key
    const decValue = await this.encryptService.rsaDecrypt(
      new EncString(encryptedUserKey),
      decOrgPrivateKey,
    );
    const userKey = new SymmetricCryptoKey(decValue);

    // Re-encrypt user Key with the Device Public Key
    return await this.encryptService.rsaEncrypt(userKey.key, devicePubKey);
  }
}

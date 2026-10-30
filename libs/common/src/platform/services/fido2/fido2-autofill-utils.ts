// TODO: Add tests for this method

import { CipherType } from "../../../vault/enums";
import { Fido2CredentialAutofillView } from "../../../vault/models/view/fido2-credential-autofill.view";
import { CipherViewLike, CipherViewLikeUtils } from "../../../vault/utils/cipher-view-like-utils";
import { Utils } from "../../misc/utils";

import { parseCredentialId } from "./credential-id-utils";

// TODO: Move into Fido2AuthenticatorService
export async function getCredentialsForAutofill(
  ciphers: CipherViewLike[],
): Promise<Fido2CredentialAutofillView[]> {
  return ciphers
    .filter(
      (cipher) =>
        !CipherViewLikeUtils.isDeleted(cipher) &&
        CipherViewLikeUtils.getType(cipher) === CipherType.Login &&
        CipherViewLikeUtils.hasFido2Credentials(cipher),
    )
    .map((cipher) => {
      const login = CipherViewLikeUtils.getLogin(cipher)!;
      const credential = login.fido2Credentials![0];

      // Credentials are stored as a GUID or b64 string with `b64.` prepended,
      // but we need to return them as a URL-safe base64 string
      const credId = Utils.fromArrayToUrlB64(parseCredentialId(credential.credentialId));

      return {
        cipherId: CipherViewLikeUtils.getId(cipher)!,
        credentialId: credId,
        rpId: credential.rpId,
        userHandle: credential.userHandle!,
        userName:
          credential.userName || credential.userDisplayName || login.username || cipher.name!,
      } satisfies Fido2CredentialAutofillView;
    });
}

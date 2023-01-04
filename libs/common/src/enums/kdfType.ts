export enum KdfType {
  PBKDF2_SHA256 = 0,
  SCRYPT = 1,
}

export const DEFAULT_KDF_TYPE = KdfType.PBKDF2_SHA256;
export const DEFAULT_KDF_ITERATIONS = 100000;
export const SEND_KDF_ITERATIONS = 100000;

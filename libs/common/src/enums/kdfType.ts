export enum KdfType {
  PBKDF2_SHA256 = 0,
  SCRYPT = 1,
}

export const DEFAULT_KDF_TYPE = KdfType.PBKDF2_SHA256;
export const DEFAULT_KDF_ITERATIONS = 100000;
export const SEND_KDF_ITERATIONS = 100000;
export const DEFAULT_SCRYPT_WORK_FACTOR = 2 ** 16;
export const SCRYPT_WORK_FACTORS = [2 ** 16, 2 ** 17, 2 ** 18, 2 ** 19, 2 ** 20, 2 ** 21, 2 ** 22];

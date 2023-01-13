export enum KdfType {
  PBKDF2_SHA256 = 0,
  Argon2id = 2,
}

export const DEFAULT_KDF_TYPE = KdfType.PBKDF2_SHA256;
export const DEFAULT_KDF_ITERATIONS = 100000;
export const SEND_KDF_ITERATIONS = 100000;
export const DEFAULT_ARGON2_MEMORY = 16 * 1024; // 16 MiB

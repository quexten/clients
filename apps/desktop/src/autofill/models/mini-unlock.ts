// Shared between the main process and the lightweight mini-window renderers (Magnify, SSH
// approval). Keep this file free of `@bitwarden` imports so those bundles stay small.

/** Unlock methods the mini unlock supports. */
export const MiniUnlockMethod = Object.freeze({
  MasterPassword: "masterPassword",
  Pin: "pin",
  Biometrics: "biometrics",
} as const);
export type MiniUnlockMethod = (typeof MiniUnlockMethod)[keyof typeof MiniUnlockMethod];

/** Outcome of a mini unlock attempt. The key itself never leaves the main process. */
export const MiniUnlockResult = Object.freeze({
  Success: "success",
  Invalid: "invalid",
  Cancelled: "cancelled",
  TooManyAttempts: "tooManyAttempts",
  Error: "error",
} as const);
export type MiniUnlockResult = (typeof MiniUnlockResult)[keyof typeof MiniUnlockResult];

export type MiniUnlockOptions = Record<MiniUnlockMethod, boolean>;

/** Strings localized by the main process; the mini-window bundles ship no i18n. */
export type MiniUnlockStrings = {
  locked: string;
  /** Optional line under the title, e.g. why unlocking is needed. */
  unlockRequired: string;
  masterPassword: string;
  pin: string;
  unlock: string;
  unlockWithBiometrics: string;
  invalidMasterPassword: string;
  invalidPin: string;
  tooManyAttempts: string;
  errorOccurred: string;
};

/** Everything a mini window needs to render the mini unlock. */
export type MiniUnlockState = {
  options: MiniUnlockOptions;
  strings: MiniUnlockStrings;
};

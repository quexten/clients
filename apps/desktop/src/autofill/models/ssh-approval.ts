// Shared between the main process and the ssh-approval renderer. Keep this file free of
// `@bitwarden` imports so the lightweight approval bundle does not pull them in.

import { MiniUnlockOptions, MiniUnlockStrings } from "./mini-unlock";

/** What the approval window currently asks of the user. */
export const SshApprovalMode = Object.freeze({
  Unlock: "unlock",
  Approve: "approve",
} as const);
export type SshApprovalMode = (typeof SshApprovalMode)[keyof typeof SshApprovalMode];

export type SshApprovalRequest = {
  cipherName: string;
  application: string;
  isAgentForwarding: boolean;
  namespace: string;
};

/** Strings localized by the main process; the approval bundle ships no i18n. */
export type SshApprovalStrings = MiniUnlockStrings & {
  title: string;
  forwardingWarningTitle: string;
  forwardingWarningText: string;
  messageInfix: string;
  messageSuffix: string;
  action: string;
  authorize: string;
  deny: string;
};

export type SshApprovalState = {
  mode: SshApprovalMode;
  request: SshApprovalRequest | null;
  unlockOptions: MiniUnlockOptions | null;
  strings: SshApprovalStrings;
};

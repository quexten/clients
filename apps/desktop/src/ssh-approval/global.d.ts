// SSH-approval-specific globals. Does not extend src/global.d.ts, which would pull the whole
// desktop preload tree into this compilation (see src/magnify/global.d.ts).
declare const BIT_ENVIRONMENT: string;

declare interface Window {
  ipc: typeof import("./preload").ipc;
}

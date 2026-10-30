import { ApplicationConfig } from "@angular/core";

import { MiniUnlockClient } from "../../mini-unlock/mini-unlock-client";
import { ApprovalIpcService } from "../services/approval-ipc.service";

export const appConfig: ApplicationConfig = {
  providers: [{ provide: MiniUnlockClient, useExisting: ApprovalIpcService }],
};

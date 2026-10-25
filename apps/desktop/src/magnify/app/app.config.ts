import { ApplicationConfig } from "@angular/core";

import { MiniUnlockClient } from "../../mini-unlock/mini-unlock-client";
import { CommandService } from "../services/command-service";

export const appConfig: ApplicationConfig = {
  providers: [{ provide: MiniUnlockClient, useExisting: CommandService }],
};

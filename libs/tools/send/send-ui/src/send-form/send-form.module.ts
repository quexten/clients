import { NgModule } from "@angular/core";

import { safeProvider } from "@bitwarden/angular/platform/utils/safe-provider";
import { SafeInjectionToken } from "@bitwarden/angular/services/injection-tokens";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { StateProvider } from "@bitwarden/common/platform/state";
import {
  createRandomizer,
  CredentialGeneratorService,
  Randomizer,
} from "@bitwarden/generator-core";
import { KeyService } from "@bitwarden/key-management";

import { SendFormService } from "./abstractions/send-form.service";
import { SendFormComponent } from "./components/send-form.component";
import { DefaultSendFormService } from "./services/default-send-form.service";

const RANDOMIZER = new SafeInjectionToken<Randomizer>("Randomizer");

@NgModule({
  imports: [SendFormComponent],
  providers: [
    {
      provide: SendFormService,
      useClass: DefaultSendFormService,
    },
    safeProvider({
      provide: RANDOMIZER,
      useFactory: createRandomizer,
      deps: [KeyService],
    }),
    safeProvider({
      useClass: CredentialGeneratorService,
      provide: CredentialGeneratorService,
      deps: [
        RANDOMIZER,
        StateProvider,
        PolicyService,
        ApiService,
        I18nService,
        EncryptService,
        KeyService,
        AccountService,
      ],
    }),
  ],
  exports: [SendFormComponent],
})
export class SendFormModule {}

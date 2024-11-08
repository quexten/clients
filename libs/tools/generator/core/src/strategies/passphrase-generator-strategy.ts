import { PolicyType } from "@bitwarden/common/admin-console/enums";
import { StateProvider } from "@bitwarden/common/platform/state";

import { GeneratorStrategy } from "../abstractions";
import { DefaultPassphraseGenerationOptions, Policies } from "../data";
import { PasswordRandomizer } from "../engine";
import { mapPolicyToEvaluator } from "../rx";
import { PassphraseGenerationOptions, PassphraseGeneratorPolicy } from "../types";
import { observe$PerUserId, optionsToEffWordListRequest, sharedStateByUserId } from "../util";

import { PASSPHRASE_SETTINGS } from "./storage";

/** Generates passphrases composed of random words */
export class PassphraseGeneratorStrategy
  implements GeneratorStrategy<PassphraseGenerationOptions, PassphraseGeneratorPolicy>
{
  /** instantiates the password generator strategy.
   *  @param legacy generates the passphrase
   *  @param stateProvider provides durable state
   */
  constructor(
    private randomizer: PasswordRandomizer,
    private stateProvider: StateProvider,
  ) {}

  // configuration
  durableState = sharedStateByUserId(PASSPHRASE_SETTINGS, this.stateProvider);
  defaults$ = observe$PerUserId(() => DefaultPassphraseGenerationOptions);
  readonly policy = PolicyType.PasswordGenerator;
  toEvaluator() {
    return mapPolicyToEvaluator(Policies.Passphrase);
  }

  // algorithm
  async generate(options: PassphraseGenerationOptions): Promise<string> {
    const request = optionsToEffWordListRequest(options);

    return this.randomizer.randomEffLongWords(request);
  }
}

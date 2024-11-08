import { EFFLongWordList } from "@bitwarden/common/platform/misc/wordlist";
import { GenerationRequest } from "@bitwarden/common/tools/types";

import {
  CredentialGenerator,
  GeneratedCredential,
  PassphraseGenerationOptions,
  PasswordGenerationOptions,
} from "../types";
import { optionsToEffWordListRequest, optionsToRandomAsciiRequest } from "../util";

import { Randomizer } from "./abstractions";
import { Ascii } from "./data";
import { CharacterSet, EffWordListRequest, RandomAsciiRequest } from "./types";

/** Generation algorithms that produce randomized secrets */
export class PasswordRandomizer
  implements
    CredentialGenerator<PassphraseGenerationOptions>,
    CredentialGenerator<PasswordGenerationOptions>
{
  /** Instantiates the password randomizer
   *  @param randomizer data source for random data
   */
  constructor(private randomizer: Randomizer) {}

  /** create a password from ASCII codepoints
   *  @param request refines the generated password
   *  @returns a promise that completes with the generated password
   */
  async randomAscii(request: RandomAsciiRequest) {
    // randomize character sets
    const sets = toAsciiSets(request);
    const shuffled = await this.randomizer.shuffle(sets);

    // generate password
    const generating = shuffled.flatMap((set) => this.randomizer.pick(set));
    const generated = await Promise.all(generating);
    const result = generated.join("");

    return result;
  }

  /** create a passphrase from the EFF's "5 dice" word list
   *  @param request refines the generated passphrase
   * @returns a promise that completes with the generated passphrase
   */
  async randomEffLongWords(request: EffWordListRequest) {
    // select which word gets the number, if any
    let luckyNumber = -1;
    if (request.number) {
      luckyNumber = await this.randomizer.uniform(0, request.numberOfWords - 1);
    }

    // generate the passphrase
    const wordList = new Array(request.numberOfWords);
    for (let i = 0; i < request.numberOfWords; i++) {
      const word = await this.randomizer.pickWord(EFFLongWordList, {
        titleCase: request.capitalize,
        number: i === luckyNumber,
      });

      wordList[i] = word;
    }

    return wordList.join(request.separator);
  }

  generate(
    request: GenerationRequest,
    settings: PasswordGenerationOptions,
  ): Promise<GeneratedCredential>;
  generate(
    request: GenerationRequest,
    settings: PassphraseGenerationOptions,
  ): Promise<GeneratedCredential>;
  async generate(
    _request: GenerationRequest,
    settings: PasswordGenerationOptions | PassphraseGenerationOptions,
  ) {
    if (isPasswordGenerationOptions(settings)) {
      const request = optionsToRandomAsciiRequest(settings);
      const password = await this.randomAscii(request);

      return new GeneratedCredential(password, "password", Date.now());
    } else if (isPassphraseGenerationOptions(settings)) {
      const request = optionsToEffWordListRequest(settings);
      const passphrase = await this.randomEffLongWords(request);

      return new GeneratedCredential(passphrase, "passphrase", Date.now());
    }

    throw new Error("Invalid settings received by generator.");
  }
}

function isPasswordGenerationOptions(settings: any): settings is PasswordGenerationOptions {
  return "length" in (settings ?? {});
}

function isPassphraseGenerationOptions(settings: any): settings is PassphraseGenerationOptions {
  return "numWords" in (settings ?? {});
}

// given a generator request, convert each of its `number | undefined` properties
// to an array of character sets, one for each property. The transformation is
// deterministic.
function toAsciiSets(request: RandomAsciiRequest) {
  // allocate an array and initialize each cell with a fixed value
  function allocate<T>(size: number, value: T) {
    const data = new Array(size > 0 ? size : 0);
    data.fill(value, 0, size);
    return data;
  }

  const allSet: CharacterSet = [];
  const active = request.ambiguous ? Ascii.Full : Ascii.Unmistakable;
  const parts: Array<CharacterSet> = [];

  if (request.uppercase !== undefined) {
    parts.push(...allocate(request.uppercase, active.Uppercase));
    allSet.push(...active.Uppercase);
  }

  if (request.lowercase !== undefined) {
    parts.push(...allocate(request.lowercase, active.Lowercase));
    allSet.push(...active.Lowercase);
  }

  if (request.digits !== undefined) {
    parts.push(...allocate(request.digits, active.Digit));
    allSet.push(...active.Digit);
  }

  if (request.special !== undefined) {
    parts.push(...allocate(request.special, active.Special));
    allSet.push(...active.Special);
  }

  parts.push(...allocate(request.all, allSet));

  return parts;
}

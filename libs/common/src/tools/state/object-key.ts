import { UserKeyDefinition, UserKeyDefinitionOptions } from "../../platform/state";
// eslint-disable-next-line -- `StateDefinition` used as a type
import type { StateDefinition } from "../../platform/state/state-definition";

import { ClassifiedFormat } from "./classified-format";
import { Classifier } from "./classifier";

/** A key for storing JavaScript objects (`{ an: "example" }`)
 * in a UserStateSubject.
 */
// FIXME: promote to class: `ObjectConfiguration<State, Secret, Disclosed>`.
//        The class receives `encryptor`, `prepareNext`, `adjust`, and `fix`
//        From `UserStateSubject`. `UserStateSubject` keeps `classify` and
//        `declassify`. The class should also include serialization
//        facilities (to be used in place of JSON.parse/stringify) in it's
//        options. Also allow swap between "classifier" and "classification"; the
//        latter is a list of properties/arguments to the specific classifier in-use.
export type ObjectKey<State, Secret = State, Disclosed = Record<string, never>> = {
  target: "object";
  key: string;
  state: StateDefinition;
  classifier: Classifier<State, Disclosed, Secret>;
  format: "plain" | "classified";
  options: UserKeyDefinitionOptions<State>;
  initial?: State;
};

export function isObjectKey(key: any): key is ObjectKey<unknown> {
  return key.target === "object" && "format" in key && "classifier" in key;
}

export function toUserKeyDefinition<State, Secret, Disclosed>(
  key: ObjectKey<State, Secret, Disclosed>,
) {
  if (key.format === "plain") {
    const plain = new UserKeyDefinition<State>(key.state, key.key, key.options);

    return plain;
  } else if (key.format === "classified") {
    const classified = new UserKeyDefinition<ClassifiedFormat<void, Disclosed>>(
      key.state,
      key.key,
      {
        cleanupDelayMs: key.options.cleanupDelayMs,
        deserializer: (jsonValue) => jsonValue as ClassifiedFormat<void, Disclosed>,
        clearOn: key.options.clearOn,
      },
    );

    return classified;
  } else {
    throw new Error(`unknown format: ${key.format}`);
  }
}

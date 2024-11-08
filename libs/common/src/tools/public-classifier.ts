import { Jsonify } from "type-fest";

import { Classifier } from "@bitwarden/common/tools/state/classifier";

export class PublicClassifier<Data> implements Classifier<Data, Data, Record<string, never>> {
  constructor(private keys: (keyof Jsonify<Data>)[]) {}

  classify(value: Data): { disclosed: Jsonify<Data>; secret: Jsonify<Record<string, never>> } {
    const pickMe = JSON.parse(JSON.stringify(value));

    const picked: Partial<Jsonify<Data>> = {};
    for (const key of this.keys) {
      picked[key] = pickMe[key];
    }
    const disclosed = picked as Jsonify<Data>;

    return { disclosed, secret: null };
  }

  declassify(disclosed: Jsonify<Data>, _secret: Jsonify<Record<keyof Data, never>>) {
    const result: Partial<Jsonify<Data>> = {};

    for (const key of this.keys) {
      result[key] = disclosed[key];
    }

    return result as Jsonify<Data>;
  }
}

import { distinctUntilChanged, map, OperatorFunction, pipe } from "rxjs";

import { DefaultPolicyEvaluator } from "./default-policy-evaluator";
import { PolicyConfiguration } from "./policies";

/**
 * An observable operator that reduces an emitted collection to a single object,
 * returning a default if all items are ignored.
 * @param reduce The reduce function to apply to the filtered collection. The
 *  first argument is the accumulator, and the second is the current item. The
 *  return value is the new accumulator.
 * @param defaultValue The default value to return if the collection is empty. The
 *   default value is also the initial value of the accumulator.
 */
export function reduceCollection<Item, Accumulator>(
  reduce: (acc: Accumulator, value: Item) => Accumulator,
  defaultValue: Accumulator,
): OperatorFunction<Item[], Accumulator> {
  return map((values: Item[]) => {
    const reduced = (values ?? []).reduce(reduce, structuredClone(defaultValue));
    return reduced;
  });
}

/**
 * An observable operator that emits distinct values by checking that all
 *   values in the previous entry match the next entry. This method emits
 *   when a key is added and does not when a key is removed.
 * @remarks This method checks objects. It does not check items in arrays.
 */
export function distinctIfShallowMatch<Item>(): OperatorFunction<Item, Item> {
  return distinctUntilChanged((previous, current) => {
    let isDistinct = true;

    for (const key in current) {
      isDistinct &&= previous[key] === current[key];
    }

    return isDistinct;
  });
}

/** Maps an administrative console policy to a policy evaluator using the provided configuration.
 *  @param configuration the configuration that constructs the evaluator.
 */
export function mapPolicyToEvaluator<Policy, Evaluator>(
  configuration: PolicyConfiguration<Policy, Evaluator>,
) {
  return pipe(
    reduceCollection(configuration.combine, configuration.disabledValue),
    distinctIfShallowMatch(),
    map(configuration.createEvaluator),
  );
}

/** Constructs a method that maps a policy to the default (no-op) policy. */
export function newDefaultEvaluator<Target>() {
  return () => {
    return pipe(map((_) => new DefaultPolicyEvaluator<Target>()));
  };
}

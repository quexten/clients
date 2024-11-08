import {
  map,
  distinctUntilChanged,
  OperatorFunction,
  Observable,
  ignoreElements,
  endWith,
  race,
  pipe,
  connect,
  ReplaySubject,
  concat,
  zip,
  first,
  takeUntil,
  withLatestFrom,
  concatMap,
} from "rxjs";

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

/** Create an observable that, once subscribed, emits `true` then completes when
 *   any input completes. If an input is already complete when the subscription
 *   occurs, it emits immediately.
 *  @param watch$ the observable(s) to watch for completion; if an array is passed,
 *   null and undefined members are ignored. If `watch$` is empty, `anyComplete`
 *   will never complete.
 *  @returns An observable that emits `true` when any of its inputs
 *   complete. The observable forwards the first error from its input.
 *  @remarks This method is particularly useful in combination with `takeUntil` and
 *   streams that are not guaranteed to complete on their own.
 */
export function anyComplete(watch$: Observable<any> | Observable<any>[]): Observable<any> {
  if (Array.isArray(watch$)) {
    const completes$ = watch$
      .filter((w$) => !!w$)
      .map((w$) => w$.pipe(ignoreElements(), endWith(true)));
    const completed$ = race(completes$);
    return completed$;
  } else {
    return watch$.pipe(ignoreElements(), endWith(true));
  }
}

/**
 * Create an observable that delays the input stream until all watches have
 *  emitted a value. The watched values are not included in the source stream.
 *  The last emission from the source is output when all the watches have
 *  emitted at least once.
 * @param watch$ the observable(s) to watch for readiness. If `watch$` is empty,
 *  `ready` will never emit.
 * @returns An observable that emits when the source stream emits. The observable
 *   errors if one of its watches completes before emitting. It also errors if one
 *   of its watches errors.
 */
export function ready<T>(watch$: Observable<any> | Observable<any>[]) {
  const watching$ = Array.isArray(watch$) ? watch$ : [watch$];
  return pipe(
    connect<T, Observable<T>>((source$) => {
      // this subscription is safe because `source$` connects only after there
      // is an external subscriber.
      const source = new ReplaySubject<T>(1);
      source$.subscribe(source);

      // `concat` is subscribed immediately after it's returned, at which point
      // `zip` blocks until all items in `watching$` are ready. If that occurs
      // after `source$` is hot, then the replay subject sends the last-captured
      // emission through immediately. Otherwise, `ready` waits for the next
      // emission
      return concat(zip(watching$).pipe(first(), ignoreElements()), source).pipe(
        takeUntil(anyComplete(source)),
      );
    }),
  );
}

export function withLatestReady<Source, Watch>(
  watch$: Observable<Watch>,
): OperatorFunction<Source, [Source, Watch]> {
  return connect((source$) => {
    // these subscriptions are safe because `source$` connects only after there
    // is an external subscriber.
    const source = new ReplaySubject<Source>(1);
    source$.subscribe(source);
    const watch = new ReplaySubject<Watch>(1);
    watch$.subscribe(watch);

    // `concat` is subscribed immediately after it's returned, at which point
    // `zip` blocks until all items in `watching$` are ready. If that occurs
    // after `source$` is hot, then the replay subject sends the last-captured
    // emission through immediately. Otherwise, `ready` waits for the next
    // emission
    return concat(zip(watch).pipe(first(), ignoreElements()), source).pipe(
      withLatestFrom(watch),
      takeUntil(anyComplete(source)),
    );
  });
}

/**
 * Create an observable that emits the latest value of the source stream
 *  when `watch$` emits. If `watch$` emits before the stream emits, then
 *  an emission occurs as soon as a value becomes ready.
 * @param watch$ the observable that triggers emissions
 * @returns An observable that emits when `watch$` emits. The observable
 *  errors if its source stream errors. It also errors if `on` errors. It
 *  completes if its watch completes.
 *
 * @remarks This works like `audit`, but it repeats emissions when
 *  watch$ fires.
 */
export function on<T>(watch$: Observable<any>) {
  return pipe(
    connect<T, Observable<T>>((source$) => {
      const source = new ReplaySubject<T>(1);
      source$.subscribe(source);

      return watch$
        .pipe(
          ready(source),
          concatMap(() => source.pipe(first())),
        )
        .pipe(takeUntil(anyComplete(source)));
    }),
  );
}

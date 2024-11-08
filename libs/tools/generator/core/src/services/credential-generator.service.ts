import {
  BehaviorSubject,
  combineLatest,
  concat,
  concatMap,
  distinctUntilChanged,
  endWith,
  filter,
  first,
  firstValueFrom,
  ignoreElements,
  map,
  Observable,
  share,
  skipUntil,
  switchMap,
  takeUntil,
  takeWhile,
  withLatestFrom,
} from "rxjs";
import { Simplify } from "type-fest";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { PolicyType } from "@bitwarden/common/admin-console/enums";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { StateProvider } from "@bitwarden/common/platform/state";
import {
  OnDependency,
  SingleUserDependency,
  UserBound,
  UserDependency,
} from "@bitwarden/common/tools/dependencies";
import { IntegrationId, IntegrationMetadata } from "@bitwarden/common/tools/integration";
import { RestClient } from "@bitwarden/common/tools/integration/rpc";
import { anyComplete } from "@bitwarden/common/tools/rx";
import { PaddedDataPacker } from "@bitwarden/common/tools/state/padded-data-packer";
import { UserEncryptor } from "@bitwarden/common/tools/state/user-encryptor.abstraction";
import { UserKeyEncryptor } from "@bitwarden/common/tools/state/user-key-encryptor";
import { UserStateSubject } from "@bitwarden/common/tools/state/user-state-subject";
import { UserId } from "@bitwarden/common/types/guid";
import { KeyService } from "@bitwarden/key-management";

import { Randomizer } from "../abstractions";
import {
  Generators,
  getForwarderConfiguration,
  Integrations,
  toCredentialGeneratorConfiguration,
} from "../data";
import { availableAlgorithms } from "../policies/available-algorithms-policy";
import { mapPolicyToConstraints } from "../rx";
import {
  CredentialAlgorithm,
  CredentialCategories,
  CredentialCategory,
  AlgorithmInfo,
  CredentialPreference,
  isForwarderIntegration,
  ForwarderIntegration,
} from "../types";
import {
  CredentialGeneratorConfiguration as Configuration,
  CredentialGeneratorInfo,
  GeneratorDependencyProvider,
} from "../types/credential-generator-configuration";
import { GeneratorConstraints } from "../types/generator-constraints";

import { PREFERENCES } from "./credential-preferences";

type Policy$Dependencies = UserDependency;
type Settings$Dependencies = Partial<UserDependency>;
type Generate$Dependencies = Simplify<Partial<OnDependency> & Partial<UserDependency>> & {
  /** Emits the active website when subscribed.
   *
   *  The generator does not respond to emissions of this interface;
   *  If it is provided, the generator blocks until a value becomes available.
   *  When `website$` is omitted, the generator uses the empty string instead.
   *  When `website$` completes, the generator completes.
   *  When `website$` errors, the generator forwards the error.
   */
  website$?: Observable<string>;

  integration$?: Observable<IntegrationId>;
};

type Algorithms$Dependencies = Partial<UserDependency>;

const OPTIONS_FRAME_SIZE = 512;

export class CredentialGeneratorService {
  constructor(
    private readonly randomizer: Randomizer,
    private readonly stateProvider: StateProvider,
    private readonly policyService: PolicyService,
    private readonly apiService: ApiService,
    private readonly i18nService: I18nService,
    private readonly encryptService: EncryptService,
    private readonly keyService: KeyService,
    private readonly accountService: AccountService,
  ) {}

  private getDependencyProvider(): GeneratorDependencyProvider {
    return {
      client: new RestClient(this.apiService, this.i18nService),
      i18nService: this.i18nService,
      randomizer: this.randomizer,
    };
  }

  // FIXME: the rxjs methods of this service can be a lot more resilient if
  // `Subjects` are introduced where sharing occurs

  /** Generates a stream of credentials
   * @param configuration determines which generator's settings are loaded
   * @param dependencies.on$ when specified, a new credential is emitted when
   *   this emits. Otherwise, a new credential is emitted when the settings
   *   update.
   */
  generate$<Settings extends object, Policy>(
    configuration: Readonly<Configuration<Settings, Policy>>,
    dependencies?: Generate$Dependencies,
  ) {
    // instantiate the engine
    const engine = configuration.engine.create(this.getDependencyProvider());

    // stream blocks until all of these values are received
    const website$ = dependencies?.website$ ?? new BehaviorSubject<string>(null);
    const request$ = website$.pipe(map((website) => ({ website })));
    const settings$ = this.settings$(configuration, dependencies);

    // if on$ triggers before settings are loaded, trigger as soon
    // as they become available.
    let readyOn$: Observable<any> = null;
    if (dependencies?.on$) {
      const NO_EMISSIONS = {};
      const ready$ = combineLatest([settings$, request$]).pipe(
        first(null, NO_EMISSIONS),
        filter((value) => value !== NO_EMISSIONS),
        share(),
      );
      readyOn$ = concat(
        dependencies.on$?.pipe(switchMap(() => ready$)),
        dependencies.on$.pipe(skipUntil(ready$)),
      );
    }

    // generation proper
    const generate$ = (readyOn$ ?? settings$).pipe(
      withLatestFrom(request$, settings$),
      concatMap(([, request, settings]) => engine.generate(request, settings)),
      takeUntil(anyComplete([request$, settings$])),
    );

    return generate$;
  }

  /** Emits metadata concerning the provided generation algorithms
   *  @param category the category or categories of interest
   *  @param dependences.userId$ when provided, the algorithms are filter to only
   *   those matching the provided user's policy. Otherwise, emits the algorithms
   *   available to the active user.
   *  @returns An observable that emits algorithm metadata.
   */
  algorithms$(
    category: CredentialCategory,
    dependencies?: Algorithms$Dependencies,
  ): Observable<AlgorithmInfo[]>;
  algorithms$(
    category: CredentialCategory[],
    dependencies?: Algorithms$Dependencies,
  ): Observable<AlgorithmInfo[]>;
  algorithms$(
    category: CredentialCategory | CredentialCategory[],
    dependencies?: Algorithms$Dependencies,
  ) {
    // any cast required here because TypeScript fails to bind `category`
    // to the union-typed overload of `algorithms`.
    const algorithms = this.algorithms(category as any);

    // fall back to default bindings
    const userId$ = dependencies?.userId$ ?? this.stateProvider.activeUserId$;

    // monitor completion
    const completion$ = userId$.pipe(ignoreElements(), endWith(true));

    // apply policy
    const algorithms$ = userId$.pipe(
      distinctUntilChanged(),
      switchMap((userId) => {
        // complete policy emissions otherwise `switchMap` holds `algorithms$` open indefinitely
        const policies$ = this.policyService.getAll$(PolicyType.PasswordGenerator, userId).pipe(
          map((p) => new Set(availableAlgorithms(p))),
          takeUntil(completion$),
        );
        return policies$;
      }),
      map((available) => {
        const filtered = algorithms.filter(
          (c) => isForwarderIntegration(c.id) || available.has(c.id),
        );
        return filtered;
      }),
    );

    return algorithms$;
  }

  /** Lists metadata for the algorithms in a credential category
   *  @param category the category or categories of interest
   *  @returns A list containing the requested metadata.
   */
  algorithms(category: CredentialCategory): AlgorithmInfo[];
  algorithms(category: CredentialCategory[]): AlgorithmInfo[];
  algorithms(category: CredentialCategory | CredentialCategory[]): AlgorithmInfo[] {
    const categories: CredentialCategory[] = Array.isArray(category) ? category : [category];

    const algorithms = categories
      .flatMap((c) => CredentialCategories[c] as CredentialAlgorithm[])
      .map((id) => this.algorithm(id))
      .filter((info) => info !== null);

    const forwarders = Object.keys(Integrations)
      .map((key: keyof typeof Integrations) => {
        const forwarder: ForwarderIntegration = { forwarder: Integrations[key].id };
        return this.algorithm(forwarder);
      })
      .filter((forwarder) => categories.includes(forwarder.category));

    return algorithms.concat(forwarders);
  }

  /** Look up the metadata for a specific generator algorithm
   *  @param id identifies the algorithm
   *  @returns the requested metadata, or `null` if the metadata wasn't found.
   */
  algorithm(id: CredentialAlgorithm): AlgorithmInfo {
    let generator: CredentialGeneratorInfo = null;
    let integration: IntegrationMetadata = null;

    if (isForwarderIntegration(id)) {
      const forwarderConfig = getForwarderConfiguration(id.forwarder);
      integration = forwarderConfig;

      if (forwarderConfig) {
        generator = toCredentialGeneratorConfiguration(forwarderConfig);
      }
    } else {
      generator = Generators[id];
    }

    if (!generator) {
      throw new Error(`Invalid credential algorithm: ${JSON.stringify(id)}`);
    }

    const info: AlgorithmInfo = {
      id: generator.id,
      category: generator.category,
      name: integration ? integration.name : this.i18nService.t(generator.nameKey),
      generate: this.i18nService.t(generator.generateKey),
      generatedValue: this.i18nService.t(generator.generatedValueKey),
      copy: this.i18nService.t(generator.copyKey),
      onlyOnRequest: generator.onlyOnRequest,
      request: generator.request,
    };

    if (generator.descriptionKey) {
      info.description = this.i18nService.t(generator.descriptionKey);
    }

    return info;
  }

  private encryptor$(userId: UserId) {
    const packer = new PaddedDataPacker(OPTIONS_FRAME_SIZE);
    const encryptor$ = this.keyService.userKey$(userId).pipe(
      // complete when the account locks
      takeWhile((key) => !!key),
      map((key) => {
        const encryptor = new UserKeyEncryptor(userId, this.encryptService, key, packer);

        return { userId, encryptor } satisfies UserBound<"encryptor", UserEncryptor>;
      }),
    );

    return encryptor$;
  }

  /** Get the settings for the provided configuration
   * @param configuration determines which generator's settings are loaded
   * @param dependencies.userId$ identifies the user to which the settings are bound.
   *   If this parameter is not provided, the observable follows the active user and
   *   may not complete.
   * @returns an observable that emits settings
   * @remarks the observable enforces policies on the settings
   */
  settings$<Settings extends object, Policy>(
    configuration: Configuration<Settings, Policy>,
    dependencies?: Settings$Dependencies,
  ) {
    const userId$ = dependencies?.userId$ ?? this.stateProvider.activeUserId$;
    const constraints$ = this.policy$(configuration, { userId$ });

    const settings$ = userId$.pipe(
      filter((userId) => !!userId),
      distinctUntilChanged(),
      switchMap((userId) => {
        const state$ = new UserStateSubject(
          configuration.settings.account,
          (key) => this.stateProvider.getUser(userId, key),
          { constraints$, singleUserEncryptor$: this.encryptor$(userId) },
        );
        return state$;
      }),
      map((settings) => settings ?? structuredClone(configuration.settings.initial)),
      takeUntil(anyComplete(userId$)),
    );

    return settings$;
  }

  /** Get a subject bound to credential generator preferences.
   *  @param dependencies.singleUserId$ identifies the user to which the preferences are bound
   *  @returns a promise that resolves with the subject once `dependencies.singleUserId$`
   *   becomes available.
   *  @remarks Preferences determine which algorithms are used when generating a
   *   credential from a credential category (e.g. `PassX` or `Username`). Preferences
   *   should not be used to hold navigation history. Use @bitwarden/generator-navigation
   *   instead.
   */
  async preferences(
    dependencies: SingleUserDependency,
  ): Promise<UserStateSubject<CredentialPreference>> {
    const userId = await firstValueFrom(
      dependencies.singleUserId$.pipe(filter((userId) => !!userId)),
    );

    // FIXME: enforce policy
    const subject = new UserStateSubject(
      PREFERENCES,
      (key) => this.stateProvider.getUser(userId, key),
      { singleUserEncryptor$: this.encryptor$(userId) },
    );

    return subject;
  }

  /** Get a subject bound to a specific user's settings
   * @param configuration determines which generator's settings are loaded
   * @param dependencies.singleUserId$ identifies the user to which the settings are bound
   * @returns a promise that resolves with the subject once
   *  `dependencies.singleUserId$` becomes available.
   * @remarks the subject enforces policy for the settings
   */
  async settings<Settings extends object, Policy>(
    configuration: Readonly<Configuration<Settings, Policy>>,
    dependencies: SingleUserDependency,
  ) {
    const userId = await firstValueFrom(
      dependencies.singleUserId$.pipe(filter((userId) => !!userId)),
    );

    const constraints$ = this.policy$(configuration, { userId$: dependencies.singleUserId$ });

    const subject = new UserStateSubject(
      configuration.settings.account,
      (key) => this.stateProvider.getUser(userId, key),
      { constraints$, singleUserEncryptor$: this.encryptor$(userId) },
    );

    return subject;
  }

  /** Get the policy constraints for the provided configuration
   *  @param dependencies.userId$ determines which user's policy is loaded
   *  @returns an observable that emits the policy once `dependencies.userId$`
   *   and the policy become available.
   */
  policy$<Settings, Policy>(
    configuration: Configuration<Settings, Policy>,
    dependencies: Policy$Dependencies,
  ): Observable<GeneratorConstraints<Settings>> {
    const email$ = dependencies.userId$.pipe(
      distinctUntilChanged(),
      withLatestFrom(this.accountService.accounts$),
      filter((accounts) => !!accounts),
      map(([userId, accounts]) => {
        if (userId in accounts) {
          return { userId, email: accounts[userId].email };
        }

        return { userId, email: null };
      }),
    );

    const constraints$ = email$.pipe(
      switchMap(({ userId, email }) => {
        // complete policy emissions otherwise `switchMap` holds `policies$` open indefinitely
        const policies$ = this.policyService
          .getAll$(configuration.policy.type, userId)
          .pipe(
            mapPolicyToConstraints(configuration.policy, email),
            takeUntil(anyComplete(email$)),
          );
        return policies$;
      }),
    );

    return constraints$;
  }
}

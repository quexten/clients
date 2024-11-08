import { Component, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  combineLatestWith,
  distinctUntilChanged,
  filter,
  map,
  ReplaySubject,
  Subject,
  switchMap,
  takeUntil,
  withLatestFrom,
} from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { IntegrationId } from "@bitwarden/common/tools/integration";
import { UserId } from "@bitwarden/common/types/guid";
import { ToastService } from "@bitwarden/components";
import { Option } from "@bitwarden/components/src/select/option";
import {
  AlgorithmInfo,
  CredentialAlgorithm,
  CredentialCategory,
  CredentialGeneratorService,
  GeneratedCredential,
  Generators,
  getForwarderConfiguration,
  isEmailAlgorithm,
  isForwarderIntegration,
  isPasswordAlgorithm,
  isSameAlgorithm,
  isUsernameAlgorithm,
  toCredentialGeneratorConfiguration,
} from "@bitwarden/generator-core";
import { GeneratorHistoryService } from "@bitwarden/generator-history";

// constants used to identify navigation selections that are not
// generator algorithms
const IDENTIFIER = "identifier";
const FORWARDER = "forwarder";
const NONE_SELECTED = "none";

@Component({
  selector: "tools-credential-generator",
  templateUrl: "credential-generator.component.html",
})
export class CredentialGeneratorComponent implements OnInit, OnDestroy {
  constructor(
    private generatorService: CredentialGeneratorService,
    private generatorHistoryService: GeneratorHistoryService,
    private toastService: ToastService,
    private logService: LogService,
    private i18nService: I18nService,
    private accountService: AccountService,
    private zone: NgZone,
    private formBuilder: FormBuilder,
  ) {}

  /** Binds the component to a specific user's settings. When this input is not provided,
   * the form binds to the active user
   */
  @Input()
  userId: UserId | null;

  /** Emits credentials created from a generation request. */
  @Output()
  readonly onGenerated = new EventEmitter<GeneratedCredential>();

  protected root$ = new BehaviorSubject<{ nav: string }>({
    nav: null,
  });

  protected onRootChanged(value: { nav: string }) {
    // prevent subscription cycle
    if (this.root$.value.nav !== value.nav) {
      this.zone.run(() => {
        this.root$.next(value);
      });
    }
  }

  protected username = this.formBuilder.group({
    nav: [null as string],
  });

  protected forwarder = this.formBuilder.group({
    nav: [null as string],
  });

  async ngOnInit() {
    if (this.userId) {
      this.userId$.next(this.userId);
    } else {
      this.accountService.activeAccount$
        .pipe(
          map((acct) => acct.id),
          distinctUntilChanged(),
          takeUntil(this.destroyed),
        )
        .subscribe(this.userId$);
    }

    this.generatorService
      .algorithms$(["email", "username"], { userId$: this.userId$ })
      .pipe(
        map((algorithms) => {
          const usernames = algorithms.filter((a) => !isForwarderIntegration(a.id));
          const usernameOptions = this.toOptions(usernames);
          usernameOptions.push({ value: FORWARDER, label: this.i18nService.t("forwardedEmail") });

          const forwarders = algorithms.filter((a) => isForwarderIntegration(a.id));
          const forwarderOptions = this.toOptions(forwarders);
          forwarderOptions.unshift({ value: NONE_SELECTED, label: this.i18nService.t("select") });

          return [usernameOptions, forwarderOptions] as const;
        }),
        takeUntil(this.destroyed),
      )
      .subscribe(([usernames, forwarders]) => {
        this.usernameOptions$.next(usernames);
        this.forwarderOptions$.next(forwarders);
      });

    this.generatorService
      .algorithms$("password", { userId$: this.userId$ })
      .pipe(
        map((algorithms) => {
          const options = this.toOptions(algorithms);
          options.push({ value: IDENTIFIER, label: this.i18nService.t("username") });
          return options;
        }),
        takeUntil(this.destroyed),
      )
      .subscribe(this.rootOptions$);

    this.algorithm$
      .pipe(
        map((a) => a?.description),
        takeUntil(this.destroyed),
      )
      .subscribe((hint) => {
        // update subjects within the angular zone so that the
        // template bindings refresh immediately
        this.zone.run(() => {
          this.credentialTypeHint$.next(hint);
        });
      });

    this.algorithm$
      .pipe(
        map((a) => a?.category),
        distinctUntilChanged(),
        takeUntil(this.destroyed),
      )
      .subscribe((category) => {
        // update subjects within the angular zone so that the
        // template bindings refresh immediately
        this.zone.run(() => {
          this.category$.next(category);
        });
      });

    // wire up the generator
    this.algorithm$
      .pipe(
        filter((algorithm) => !!algorithm),
        switchMap((algorithm) => this.typeToGenerator$(algorithm.id)),
        catchError((error: unknown, generator) => {
          if (typeof error === "string") {
            this.toastService.showToast({
              message: error,
              variant: "error",
              title: "",
            });
          } else {
            this.logService.error(error);
          }

          // continue with origin stream
          return generator;
        }),
        withLatestFrom(this.userId$),
        takeUntil(this.destroyed),
      )
      .subscribe(([generated, userId]) => {
        this.generatorHistoryService
          .track(userId, generated.credential, generated.category, generated.generationDate)
          .catch((e: unknown) => {
            this.logService.error(e);
          });

        // update subjects within the angular zone so that the
        // template bindings refresh immediately
        this.zone.run(() => {
          this.onGenerated.next(generated);
          this.value$.next(generated.credential);
        });
      });

    // these subjects normalize cascade selections to ensure the current
    // cascade is always well-known.
    type CascadeValue = { nav: string; algorithm?: CredentialAlgorithm };
    const activeRoot$ = new Subject<CascadeValue>();
    const activeIdentifier$ = new Subject<CascadeValue>();
    const activeForwarder$ = new Subject<CascadeValue>();

    this.root$
      .pipe(
        map(
          (root): CascadeValue =>
            root.nav === IDENTIFIER
              ? { nav: root.nav }
              : { nav: root.nav, algorithm: JSON.parse(root.nav) },
        ),
        takeUntil(this.destroyed),
      )
      .subscribe(activeRoot$);

    this.username.valueChanges
      .pipe(
        map(
          (username): CascadeValue =>
            username.nav === FORWARDER
              ? { nav: username.nav }
              : { nav: username.nav, algorithm: JSON.parse(username.nav) },
        ),
        takeUntil(this.destroyed),
      )
      .subscribe(activeIdentifier$);

    this.forwarder.valueChanges
      .pipe(
        map(
          (forwarder): CascadeValue =>
            forwarder.nav === NONE_SELECTED
              ? { nav: forwarder.nav }
              : { nav: forwarder.nav, algorithm: JSON.parse(forwarder.nav) },
        ),
        takeUntil(this.destroyed),
      )
      .subscribe(activeForwarder$);

    // update forwarder cascade visibility
    combineLatest([activeRoot$, activeIdentifier$, activeForwarder$])
      .pipe(
        map(([root, username, forwarder]) => {
          const showForwarder = !root.algorithm && !username.algorithm;
          const forwarderId =
            showForwarder && isForwarderIntegration(forwarder.algorithm)
              ? forwarder.algorithm.forwarder
              : null;
          return [showForwarder, forwarderId] as const;
        }),
        distinctUntilChanged((prev, next) => prev[0] === next[0] && prev[1] === next[1]),
        takeUntil(this.destroyed),
      )
      .subscribe(([showForwarder, forwarderId]) => {
        // update subjects within the angular zone so that the
        // template bindings refresh immediately
        this.zone.run(() => {
          this.showForwarder$.next(showForwarder);
          this.forwarderId$.next(forwarderId);
        });
      });

    // update active algorithm
    combineLatest([activeRoot$, activeIdentifier$, activeForwarder$])
      .pipe(
        map(([root, username, forwarder]) => {
          const selection = root.algorithm ?? username.algorithm ?? forwarder.algorithm;
          if (selection) {
            return this.generatorService.algorithm(selection);
          } else {
            return null;
          }
        }),
        distinctUntilChanged((prev, next) => isSameAlgorithm(prev?.id, next?.id)),
        takeUntil(this.destroyed),
      )
      .subscribe((algorithm) => {
        // update subjects within the angular zone so that the
        // template bindings refresh immediately
        this.zone.run(() => {
          this.algorithm$.next(algorithm);
        });
      });

    // assume the last-selected generator algorithm is the user's preferred one
    const preferences = await this.generatorService.preferences({ singleUserId$: this.userId$ });
    this.algorithm$
      .pipe(
        filter((algorithm) => !!algorithm),
        withLatestFrom(preferences),
        takeUntil(this.destroyed),
      )
      .subscribe(([algorithm, preference]) => {
        function setPreference(category: CredentialCategory) {
          const p = preference[category];
          p.algorithm = algorithm.id;
          p.updated = new Date();
        }

        // `is*Algorithm` decides `algorithm`'s type, which flows into `setPreference`
        if (isEmailAlgorithm(algorithm.id)) {
          setPreference("email");
        } else if (isUsernameAlgorithm(algorithm.id)) {
          setPreference("username");
        } else if (isPasswordAlgorithm(algorithm.id)) {
          setPreference("password");
        } else {
          return;
        }

        preferences.next(preference);
      });

    // populate the form with the user's preferences to kick off interactivity
    preferences
      .pipe(
        map(({ email, username, password }) => {
          const forwarderPref = isForwarderIntegration(email.algorithm) ? email : null;
          const usernamePref = email.updated > username.updated ? email : username;

          // inject drilldown flags
          const forwarderNav = !forwarderPref
            ? NONE_SELECTED
            : JSON.stringify(forwarderPref.algorithm);
          const userNav = forwarderPref ? FORWARDER : JSON.stringify(usernamePref.algorithm);
          const rootNav =
            usernamePref.updated > password.updated
              ? IDENTIFIER
              : JSON.stringify(password.algorithm);

          // construct cascade metadata
          const cascade = {
            root: {
              selection: { nav: rootNav },
              active: {
                nav: rootNav,
                algorithm: rootNav === IDENTIFIER ? null : password.algorithm,
              } as CascadeValue,
            },
            username: {
              selection: { nav: userNav },
              active: {
                nav: userNav,
                algorithm: forwarderPref ? null : usernamePref.algorithm,
              },
            },
            forwarder: {
              selection: { nav: forwarderNav },
              active: {
                nav: forwarderNav,
                algorithm: forwarderPref?.algorithm,
              },
            },
          };

          return cascade;
        }),
        takeUntil(this.destroyed),
      )
      .subscribe(({ root, username, forwarder }) => {
        // update navigation; break subscription loop
        this.onRootChanged(root.selection);
        this.username.setValue(username.selection, { emitEvent: false });
        this.forwarder.setValue(forwarder.selection, { emitEvent: false });

        // update cascade visibility
        activeRoot$.next(root.active);
        activeIdentifier$.next(username.active);
        activeForwarder$.next(forwarder.active);
      });

    // automatically regenerate when the algorithm switches if the algorithm
    // allows it; otherwise set a placeholder
    this.algorithm$.pipe(takeUntil(this.destroyed)).subscribe((a) => {
      this.zone.run(() => {
        if (!a || a.onlyOnRequest) {
          this.value$.next("-");
        } else {
          this.generate("autogenerate").catch((e: unknown) => this.logService.error(e));
        }
      });
    });
  }

  private typeToGenerator$(type: CredentialAlgorithm) {
    const dependencies = {
      on$: this.generate$,
      userId$: this.userId$,
    };

    switch (type) {
      case "catchall":
        return this.generatorService.generate$(Generators.catchall, dependencies);

      case "subaddress":
        return this.generatorService.generate$(Generators.subaddress, dependencies);

      case "username":
        return this.generatorService.generate$(Generators.username, dependencies);

      case "password":
        return this.generatorService.generate$(Generators.password, dependencies);

      case "passphrase":
        return this.generatorService.generate$(Generators.passphrase, dependencies);
    }

    if (isForwarderIntegration(type)) {
      const forwarder = getForwarderConfiguration(type.forwarder);
      const configuration = toCredentialGeneratorConfiguration(forwarder);
      const generator = this.generatorService.generate$(configuration, dependencies);
      return generator;
    }

    throw new Error(`Invalid generator type: "${type}"`);
  }

  /** Lists the top-level credential types supported by the component.
   *  @remarks This is string-typed because angular doesn't support
   *  structural equality for objects, which prevents `CredentialAlgorithm`
   *  from being selectable within a dropdown when its value contains a
   *  `ForwarderIntegration`.
   */
  protected rootOptions$ = new BehaviorSubject<Option<string>[]>([]);

  /** Lists the credential types of the username algorithm box. */
  protected usernameOptions$ = new BehaviorSubject<Option<string>[]>([]);

  /** Lists the credential types of the username algorithm box. */
  protected forwarderOptions$ = new BehaviorSubject<Option<string>[]>([]);

  /** Tracks the currently selected forwarder. */
  protected forwarderId$ = new BehaviorSubject<IntegrationId>(null);

  /** Tracks forwarder control visibility */
  protected showForwarder$ = new BehaviorSubject<boolean>(false);

  /** tracks the currently selected credential type */
  protected algorithm$ = new ReplaySubject<AlgorithmInfo>(1);

  protected showAlgorithm$ = this.algorithm$.pipe(
    combineLatestWith(this.showForwarder$),
    map(([algorithm, showForwarder]) => (showForwarder ? null : algorithm)),
  );

  /**
   * Emits the copy button aria-label respective of the selected credential type
   */
  protected credentialTypeCopyLabel$ = this.algorithm$.pipe(
    filter((algorithm) => !!algorithm),
    map(({ copy }) => copy),
  );

  /**
   * Emits the generate button aria-label respective of the selected credential type
   */
  protected credentialTypeGenerateLabel$ = this.algorithm$.pipe(
    filter((algorithm) => !!algorithm),
    map(({ generate }) => generate),
  );

  /**
   * Emits the copy credential toast respective of the selected credential type
   */
  protected credentialTypeLabel$ = this.algorithm$.pipe(
    filter((algorithm) => !!algorithm),
    map(({ generatedValue }) => generatedValue),
  );

  /** Emits hint key for the currently selected credential type */
  protected credentialTypeHint$ = new ReplaySubject<string>(1);

  /** tracks the currently selected credential category */
  protected category$ = new ReplaySubject<string>(1);

  /** Emits the last generated value. */
  protected readonly value$ = new BehaviorSubject<string>("");

  /** Emits when the userId changes */
  protected readonly userId$ = new BehaviorSubject<UserId>(null);

  /** Emits when a new credential is requested */
  private readonly generate$ = new Subject<string>();

  /** Request a new value from the generator
   * @param requestor a label used to trace generation request
   *  origin in the debugger.
   */
  protected async generate(requestor: string) {
    this.generate$.next(requestor);
  }

  private toOptions(algorithms: AlgorithmInfo[]) {
    const options: Option<string>[] = algorithms.map((algorithm) => ({
      value: JSON.stringify(algorithm.id),
      label: algorithm.name,
    }));

    return options;
  }

  private readonly destroyed = new Subject<void>();
  ngOnDestroy() {
    this.destroyed.next();
    this.destroyed.complete();

    // finalize subjects
    this.generate$.complete();
    this.value$.complete();

    // finalize component bindings
    this.onGenerated.complete();
  }
}

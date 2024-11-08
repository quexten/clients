import { coerceBooleanProperty } from "@angular/cdk/coercion";
import { OnInit, Input, Output, EventEmitter, Component, OnDestroy } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import {
  BehaviorSubject,
  takeUntil,
  Subject,
  map,
  filter,
  tap,
  skip,
  ReplaySubject,
  withLatestFrom,
} from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { UserId } from "@bitwarden/common/types/guid";
import {
  Generators,
  CredentialGeneratorService,
  PasswordGenerationOptions,
} from "@bitwarden/generator-core";

import { completeOnAccountSwitch } from "./util";

const Controls = Object.freeze({
  length: "length",
  uppercase: "uppercase",
  lowercase: "lowercase",
  number: "number",
  special: "special",
  minNumber: "minNumber",
  minSpecial: "minSpecial",
  avoidAmbiguous: "avoidAmbiguous",
});

/** Options group for passwords */
@Component({
  selector: "tools-password-settings",
  templateUrl: "password-settings.component.html",
})
export class PasswordSettingsComponent implements OnInit, OnDestroy {
  /** Instantiates the component
   *  @param accountService queries user availability
   *  @param generatorService settings and policy logic
   *  @param i18nService localize hints
   *  @param formBuilder reactive form controls
   */
  constructor(
    private formBuilder: FormBuilder,
    private generatorService: CredentialGeneratorService,
    private i18nService: I18nService,
    private accountService: AccountService,
  ) {}

  /** Binds the password component to a specific user's settings.
   *  When this input is not provided, the form binds to the active
   *  user
   */
  @Input()
  userId: UserId | null;

  /** When `true`, an options header is displayed by the component. Otherwise, the header is hidden. */
  @Input()
  showHeader: boolean = true;

  /** Number of milliseconds to wait before accepting user input. */
  @Input()
  waitMs: number = 100;

  /** Removes bottom margin from `bit-section` */
  @Input({ transform: coerceBooleanProperty }) disableMargin = false;

  /** Emits settings updates and completes if the settings become unavailable.
   * @remarks this does not emit the initial settings. If you would like
   *   to receive live settings updates including the initial update,
   *   use `CredentialGeneratorService.settings$(...)` instead.
   */
  @Output()
  readonly onUpdated = new EventEmitter<PasswordGenerationOptions>();

  protected settings = this.formBuilder.group({
    [Controls.length]: [Generators.password.settings.initial.length],
    [Controls.uppercase]: [Generators.password.settings.initial.uppercase],
    [Controls.lowercase]: [Generators.password.settings.initial.lowercase],
    [Controls.number]: [Generators.password.settings.initial.number],
    [Controls.special]: [Generators.password.settings.initial.special],
    [Controls.minNumber]: [Generators.password.settings.initial.minNumber],
    [Controls.minSpecial]: [Generators.password.settings.initial.minSpecial],
    [Controls.avoidAmbiguous]: [!Generators.password.settings.initial.ambiguous],
  });

  private get numbers() {
    return this.settings.get(Controls.number);
  }

  private get special() {
    return this.settings.get(Controls.special);
  }

  private get minNumber() {
    return this.settings.get(Controls.minNumber);
  }

  private get minSpecial() {
    return this.settings.get(Controls.minSpecial);
  }

  async ngOnInit() {
    const singleUserId$ = this.singleUserId$();
    const settings = await this.generatorService.settings(Generators.password, { singleUserId$ });

    // bind settings to the UI
    settings
      .pipe(
        map((settings) => {
          // interface is "avoid" while storage is "include"
          const s: any = { ...settings };
          s.avoidAmbiguous = s.ambiguous;
          delete s.ambiguous;
          return s;
        }),
        takeUntil(this.destroyed$),
      )
      .subscribe((s) => {
        // skips reactive event emissions to break a subscription cycle
        this.settings.patchValue(s, { emitEvent: false });
      });

    // explain policy & disable policy-overridden fields
    this.generatorService
      .policy$(Generators.password, { userId$: singleUserId$ })
      .pipe(takeUntil(this.destroyed$))
      .subscribe(({ constraints }) => {
        this.policyInEffect = constraints.policyInEffect;

        const toggles = [
          [Controls.length, constraints.length.min < constraints.length.max],
          [Controls.uppercase, !constraints.uppercase?.readonly],
          [Controls.lowercase, !constraints.lowercase?.readonly],
          [Controls.number, !constraints.number?.readonly],
          [Controls.special, !constraints.special?.readonly],
          [Controls.minNumber, constraints.minNumber.min < constraints.minNumber.max],
          [Controls.minSpecial, constraints.minSpecial.min < constraints.minSpecial.max],
        ] as [keyof typeof Controls, boolean][];

        for (const [control, enabled] of toggles) {
          this.toggleEnabled(control, enabled);
        }

        const boundariesHint = this.i18nService.t(
          "generatorBoundariesHint",
          constraints.length.min?.toString(),
          constraints.length.max?.toString(),
        );
        this.lengthBoundariesHint.next(boundariesHint);
      });

    // cascade selections between checkboxes and spinboxes
    // before the group saves their values
    let lastMinNumber = 1;
    this.numbers.valueChanges
      .pipe(
        filter((checked) => !(checked && this.minNumber.value > 0)),
        map((checked) => (checked ? lastMinNumber : 0)),
        takeUntil(this.destroyed$),
      )
      .subscribe((value) => this.minNumber.setValue(value, { emitEvent: false }));

    this.minNumber.valueChanges
      .pipe(
        map((value) => [value, value > 0] as const),
        tap(([value]) => (lastMinNumber = this.numbers.value ? value : lastMinNumber)),
        takeUntil(this.destroyed$),
      )
      .subscribe(([, checked]) => this.numbers.setValue(checked, { emitEvent: false }));

    let lastMinSpecial = 1;
    this.special.valueChanges
      .pipe(
        filter((checked) => !(checked && this.minSpecial.value > 0)),
        map((checked) => (checked ? lastMinSpecial : 0)),
        takeUntil(this.destroyed$),
      )
      .subscribe((value) => this.minSpecial.setValue(value, { emitEvent: false }));

    this.minSpecial.valueChanges
      .pipe(
        map((value) => [value, value > 0] as const),
        tap(([value]) => (lastMinSpecial = this.special.value ? value : lastMinSpecial)),
        takeUntil(this.destroyed$),
      )
      .subscribe(([, checked]) => this.special.setValue(checked, { emitEvent: false }));

    // `onUpdated` depends on `settings` because the UserStateSubject is asynchronous;
    // subscribing directly to `this.settings.valueChanges` introduces a race condition.
    // skip the first emission because it's the initial value, not an update.
    settings.pipe(skip(1), takeUntil(this.destroyed$)).subscribe(this.onUpdated);

    // now that outputs are set up, connect inputs
    this.saveSettings
      .pipe(
        withLatestFrom(this.settings.valueChanges),
        map(([, settings]) => {
          // interface is "avoid" while storage is "include"
          const s: any = { ...settings };
          s.ambiguous = s.avoidAmbiguous;
          delete s.avoidAmbiguous;
          return s;
        }),
        takeUntil(this.destroyed$),
      )
      .subscribe(settings);
  }

  private saveSettings = new Subject<string>();
  save(site: string = "component api call") {
    this.saveSettings.next(site);
  }

  /** display binding for enterprise policy notice */
  protected policyInEffect: boolean;

  private lengthBoundariesHint = new ReplaySubject<string>(1);

  /** display binding for min/max constraints of `length` */
  protected lengthBoundariesHint$ = this.lengthBoundariesHint.asObservable();

  private toggleEnabled(setting: keyof typeof Controls, enabled: boolean) {
    if (enabled) {
      this.settings.get(setting).enable({ emitEvent: false });
    } else {
      this.settings.get(setting).disable({ emitEvent: false });
    }
  }

  private singleUserId$() {
    // FIXME: this branch should probably scan for the user and make sure
    // the account is unlocked
    if (this.userId) {
      return new BehaviorSubject(this.userId as UserId).asObservable();
    }

    return this.accountService.activeAccount$.pipe(
      completeOnAccountSwitch(),
      takeUntil(this.destroyed$),
    );
  }

  private readonly destroyed$ = new Subject<void>();
  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}

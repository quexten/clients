import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";

import { VaultTimeoutSettingsService } from "@bitwarden/common/abstractions/vault-timeout/vault-timeout-settings.service";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { VaultTimeoutStringType } from "@bitwarden/common/types/vault-timeout.type";

import { VaultTimeoutInputComponent } from "./vault-timeout-input.component";

describe("VaultTimeoutInputComponent", () => {
  let component: VaultTimeoutInputComponent;
  let fixture: ComponentFixture<VaultTimeoutInputComponent>;
  const get$ = jest.fn().mockReturnValue(new BehaviorSubject({}));
  const availableVaultTimeoutActions$ = jest.fn().mockReturnValue(new BehaviorSubject([]));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VaultTimeoutInputComponent],
      providers: [
        { provide: PolicyService, useValue: { get$ } },
        { provide: VaultTimeoutSettingsService, useValue: { availableVaultTimeoutActions$ } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VaultTimeoutInputComponent);
    component = fixture.componentInstance;
    component.vaultTimeoutOptions = [
      { name: "oneMinute", value: 1 },
      { name: "fiveMinutes", value: 5 },
      { name: "fifteenMinutes", value: 15 },
      { name: "thirtyMinutes", value: 30 },
      { name: "oneHour", value: 60 },
      { name: "fourHours", value: 240 },
      { name: "onRefresh", value: VaultTimeoutStringType.OnRestart },
    ];
    fixture.detectChanges();
  });

  describe("form", () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it("invokes the onChange associated with `ControlValueAccessor`", () => {
      const onChange = jest.fn();
      component.registerOnChange(onChange);

      component.form.controls.vaultTimeout.setValue(VaultTimeoutStringType.OnRestart);

      expect(onChange).toHaveBeenCalledWith(VaultTimeoutStringType.OnRestart);
    });

    it("updates custom value to match preset option", () => {
      // 1 hour
      component.form.controls.vaultTimeout.setValue(60);

      expect(component.form.value.custom).toEqual({ hours: 1, minutes: 0 });

      // 17 minutes
      component.form.controls.vaultTimeout.setValue(17);

      expect(component.form.value.custom).toEqual({ hours: 0, minutes: 17 });

      // 2.25 hours
      component.form.controls.vaultTimeout.setValue(135);

      expect(component.form.value.custom).toEqual({ hours: 2, minutes: 15 });
    });

    it("sets custom timeout to 0 when a preset string option is selected", () => {
      // Set custom value to random values
      component.form.controls.custom.setValue({ hours: 1, minutes: 1 });

      component.form.controls.vaultTimeout.setValue(VaultTimeoutStringType.OnLocked);

      expect(component.form.value.custom).toEqual({ hours: 0, minutes: 0 });
    });
  });
});

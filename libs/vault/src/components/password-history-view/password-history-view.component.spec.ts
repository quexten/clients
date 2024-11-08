import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { BehaviorSubject } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { WINDOW } from "@bitwarden/angular/services/injection-tokens";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { ColorPasswordModule, ItemModule, ToastService } from "@bitwarden/components";
import { ColorPasswordComponent } from "@bitwarden/components/src/color-password/color-password.component";

import { PasswordHistoryViewComponent } from "./password-history-view.component";

describe("PasswordHistoryViewComponent", () => {
  let component: PasswordHistoryViewComponent;
  let fixture: ComponentFixture<PasswordHistoryViewComponent>;

  const mockCipher = {
    id: "122-333-444",
    type: CipherType.Login,
    organizationId: "222-444-555",
  } as CipherView;

  const copyToClipboard = jest.fn();
  const showToast = jest.fn();
  const activeAccount$ = new BehaviorSubject<{ id: string }>({ id: "666-444-444" });
  const mockCipherService = {
    get: jest.fn().mockResolvedValue({ decrypt: jest.fn().mockResolvedValue(mockCipher) }),
    getKeyForCipherKeyDecryption: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    mockCipherService.get.mockClear();
    mockCipherService.getKeyForCipherKeyDecryption.mockClear();
    copyToClipboard.mockClear();
    showToast.mockClear();

    await TestBed.configureTestingModule({
      imports: [ItemModule, ColorPasswordModule, JslibModule],
      providers: [
        { provide: WINDOW, useValue: window },
        { provide: CipherService, useValue: mockCipherService },
        { provide: PlatformUtilsService, useValue: { copyToClipboard } },
        { provide: AccountService, useValue: { activeAccount$ } },
        { provide: ToastService, useValue: { showToast } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PasswordHistoryViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("renders no history text when history does not exist", () => {
    expect(fixture.debugElement.nativeElement.textContent).toBe("noPasswordsInList");
  });

  describe("history", () => {
    const password1 = { password: "bad-password-1", lastUsedDate: new Date("09/13/2004") };
    const password2 = { password: "bad-password-2", lastUsedDate: new Date("02/01/2004") };

    beforeEach(async () => {
      mockCipher.passwordHistory = [password1, password2];

      mockCipherService.get.mockResolvedValue({ decrypt: jest.fn().mockResolvedValue(mockCipher) });
      await component.ngOnInit();
      fixture.detectChanges();
    });

    it("renders all passwords", () => {
      const passwords = fixture.debugElement.queryAll(By.directive(ColorPasswordComponent));

      expect(passwords.map((password) => password.componentInstance.password)).toEqual([
        "bad-password-1",
        "bad-password-2",
      ]);
    });

    it("copies a password", () => {
      const copyButton = fixture.debugElement.query(By.css("button"));

      copyButton.nativeElement.click();

      expect(copyToClipboard).toHaveBeenCalledWith("bad-password-1", { window: window });
      expect(showToast).toHaveBeenCalledWith({
        message: "passwordCopied",
        title: "",
        variant: "info",
      });
    });
  });
});

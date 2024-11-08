import { ComponentFixture, fakeAsync, flush, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { mock } from "jest-mock-extended";
import { Subject } from "rxjs";

import { EventCollectionService } from "@bitwarden/common/abstractions/event/event-collection.service";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { EventType } from "@bitwarden/common/enums";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { FakeAccountService, mockAccountServiceWith } from "@bitwarden/common/spec";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherAuthorizationService } from "@bitwarden/common/vault/services/cipher-authorization.service";

import { PopupRouterCacheService } from "../../../../../platform/popup/view-cache/popup-router-cache.service";

import { VaultPopupAutofillService } from "./../../../services/vault-popup-autofill.service";
import { ViewV2Component } from "./view-v2.component";

// 'qrcode-parser' is used by `BrowserTotpCaptureService` but is an es6 module that jest can't compile.
// Mock the entire module here to prevent jest from throwing an error. I wasn't able to find a way to mock the
// `BrowserTotpCaptureService` where jest would not load the file in the first place.
jest.mock("qrcode-parser", () => {});

describe("ViewV2Component", () => {
  let component: ViewV2Component;
  let fixture: ComponentFixture<ViewV2Component>;
  const params$ = new Subject();
  const mockNavigate = jest.fn();
  const collect = jest.fn().mockResolvedValue(null);

  const mockCipher = {
    id: "122-333-444",
    type: CipherType.Login,
    orgId: "222-444-555",
  };

  const mockVaultPopupAutofillService = {
    doAutofill: jest.fn(),
  };
  const mockUserId = Utils.newGuid() as UserId;
  const accountService: FakeAccountService = mockAccountServiceWith(mockUserId);

  const mockCipherService = {
    get: jest.fn().mockResolvedValue({ decrypt: jest.fn().mockResolvedValue(mockCipher) }),
    getKeyForCipherKeyDecryption: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    mockNavigate.mockClear();
    collect.mockClear();

    await TestBed.configureTestingModule({
      imports: [ViewV2Component],
      providers: [
        { provide: Router, useValue: { navigate: mockNavigate } },
        { provide: CipherService, useValue: mockCipherService },
        { provide: LogService, useValue: mock<LogService>() },
        { provide: PlatformUtilsService, useValue: mock<PlatformUtilsService>() },
        { provide: ConfigService, useValue: mock<ConfigService>() },
        { provide: PopupRouterCacheService, useValue: mock<PopupRouterCacheService>() },
        { provide: ActivatedRoute, useValue: { queryParams: params$ } },
        { provide: EventCollectionService, useValue: { collect } },
        {
          provide: I18nService,
          useValue: {
            t: (key: string, ...rest: string[]) => {
              if (rest?.length) {
                return `${key} ${rest.join(" ")}`;
              }
              return key;
            },
          },
        },
        { provide: VaultPopupAutofillService, useValue: mockVaultPopupAutofillService },
        {
          provide: AccountService,
          useValue: accountService,
        },
        {
          provide: CipherAuthorizationService,
          useValue: {
            canDeleteCipher$: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ViewV2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe("queryParams", () => {
    it("loads an existing cipher", fakeAsync(() => {
      params$.next({ cipherId: "122-333-444" });

      flush(); // Resolve all promises

      expect(mockCipherService.get).toHaveBeenCalledWith("122-333-444");
      expect(component.cipher).toEqual(mockCipher);
    }));

    it("sets the correct header text", fakeAsync(() => {
      // Set header text for a login
      mockCipher.type = CipherType.Login;
      params$.next({ cipherId: mockCipher.id });
      flush(); // Resolve all promises

      expect(component.headerText).toEqual("viewItemHeader typelogin");

      // Set header text for a card
      mockCipher.type = CipherType.Card;
      params$.next({ cipherId: mockCipher.id });
      flush(); // Resolve all promises

      expect(component.headerText).toEqual("viewItemHeader typecard");

      // Set header text for an identity
      mockCipher.type = CipherType.Identity;
      params$.next({ cipherId: mockCipher.id });
      flush(); // Resolve all promises

      expect(component.headerText).toEqual("viewItemHeader typeidentity");

      // Set header text for a secure note
      mockCipher.type = CipherType.SecureNote;
      params$.next({ cipherId: mockCipher.id });
      flush(); // Resolve all promises

      expect(component.headerText).toEqual("viewItemHeader note");
    }));

    it("sends viewed event", fakeAsync(() => {
      params$.next({ cipherId: "122-333-444" });

      flush(); // Resolve all promises

      expect(collect).toHaveBeenCalledWith(
        EventType.Cipher_ClientViewed,
        mockCipher.id,
        false,
        undefined,
      );
    }));
  });
});

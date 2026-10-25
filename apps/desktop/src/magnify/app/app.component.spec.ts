import { ComponentFixture, TestBed } from "@angular/core/testing";

import { MagnifyAuthStatus } from "../../autofill/models/magnify-commands";
import { MiniUnlockResult, MiniUnlockStrings } from "../../autofill/models/mini-unlock";
import { MiniUnlockClient } from "../../mini-unlock/mini-unlock-client";
import { CommandService } from "../services/command-service";

import { AppComponent } from "./app.component";

const strings = new Proxy({} as MiniUnlockStrings, {
  get: (_target, key) => String(key),
});

describe("AppComponent", () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;

  const mockCommandService = {
    getAuthStatus: jest.fn(),
    getUnlockState: jest.fn(),
    unlock: jest.fn(),
    resize: jest.fn(),
    focusBitwarden: jest.fn(),
  };

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCommandService.getAuthStatus.mockResolvedValue(MagnifyAuthStatus.Unlocked);
    mockCommandService.getUnlockState.mockResolvedValue({
      options: { masterPassword: true, pin: false, biometrics: false },
      strings,
    });

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: MiniUnlockClient, useValue: mockCommandService }],
    })
      .overrideComponent(AppComponent, {
        set: {
          providers: [{ provide: CommandService, useValue: mockCommandService }],
        },
      })
      .compileComponents();
  });

  it("creates the component", async () => {
    await render();
    expect(component).toBeTruthy();
  });

  it("renders search-bar when unlocked", async () => {
    const el = await render();
    expect(el.querySelector("search-bar")).toBeTruthy();
  });

  it("renders the mini unlock when locked", async () => {
    mockCommandService.getAuthStatus.mockResolvedValue(MagnifyAuthStatus.Locked);

    const el = await render();

    expect(el.querySelector("mini-unlock")).toBeTruthy();
    expect(el.querySelector("vault-auth-status")).toBeNull();
  });

  it("switches to search-bar after unlocking", async () => {
    mockCommandService.getAuthStatus.mockResolvedValue(MagnifyAuthStatus.Locked);
    mockCommandService.unlock.mockImplementation(async () => {
      mockCommandService.getAuthStatus.mockResolvedValue(MagnifyAuthStatus.Unlocked);
      return MiniUnlockResult.Success;
    });
    const el = await render();

    el.querySelector<HTMLInputElement>("#miniUnlock_input_masterPassword")!.value = "hunter2";
    el.querySelector<HTMLButtonElement>("#miniUnlock_button_submit")!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockCommandService.unlock).toHaveBeenCalledWith("masterPassword", "hunter2");
    expect(el.querySelector("search-bar")).toBeTruthy();
  });

  it("falls back to vault-auth-status when there is no unlock state", async () => {
    mockCommandService.getAuthStatus.mockResolvedValue(MagnifyAuthStatus.Locked);
    mockCommandService.getUnlockState.mockResolvedValue(null);

    const el = await render();

    expect(el.querySelector("vault-auth-status")).toBeTruthy();
  });

  it("renders vault-auth-status when logged out", async () => {
    mockCommandService.getAuthStatus.mockResolvedValue(MagnifyAuthStatus.LoggedOut);

    const el = await render();

    expect(el.querySelector("vault-auth-status")).toBeTruthy();
    expect(mockCommandService.getUnlockState).not.toHaveBeenCalled();
  });

  it("defaults to locked state when getAuthStatus rejects", async () => {
    mockCommandService.getAuthStatus.mockRejectedValue(new Error("IPC failed"));

    const el = await render();

    expect(el.querySelector("mini-unlock")).toBeTruthy();
  });
});

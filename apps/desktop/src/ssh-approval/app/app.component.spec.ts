import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
  MiniUnlockResult,
  SshApprovalMode,
  SshApprovalState,
  SshApprovalStrings,
} from "../../autofill/models/ssh-approval";
import { ApprovalIpcService } from "../services/approval-ipc.service";

import { AppComponent } from "./app.component";

const strings = new Proxy({} as SshApprovalStrings, {
  get: (_target, key) => String(key),
});

const unlockState: SshApprovalState = {
  mode: SshApprovalMode.Unlock,
  request: null,
  unlockOptions: { masterPassword: true, pin: true, biometrics: false },
  strings,
};

const approveState: SshApprovalState = {
  mode: SshApprovalMode.Approve,
  request: { cipherName: "My Key", application: "ssh", isAgentForwarding: true, namespace: "" },
  unlockOptions: null,
  strings,
};

describe("AppComponent", () => {
  let fixture: ComponentFixture<AppComponent>;
  let stateChanged: (state: SshApprovalState) => void;

  const ipc = {
    getState: jest.fn(),
    onStateChanged: jest.fn((fn: (state: SshApprovalState) => void) => (stateChanged = fn)),
    unlock: jest.fn(),
    respond: jest.fn().mockResolvedValue(undefined),
    resize: jest.fn(),
  };

  async function render(state: SshApprovalState | null): Promise<HTMLElement> {
    ipc.getState.mockResolvedValue(state);
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: ApprovalIpcService, useValue: ipc }],
    }).compileComponents();
  });

  it("shows the mini unlock with tabs for each available method", async () => {
    const el = await render(unlockState);

    expect(el.querySelector("mini-unlock")).toBeTruthy();
    expect(el.querySelector("#miniUnlock_tab_pin")).toBeTruthy();
    expect(el.querySelector("#miniUnlock_tab_masterPassword")).toBeTruthy();
    expect(el.querySelector("#miniUnlock_tab_biometrics")).toBeNull();
  });

  it("submits the PIN and shows an error when it is wrong", async () => {
    ipc.unlock.mockResolvedValue(MiniUnlockResult.Invalid);
    const el = await render(unlockState);

    const input = el.querySelector<HTMLInputElement>("#miniUnlock_input_pin")!;
    input.value = "1234";
    el.querySelector<HTMLButtonElement>("#miniUnlock_button_submit")!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(ipc.unlock).toHaveBeenCalledWith("pin", "1234");
    expect(el.querySelector("#miniUnlock_text_error")?.textContent).toContain("invalidPin");
  });

  it("switches to the approval view when main pushes a new state", async () => {
    const el = await render(unlockState);

    stateChanged(approveState);
    fixture.detectChanges();

    expect(el.querySelector("mini-unlock")).toBeNull();
    expect(el.querySelector("#approveRequest_callout_forwarding")).toBeTruthy();
    expect(el.textContent).toContain("My Key");
  });

  it("sends the user's decision", async () => {
    const el = await render(approveState);

    el.querySelector<HTMLButtonElement>("#approveRequest_button_authorize")!.click();

    expect(ipc.respond).toHaveBeenCalledWith(true);
  });

  it("renders nothing without state", async () => {
    const el = await render(null);

    expect(el.querySelector("mini-unlock")).toBeNull();
    expect(el.querySelector("approve-request")).toBeNull();
  });
});

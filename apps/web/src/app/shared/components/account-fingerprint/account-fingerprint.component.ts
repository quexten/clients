import { Component, Input, OnInit } from "@angular/core";

import { KeyService } from "@bitwarden/key-management";

import { SharedModule } from "../../shared.module";

@Component({
  selector: "app-account-fingerprint",
  templateUrl: "account-fingerprint.component.html",
  standalone: true,
  imports: [SharedModule],
})
export class AccountFingerprintComponent implements OnInit {
  @Input() fingerprintMaterial: string;
  @Input() publicKeyBuffer: Uint8Array;
  @Input() fingerprintLabel: string;

  protected fingerprint: string;

  constructor(private keyService: KeyService) {}

  async ngOnInit() {
    // TODO - In the future, remove this code and use the fingerprint pipe once merged
    const generatedFingerprint = await this.keyService.getFingerprint(
      this.fingerprintMaterial,
      this.publicKeyBuffer,
    );
    this.fingerprint = generatedFingerprint?.join("-") ?? null;
  }
}

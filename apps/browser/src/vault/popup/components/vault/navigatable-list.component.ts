import { FocusKeyManager } from "@angular/cdk/a11y";
import { Component, ContentChildren, HostListener, QueryList } from "@angular/core";

import { CipherRowComponent } from "../cipher-row.component";

@Component({
  selector: "navigatable-list",
  host: { role: "list" },
  templateUrl: "navigatable-list.component.html",
})
export class NavigatableListComponent {
  private keyManager: FocusKeyManager<CipherRowComponent>;

  @ContentChildren(CipherRowComponent) items: QueryList<CipherRowComponent>;

  ngAfterContentInit() {
    this.keyManager = new FocusKeyManager(this.items);
  }

  @HostListener("keydown", ["$event"])
  onKeydown(event: KeyboardEvent) {
    this.keyManager.onKeydown(event);
  }

  focusTop() {
    this.keyManager.setFirstItemActive();
  }
}

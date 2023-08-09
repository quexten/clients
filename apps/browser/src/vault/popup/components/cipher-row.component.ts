import { Component, ElementRef, EventEmitter, Input, Output } from "@angular/core";

import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";

@Component({
  selector: "app-cipher-row",
  templateUrl: "cipher-row.component.html",
})
export class CipherRowComponent {
  @Output() onSelected = new EventEmitter<CipherView>();
  @Output() launchEvent = new EventEmitter<CipherView>();
  @Output() onView = new EventEmitter<CipherView>();
  @Input() cipher: CipherView;
  @Input() last: boolean;
  @Input() showView = false;
  @Input() title: string;

  constructor(private element: ElementRef) {}

  selectCipher(c: CipherView) {
    this.onSelected.emit(c);
  }

  launchCipher(c: CipherView) {
    this.launchEvent.emit(c);
  }

  viewCipher(c: CipherView) {
    this.onView.emit(c);
  }

  focus() {
    this.getFocusableElement(this.element.nativeElement)?.focus();
  }

  private getFocusableElement(el: Element): HTMLElement {
    if (this.isFocusableElement(el)) {return el as HTMLElement;}

    for (let i = 0; i < el.children.length; i++) {
      const focusable = this.getFocusableElement(el.children[i]);
      if (focusable) {
        return focusable;
      }
    }

    return null;
  }

  private isFocusableElement(el: Element): boolean {
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLAnchorElement ||
      el instanceof HTMLButtonElement
    );
  }
}

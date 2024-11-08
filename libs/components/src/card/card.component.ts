import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component } from "@angular/core";

@Component({
  selector: "bit-card",
  standalone: true,
  imports: [CommonModule],
  template: `<ng-content></ng-content>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "tw-box-border tw-block tw-bg-background tw-text-main tw-border-solid tw-border-b tw-border-0 tw-border-b-secondary-300 [&:not(bit-layout_*)]:tw-rounded-lg tw-py-4 tw-px-3",
  },
})
export class CardComponent {}

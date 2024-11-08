import {
  AfterContentChecked,
  Component,
  ContentChild,
  Input,
  OnDestroy,
  TemplateRef,
  Directive,
  NgZone,
  AfterViewInit,
  ElementRef,
  TrackByFunction,
} from "@angular/core";

import { TableComponent } from "./table.component";

/**
 * Helper directive for defining the row template.
 *
 * ```html
 * <ng-template bitRowDef let-row>
 *   <td bitCell>{{ row.id }}</td>
 * </ng-template>
 * ```
 */
@Directive({
  selector: "[bitRowDef]",
  standalone: true,
})
export class BitRowDef {
  constructor(public template: TemplateRef<any>) {}
}

/**
 * Scrollable table component.
 *
 * Utilizes virtual scrolling to render large datasets.
 */
@Component({
  selector: "bit-table-scroll",
  templateUrl: "./table-scroll.component.html",
  providers: [{ provide: TableComponent, useExisting: TableScrollComponent }],
})
export class TableScrollComponent
  extends TableComponent
  implements AfterContentChecked, AfterViewInit, OnDestroy
{
  /** The size of the rows in the list (in pixels). */
  @Input({ required: true }) rowSize: number;

  /** Optional trackBy function. */
  @Input() trackBy: TrackByFunction<any> | undefined;

  @ContentChild(BitRowDef) protected rowDef: BitRowDef;

  /**
   * Height of the thead element (in pixels).
   *
   * Used to increase the table's total height to avoid items being cut off.
   */
  protected headerHeight = 0;

  /**
   * Observer for table header, applies padding on resize.
   */
  private headerObserver: ResizeObserver;

  constructor(
    private zone: NgZone,
    private el: ElementRef,
  ) {
    super();
  }

  ngAfterViewInit(): void {
    this.headerObserver = new ResizeObserver((entries) => {
      this.zone.run(() => {
        this.headerHeight = entries[0].contentRect.height;
      });
    });

    this.headerObserver.observe(this.el.nativeElement.querySelector("thead"));
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();

    if (this.headerObserver) {
      this.headerObserver.disconnect();
    }
  }
}

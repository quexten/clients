import { NgIf } from "@angular/common";
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  signal,
} from "@angular/core";

import { MAGNIFY_ACTIONS } from "../../../../autofill/models/magnify-actions";
import {
  isMagnifyCardItem,
  isMagnifyLoginItem,
  MagnifySearchResultItem,
} from "../../../../autofill/models/magnify-commands";
import { CommandService } from "../../../services/command-service";
import { SEARCH_BAR_HEIGHT, calculateWindowHeight } from "../../utils/magnify-layout";
import { ActionBarComponent } from "../action-bar/action-bar.component";
import { ResultsListComponent } from "../results-list/results-list.component";

@Component({
  selector: "search-bar",
  standalone: true,
  imports: [ResultsListComponent, ActionBarComponent, NgIf],
  templateUrl: "./search-bar.component.html",
  styleUrl: "./search-bar.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchBarComponent implements AfterViewInit, OnDestroy {
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @ViewChild("searchInput") searchInput!: ElementRef<HTMLInputElement>;

  readonly results = signal<MagnifySearchResultItem[]>([]);
  readonly selectedIndex = signal<number>(0);
  readonly hasSearched = signal<boolean>(false);

  /** Set while an action is completing — drives the green flash in the results list. */
  readonly completingAction = signal<{ actionId: string; itemIndex: number } | null>(null);

  /** The last height sent to the main process — used to skip redundant IPC resize calls. */
  private readonly lastSentHeight = signal<number>(SEARCH_BAR_HEIGHT);

  /** Unsubscribes from the main process's relayed ⌘C/⌘X shortcuts. */
  private readonly unsubscribeShortcut: () => void;

  readonly activeActions = computed(() => {
    const item = this.results()[this.selectedIndex()];
    if (!item) {
      return [];
    }
    return MAGNIFY_ACTIONS.filter(
      (action) =>
        (action.magnifyItemType === null || action.magnifyItemType === item.itemType) &&
        !(action.requiresTotp && !(isMagnifyLoginItem(item) && item.hasTotp)),
    );
  });

  private readonly copyAndDismiss = <T extends MagnifySearchResultItem>(
    guard: (item: MagnifySearchResultItem) => item is T,
    copyFn: (item: T) => Promise<string>,
  ): void => {
    const item = this.results()[this.selectedIndex()];
    if (item && guard(item)) {
      void copyFn(item).then(async (value) => {
        if (!value) {
          return;
        }
        await navigator.clipboard.writeText(value);
        this.commandService.dismiss();
      });
    }
  };

  private readonly actionHandlers = new Map<string, () => void>([
    [
      "magnifyLoginItem-copyPassword",
      () =>
        this.copyAndDismiss(isMagnifyLoginItem, (item) => this.commandService.copyPassword(item)),
    ],
    [
      "magnifyLoginItem-copyUsername",
      () => {
        const item = this.results()[this.selectedIndex()];
        if (item && isMagnifyLoginItem(item) && item.username) {
          void navigator.clipboard
            .writeText(item.username)
            .then(() => this.commandService.dismiss());
        }
      },
    ],
    [
      "magnifyLoginItem-copyTotp",
      () => this.copyAndDismiss(isMagnifyLoginItem, (item) => this.commandService.copyTotp(item)),
    ],
    [
      "magnifyCardItem-copyCardNumber",
      () =>
        this.copyAndDismiss(isMagnifyCardItem, (item) => this.commandService.copyCardNumber(item)),
    ],
    [
      "magnifyCardItem-copyCardCode",
      () =>
        this.copyAndDismiss(isMagnifyCardItem, (item) => this.commandService.copyCardCode(item)),
    ],
    [
      "magnifyCardItem-copyCardExpiration",
      () =>
        this.copyAndDismiss(isMagnifyCardItem, (item) =>
          this.commandService.copyCardExpiration(item),
        ),
    ],
  ]);

  constructor(private readonly commandService: CommandService) {
    // The main process relays ⌘C/⌘X here because those collide with the application menu's copy/cut
    // roles; dispatch them through the same path as the renderer's own keydown handling.
    this.unsubscribeShortcut = this.commandService.onShortcut((shortcut) => {
      this.dispatchAction(shortcut);
    });
  }

  ngOnDestroy(): void {
    this.unsubscribeShortcut();
  }

  ngAfterViewInit() {
    this.searchInput.nativeElement.focus();
    const savedQuery = localStorage.getItem("magnify.lastQuery");
    if (savedQuery) {
      this.searchInput.nativeElement.value = savedQuery;
      this.searchInput.nativeElement.select();
      void this.onInput();
    }
  }

  async onInput(): Promise<void> {
    const query = this.searchInput.nativeElement.value;

    if (!query.trim()) {
      localStorage.removeItem("magnify.lastQuery");
      this.results.set([]);
      this.selectedIndex.set(0);
      this.hasSearched.set(false);
      this.resizeIfNeeded(calculateWindowHeight(0, false));
      return;
    }

    localStorage.setItem("magnify.lastQuery", query);
    this.hasSearched.set(true);
    const results = await this.commandService.searchVault(query);
    this.results.set(results);
    this.selectedIndex.set(0);
    this.resizeIfNeeded(calculateWindowHeight(results.length, true));
  }

  /** Only sends a resize IPC call when the required height has actually changed. */
  private resizeIfNeeded(height: number): void {
    if (height === this.lastSentHeight()) {
      return;
    }
    this.lastSentHeight.set(height);
    this.commandService.resize(height);
  }

  onKeydown(event: KeyboardEvent): void {
    // Navigation is handled directly — it is pure UI with no command dispatch.
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (this.results().length === 0) {
        return;
      }
      this.selectedIndex.set(Math.min(this.selectedIndex() + 1, this.results().length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (this.results().length === 0) {
        return;
      }
      this.selectedIndex.set(Math.max(this.selectedIndex() - 1, 0));
      return;
    }

    // All other actions are driven by MAGNIFY_ACTIONS shortcuts.
    this.dispatchAction(this.combinationFromKeyboardEvent(event));
  }

  /**
   * Dispatches the Magnify action whose shortcut matches the given combination, taking the
   * currently selected item's type (and TOTP availability) into account.
   */
  private dispatchAction(combination: string[]): void {
    const selectedItem = this.results()[this.selectedIndex()];
    const selectedItemType = selectedItem?.itemType ?? null;
    for (const action of MAGNIFY_ACTIONS) {
      if (!action.shortcuts) {
        continue;
      }
      if (action.magnifyItemType !== null && action.magnifyItemType !== selectedItemType) {
        continue;
      }
      if (
        action.requiresTotp &&
        !(selectedItem != null && isMagnifyLoginItem(selectedItem) && selectedItem.hasTotp)
      ) {
        continue;
      }
      for (const actionCombination of action.shortcuts) {
        if (this.combinationsMatch(combination, actionCombination)) {
          this.actionHandlers.get(action.id)?.();
          return;
        }
      }
    }
  }

  onItemSelected(item: MagnifySearchResultItem): void {
    if (isMagnifyLoginItem(item)) {
      void this.commandService.copyPassword(item).then(async (password) => {
        if (password) {
          await navigator.clipboard.writeText(password);
          this.commandService.dismiss();
        }
      });
    }
  }

  onItemHovered(index: number): void {
    this.selectedIndex.set(index);
  }

  /**
   * Reduces a KeyboardEvent to a canonical shortcut combination of modifier + primary-key strings,
   * matching the shape of MAGNIFY_ACTIONS[].shortcuts. The primary key follows the logical key
   * (event.key) so shortcuts match the user's keyboard layout; Option-composed keys (⌥⌘T) fall back
   * to the physical key (event.code).
   */
  private combinationFromKeyboardEvent(event: KeyboardEvent): string[] {
    const combination: string[] = [];
    if (event.metaKey || event.ctrlKey) {
      combination.push("CommandOrControl");
    }
    if (event.shiftKey) {
      combination.push("Shift");
    }
    if (event.altKey) {
      combination.push("Alt");
    }
    combination.push(
      /^[A-Za-z]$/.test(event.key)
        ? event.key.toUpperCase()
        : /^Key[A-Z]$/.test(event.code)
          ? event.code.slice(3)
          : event.key,
    );
    return combination;
  }

  /** True when both combinations hold the same modifier + primary-key set (order-independent). */
  private combinationsMatch(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((key) => b.includes(key));
  }
}

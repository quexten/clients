import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { CalloutModule, NoItemsModule } from "@bitwarden/components";
import { VaultIcons } from "@bitwarden/vault";

import { PopOutComponent } from "../../../platform/popup/components/pop-out.component";
import { PopupHeaderComponent } from "../../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../../platform/popup/layout/popup-page.component";
import { VaultListItemsContainerComponent } from "../components/vault-v2/vault-list-items-container/vault-list-items-container.component";
import { VaultPopupItemsService } from "../services/vault-popup-items.service";

import { TrashListItemsContainerComponent } from "./trash-list-items-container/trash-list-items-container.component";

@Component({
  templateUrl: "trash.component.html",
  standalone: true,
  imports: [
    CommonModule,
    JslibModule,
    PopupPageComponent,
    PopupHeaderComponent,
    PopOutComponent,
    VaultListItemsContainerComponent,
    TrashListItemsContainerComponent,
    CalloutModule,
    NoItemsModule,
  ],
})
export class TrashComponent {
  protected deletedCiphers$ = this.vaultPopupItemsService.deletedCiphers$;

  protected emptyTrashIcon = VaultIcons.EmptyTrash;

  constructor(private vaultPopupItemsService: VaultPopupItemsService) {}
}

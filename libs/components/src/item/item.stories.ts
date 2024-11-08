import { ScrollingModule } from "@angular/cdk/scrolling";
import { CommonModule } from "@angular/common";
import { RouterTestingModule } from "@angular/router/testing";
import { Meta, StoryObj, componentWrapperDecorator, moduleMetadata } from "@storybook/angular";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";

import { A11yGridDirective } from "../a11y/a11y-grid.directive";
import { AvatarModule } from "../avatar";
import { BadgeModule } from "../badge";
import { IconButtonModule } from "../icon-button";
import { LayoutComponent } from "../layout";
import { TypographyModule } from "../typography";
import { I18nMockService } from "../utils/i18n-mock.service";

import { ItemActionComponent } from "./item-action.component";
import { ItemContentComponent } from "./item-content.component";
import { ItemGroupComponent } from "./item-group.component";
import { ItemComponent } from "./item.component";

export default {
  title: "Component Library/Item",
  component: ItemComponent,
  decorators: [
    moduleMetadata({
      imports: [
        CommonModule,
        ItemGroupComponent,
        AvatarModule,
        IconButtonModule,
        BadgeModule,
        TypographyModule,
        ItemActionComponent,
        ItemContentComponent,
        A11yGridDirective,
        ScrollingModule,
        LayoutComponent,
        RouterTestingModule,
      ],
      providers: [
        {
          provide: I18nService,
          useFactory: () => {
            return new I18nMockService({
              toggleSideNavigation: "Toggle side navigation",
              skipToContent: "Skip to content",
              submenu: "submenu",
              toggleCollapse: "toggle collapse",
            });
          },
        },
      ],
    }),
    componentWrapperDecorator((story) => `<div class="tw-bg-background-alt tw-p-2">${story}</div>`),
  ],
} as Meta;

type Story = StoryObj<ItemGroupComponent>;

export const Default: Story = {
  render: (args) => ({
    props: args,
    template: /*html*/ `
      <bit-item>
        <button bit-item-content>
          <i slot="start" class="bwi bwi-globe tw-text-3xl tw-text-muted" aria-hidden="true"></i>
          Foo
          <span slot="secondary">Bar</span>
        </button>

        <ng-container slot="end">
          <bit-item-action>
            <button type="button" bitBadge variant="primary">Auto-fill</button>
          </bit-item-action>
          <bit-item-action>
            <button type="button" bitIconButton="bwi-clone"></button>
          </bit-item-action>
          <bit-item-action>
            <button type="button" bitIconButton="bwi-ellipsis-v"></button>
          </bit-item-action>
        </ng-container>
      </bit-item>
    `,
  }),
};

export const ContentSlots: Story = {
  render: (args) => ({
    props: args,
    template: /*html*/ `
      <bit-item>
        <button bit-item-content type="button">
          <bit-avatar
            slot="start"
            [text]="'Foo'"
          ></bit-avatar>
          foo&#64;bitwarden.com
          <ng-container slot="secondary">
            <div>Bitwarden.com</div>
            <div><em>locked</em></div>
          </ng-container>
          <i slot="end" class="bwi bwi-lock" aria-hidden="true"></i>
        </button>
      </bit-item>
    `,
  }),
};

export const ContentTypes: Story = {
  render: (args) => ({
    props: args,
    template: /*html*/ `
      <bit-item>
        <a bit-item-content href="#">
          Hi, I am a link.
        </a>
      </bit-item>
      <bit-item>
        <button bit-item-content href="#">
          And I am a button.
        </button>
      </bit-item>
      <bit-item>
        <bit-item-content>
          I'm just static :(
        </bit-item-content>
      </bit-item>
    `,
  }),
};

export const TextOverflow: Story = {
  render: (args) => ({
    props: args,
    template: /*html*/ `
      <bit-item>
        <bit-item-content>
          <i slot="start" class="bwi bwi-globe tw-text-3xl tw-text-muted" aria-hidden="true"></i>
          Helloooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo!
          <ng-container slot="secondary">Worlddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd!</ng-container>
        </bit-item-content>
        <ng-container slot="end">
          <bit-item-action>
            <button type="button" bitIconButton="bwi-clone"></button>
          </bit-item-action>
          <bit-item-action>
            <button type="button" bitIconButton="bwi-ellipsis-v"></button>
          </bit-item-action>
        </ng-container>
      </bit-item>
    `,
  }),
};

export const MultipleActionList: Story = {
  render: (args) => ({
    props: args,
    template: /*html*/ `
      <bit-item-group aria-label="Multiple Action List">
        <bit-item>
          <button bit-item-content>
            <i slot="start" class="bwi bwi-globe tw-text-3xl tw-text-muted" aria-hidden="true"></i>
            Foo
            <span slot="secondary">Bar</span>
          </button>

          <ng-container slot="end">
            <bit-item-action>
              <button type="button" bitBadge variant="primary">Auto-fill</button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-clone"></button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-ellipsis-v"></button>
            </bit-item-action>
          </ng-container>
        </bit-item>
        <bit-item>
          <button bit-item-content>
            <i slot="start" class="bwi bwi-globe tw-text-3xl tw-text-muted" aria-hidden="true"></i>
            Foo
            <span slot="secondary">Bar</span>
          </button>

          <ng-container slot="end">
            <bit-item-action>
              <button type="button" bitBadge variant="primary">Auto-fill</button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-clone"></button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-ellipsis-v"></button>
            </bit-item-action>
          </ng-container>
        </bit-item>
        <bit-item>
          <button bit-item-content>
            <i slot="start" class="bwi bwi-globe tw-text-3xl tw-text-muted" aria-hidden="true"></i>
            Foo
            <span slot="secondary">Bar</span>
          </button>

          <ng-container slot="end">
            <bit-item-action>
              <button type="button" bitBadge variant="primary">Auto-fill</button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-clone"></button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-ellipsis-v"></button>
            </bit-item-action>
          </ng-container>
        </bit-item>
        <bit-item>
          <button bit-item-content>
            <i slot="start" class="bwi bwi-globe tw-text-3xl tw-text-muted" aria-hidden="true"></i>
            Foo
            <span slot="secondary">Bar</span>
          </button>

          <ng-container slot="end">
            <bit-item-action>
              <button type="button" bitBadge variant="primary">Auto-fill</button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-clone"></button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-ellipsis-v"></button>
            </bit-item-action>
          </ng-container>
        </bit-item>
        <bit-item>
          <button bit-item-content>
            <i slot="start" class="bwi bwi-globe tw-text-3xl tw-text-muted" aria-hidden="true"></i>
            Foo
            <span slot="secondary">Bar</span>
          </button>

          <ng-container slot="end">
            <bit-item-action>
              <button type="button" bitBadge variant="primary">Auto-fill</button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-clone"></button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-ellipsis-v"></button>
            </bit-item-action>
          </ng-container>
        </bit-item>
        <bit-item>
          <button bit-item-content>
            <i slot="start" class="bwi bwi-globe tw-text-3xl tw-text-muted" aria-hidden="true"></i>
            Foo
            <span slot="secondary">Bar</span>
          </button>

          <ng-container slot="end">
            <bit-item-action>
              <button type="button" bitBadge variant="primary">Auto-fill</button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-clone"></button>
            </bit-item-action>
            <bit-item-action>
              <button type="button" bitIconButton="bwi-ellipsis-v"></button>
            </bit-item-action>
          </ng-container>
        </bit-item>
      </bit-item-group>
    `,
  }),
};

export const SingleActionList: Story = {
  render: (args) => ({
    props: args,
    template: /*html*/ `
      <bit-item-group aria-label="Single Action List">
        <bit-item>
          <a bit-item-content href="#">
            Foobar
            <i slot="end" class="bwi bwi-angle-right" aria-hidden="true"></i>
          </a>
        </bit-item>
        <bit-item>
          <a bit-item-content href="#">
            Foobar
            <i slot="end" class="bwi bwi-angle-right" aria-hidden="true"></i>
          </a>
        </bit-item>
        <bit-item>
          <a bit-item-content href="#">
            Foobar
            <i slot="end" class="bwi bwi-angle-right" aria-hidden="true"></i>
          </a>
        </bit-item>
        <bit-item>
          <a bit-item-content href="#">
            Foobar
            <i slot="end" class="bwi bwi-angle-right" aria-hidden="true"></i>
          </a>
        </bit-item>
        <bit-item>
          <a bit-item-content href="#">
            Foobar
            <i slot="end" class="bwi bwi-angle-right" aria-hidden="true"></i>
          </a>
        </bit-item>
        <bit-item>
          <a bit-item-content href="#">
            Foobar
            <i slot="end" class="bwi bwi-angle-right" aria-hidden="true"></i>
          </a>
        </bit-item>
      </bit-item-group>
    `,
  }),
};

export const SingleActionWithBadge: Story = {
  render: (args) => ({
    props: args,
    template: /*html*/ `
      <bit-item-group aria-label="Single Action With Badge">
        <bit-item>
          <a bit-item-content href="#">
            Foobar
            <span bitBadge variant="primary" slot="default-trailing">Auto-fill</span>
            <i slot="end" class="bwi bwi-angle-right" aria-hidden="true"></i>
          </a>
        </bit-item>
        <bit-item>
          <a bit-item-content href="#">
            Helloooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo!
            <span bitBadge variant="primary" slot="default-trailing">Auto-fill</span>
            <i slot="end" class="bwi bwi-angle-right" aria-hidden="true"></i>
          </a>
        </bit-item>
      </bit-item-group>
    `,
  }),
};

export const VirtualScrolling: Story = {
  render: (_args) => ({
    props: {
      data: Array.from(Array(100000).keys()),
    },
    template: /*html*/ `
      <cdk-virtual-scroll-viewport [itemSize]="46" class="tw-h-[500px]">
        <bit-item-group aria-label="Virtual Scrolling">
          <bit-item *cdkVirtualFor="let item of data">
            <button bit-item-content>
              <i slot="start" class="bwi bwi-globe tw-text-3xl tw-text-muted" aria-hidden="true"></i>
              {{ item }}
            </button>

            <ng-container slot="end">
              <bit-item-action>
                <button type="button" bitBadge variant="primary">Auto-fill</button>
              </bit-item-action>
              <bit-item-action>
                <button type="button" bitIconButton="bwi-clone"></button>
              </bit-item-action>
              <bit-item-action>
                <button type="button" bitIconButton="bwi-ellipsis-v"></button>
              </bit-item-action>
            </ng-container>
          </bit-item>
        </bit-item-group>
      </cdk-virtual-scroll-viewport>
    `,
  }),
};

export const WithoutBorderRadius: Story = {
  render: (args) => ({
    props: args,
    template: /*html*/ `
      <bit-layout>
      <bit-item>
        <button bit-item-content>
          <i slot="start" class="bwi bwi-globe tw-text-3xl tw-text-muted" aria-hidden="true"></i>
          Foo
          <span slot="secondary">Bar</span>
        </button>

        <ng-container slot="end">
          <bit-item-action>
            <button type="button" bitBadge variant="primary">Auto-fill</button>
          </bit-item-action>
          <bit-item-action>
            <button type="button" bitIconButton="bwi-clone"></button>
          </bit-item-action>
          <bit-item-action>
            <button type="button" bitIconButton="bwi-ellipsis-v"></button>
          </bit-item-action>
        </ng-container>
      </bit-item>
    </bit-layout>
    `,
  }),
};

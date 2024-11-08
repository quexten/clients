import { RouterTestingModule } from "@angular/router/testing";
import { StoryObj, Meta, moduleMetadata } from "@storybook/angular";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";

import { IconButtonModule } from "../icon-button";
import { LayoutComponent } from "../layout";
import { I18nMockService } from "../utils/i18n-mock.service";
import { positionFixedWrapperDecorator } from "../utils/position-fixed-wrapper-decorator";

import { NavItemComponent } from "./nav-item.component";
import { NavigationModule } from "./navigation.module";

export default {
  title: "Component Library/Nav/Nav Item",
  component: NavItemComponent,
  decorators: [
    positionFixedWrapperDecorator(
      (story) => `<bit-layout><bit-side-nav>${story}</bit-side-nav></bit-layout>`,
    ),
    moduleMetadata({
      declarations: [],
      imports: [RouterTestingModule, IconButtonModule, NavigationModule, LayoutComponent],
      providers: [
        {
          provide: I18nService,
          useFactory: () => {
            return new I18nMockService({
              submenu: "submenu",
              toggleCollapse: "toggle collapse",
              toggleSideNavigation: "Toggle side navigation",
              skipToContent: "Skip to content",
            });
          },
        },
      ],
    }),
  ],
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/file/Zt3YSeb6E6lebAffrNLa0h/Tailwind-Component-Library?node-id=4687%3A86642",
    },
    chromatic: { viewports: [640, 1280] },
  },
} as Meta;

type Story = StoryObj<NavItemComponent>;

export const Default: Story = {
  render: (args) => ({
    props: args,
    template: `
        <bit-nav-item text="${args.text}"  [route]="['']" icon="${args.icon}"></bit-nav-item>
      `,
  }),
  args: {
    text: "Hello World",
    icon: "bwi-filter",
  },
};

export const WithoutIcon: Story = {
  ...Default,
  args: {
    text: "Hello World",
    icon: "",
  },
};

export const WithoutRoute: Story = {
  render: () => ({
    template: `
        <bit-nav-item text="Hello World" icon="bwi-collection"></bit-nav-item>
      `,
  }),
};

export const WithChildButtons: Story = {
  render: (args) => ({
    props: args,
    template: `
      <bit-nav-item text="Hello World" [route]="['']" icon="bwi-collection">
        <button
          slot="end"
          class="tw-ml-auto"
          [bitIconButton]="'bwi-pencil-square'"
          [buttonType]="'light'"
          size="small"
          aria-label="option 2"
        ></button>
        <button
          slot="end"
          class="tw-ml-auto"
          [bitIconButton]="'bwi-check'"
          [buttonType]="'light'"
          size="small"
          aria-label="option 3"
        ></button>
      </bit-nav-item>
    `,
  }),
};

export const MultipleItemsWithDivider: Story = {
  render: (args) => ({
    props: args,
    template: `
      <bit-nav-item text="Hello World" icon="bwi-collection"></bit-nav-item>
      <bit-nav-item text="Hello World" icon="bwi-collection"></bit-nav-item>
      <bit-nav-divider></bit-nav-divider>
      <bit-nav-item text="Hello World" icon="bwi-collection"></bit-nav-item>
      <bit-nav-item text="Hello World" icon="bwi-collection"></bit-nav-item>
    `,
  }),
};

export const ForceActiveStyles: Story = {
  render: (args) => ({
    props: args,
    template: `
      <bit-nav-item text="First Nav" icon="bwi-collection"></bit-nav-item>
      <bit-nav-item text="Active Nav" icon="bwi-collection" [forceActiveStyles]="true"></bit-nav-item>
      <bit-nav-item text="Third Nav" icon="bwi-collection"></bit-nav-item>
    `,
  }),
};

import { importProvidersFrom } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { ActivatedRoute, Params } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { Meta, StoryObj, applicationConfig, moduleMetadata } from "@storybook/angular";
import { of } from "rxjs";

import { ClientType } from "@bitwarden/common/enums";
import {
  Environment,
  EnvironmentService,
  Region,
  Urls,
} from "@bitwarden/common/platform/abstractions/environment.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import {
  AsyncActionsModule,
  ButtonModule,
  DialogModule,
  FormFieldModule,
  LinkModule,
  SelectModule,
  ToastOptions,
  ToastService,
  TypographyModule,
} from "@bitwarden/components";

import { PreloadedEnglishI18nModule } from "../../../../../../apps/web/src/app/core/tests";

import { RegistrationStartComponent } from "./registration-start.component";

export default {
  title: "Auth/Registration/Registration Start",
  component: RegistrationStartComponent,
} as Meta;

const decorators = (options: {
  isSelfHost?: boolean;
  queryParams?: Params;
  clientType?: ClientType;
  defaultRegion?: Region;
}) => {
  return [
    moduleMetadata({
      imports: [
        RouterTestingModule,
        DialogModule,
        ReactiveFormsModule,
        FormFieldModule,
        SelectModule,
        ButtonModule,
        LinkModule,
        TypographyModule,
        AsyncActionsModule,
        BrowserAnimationsModule,
      ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { queryParams: of(options.queryParams || {}) },
        },
      ],
    }),
    applicationConfig({
      providers: [
        importProvidersFrom(PreloadedEnglishI18nModule),
        {
          provide: EnvironmentService,
          useValue: {
            environment$: of({
              getRegion: () => options.defaultRegion || Region.US,
            } as Partial<Environment>),
            availableRegions: () => [
              { key: Region.US, domain: "bitwarden.com", urls: {} },
              { key: Region.EU, domain: "bitwarden.eu", urls: {} },
            ],
            setEnvironment: (region: Region, urls?: Urls) => Promise.resolve({}),
          } as Partial<EnvironmentService>,
        },
        {
          provide: PlatformUtilsService,
          useValue: {
            isSelfHost: () => options.isSelfHost || false,
            getClientType: () => options.clientType || ClientType.Web,
          } as Partial<PlatformUtilsService>,
        },
        {
          provide: ToastService,
          useValue: {
            showToast: (options: ToastOptions) => {},
          } as Partial<ToastService>,
        },
      ],
    }),
  ];
};

type Story = StoryObj<RegistrationStartComponent>;

export const WebUSRegionExample: Story = {
  render: (args) => ({
    props: args,
    template: `
      <auth-registration-start></auth-registration-start>
      `,
  }),
  decorators: decorators({
    clientType: ClientType.Web,
    queryParams: {},
    defaultRegion: Region.US,
  }),
};

export const WebEURegionExample: Story = {
  render: (args) => ({
    props: args,
    template: `
      <auth-registration-start></auth-registration-start>
      `,
  }),
  decorators: decorators({
    clientType: ClientType.Web,
    queryParams: {},
    defaultRegion: Region.EU,
  }),
};

export const WebUSRegionQueryParamsExample: Story = {
  render: (args) => ({
    props: args,
    template: `
      <auth-registration-start></auth-registration-start>
      `,
  }),
  decorators: decorators({
    clientType: ClientType.Web,
    defaultRegion: Region.US,
    queryParams: { email: "jaredWasHere@bitwarden.com", emailReadonly: "true" },
  }),
};

export const DesktopUSRegionExample: Story = {
  render: (args) => ({
    props: args,
    template: `
      <auth-registration-start></auth-registration-start>
      `,
  }),
  decorators: decorators({
    clientType: ClientType.Desktop,
    defaultRegion: Region.US,
    isSelfHost: false,
  }),
};

export const DesktopEURegionExample: Story = {
  render: (args) => ({
    props: args,
    template: `
      <auth-registration-start></auth-registration-start>
      `,
  }),
  decorators: decorators({
    clientType: ClientType.Desktop,
    defaultRegion: Region.EU,
    isSelfHost: false,
  }),
};

export const DesktopSelfHostExample: Story = {
  render: (args) => ({
    props: args,
    template: `
      <auth-registration-start></auth-registration-start>
      `,
  }),
  decorators: decorators({
    clientType: ClientType.Desktop,
    isSelfHost: true,
    defaultRegion: Region.SelfHosted,
  }),
};

export const BrowserExtensionUSRegionExample: Story = {
  render: (args) => ({
    props: args,
    template: `
      <auth-registration-start></auth-registration-start>
      `,
  }),
  decorators: decorators({
    clientType: ClientType.Browser,
    defaultRegion: Region.US,
    isSelfHost: false,
  }),
};

export const BrowserExtensionEURegionExample: Story = {
  render: (args) => ({
    props: args,
    template: `
      <auth-registration-start></auth-registration-start>
      `,
  }),
  decorators: decorators({
    clientType: ClientType.Browser,
    defaultRegion: Region.EU,
    isSelfHost: false,
  }),
};

export const BrowserExtensionSelfHostExample: Story = {
  render: (args) => ({
    props: args,
    template: `
      <auth-registration-start></auth-registration-start>
      `,
  }),
  decorators: decorators({
    clientType: ClientType.Browser,
    isSelfHost: true,
    defaultRegion: Region.SelfHosted,
  }),
};

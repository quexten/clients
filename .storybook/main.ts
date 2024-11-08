import { dirname, join } from "path";
import { StorybookConfig } from "@storybook/angular";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";
import remarkGfm from "remark-gfm";

const config: StorybookConfig = {
  stories: [
    "../libs/auth/src/**/*.mdx",
    "../libs/auth/src/**/*.stories.@(js|jsx|ts|tsx)",
    "../libs/tools/send/send-ui/src/**/*.mdx",
    "../libs/tools/send/send-ui/src/**/*.stories.@(js|jsx|ts|tsx)",
    "../libs/vault/src/**/*.mdx",
    "../libs/vault/src/**/*.stories.@(js|jsx|ts|tsx)",
    "../libs/components/src/**/*.mdx",
    "../libs/components/src/**/*.stories.@(js|jsx|ts|tsx)",
    "../apps/web/src/**/*.mdx",
    "../apps/web/src/**/*.stories.@(js|jsx|ts|tsx)",
    "../apps/browser/src/**/*.mdx",
    "../apps/browser/src/**/*.stories.@(js|jsx|ts|tsx)",
    "../bitwarden_license/bit-web/src/**/*.mdx",
    "../bitwarden_license/bit-web/src/**/*.stories.@(js|jsx|ts|tsx)",
    "../libs/tools/card/src/**/*.mdx",
    "../libs/tools/card/src/**/*.stories.@(js|jsx|ts|tsx)",
  ],
  addons: [
    getAbsolutePath("@storybook/addon-links"),
    getAbsolutePath("@storybook/addon-essentials"),
    getAbsolutePath("@storybook/addon-a11y"),
    getAbsolutePath("@storybook/addon-designs"),
    getAbsolutePath("@storybook/addon-interactions"),
    {
      name: "@storybook/addon-docs",
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm],
          },
        },
      },
    },
  ],
  framework: {
    name: getAbsolutePath("@storybook/angular"),
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  env: (config) => ({
    ...config,
    FLAGS: JSON.stringify({}),
  }),
  webpackFinal: async (config, { configType }) => {
    if (config.resolve) {
      config.resolve.plugins = [new TsconfigPathsPlugin()] as any;
    }
    return config;
  },
  docs: {},
};

export default config;

// Recommended for mono-repositories
function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, "package.json")));
}

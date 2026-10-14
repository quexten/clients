const path = require("path");
const { buildConfig } = require("../../apps/desktop/webpack.base");

module.exports = (webpackConfig, context) => {
  // Detect if called by Nx (context parameter exists)
  const isNxBuild = context && context.options;

  if (isNxBuild) {
    return buildConfig({
      configName: "Commercial",
      renderer: {
        entry: path.resolve(__dirname, "src/app/main.ts"),
        entryModule: "bitwarden_license/bit-desktop/src/app/app.module#AppModule",
        tsConfig: path.resolve(
          context.context.root,
          "bitwarden_license/bit-desktop/tsconfig.renderer.json",
        ),
      },
      main: {
        entry: path.resolve(__dirname, "src/entry.ts"),
        tsConfig: path.resolve(
          context.context.root,
          "bitwarden_license/bit-desktop/tsconfig.main.json",
        ),
      },
      preload: {
        entry: path.resolve(__dirname, "src/preload.ts"),
        tsConfig: path.resolve(
          context.context.root,
          "bitwarden_license/bit-desktop/tsconfig.preload.json",
        ),
      },
      magnify: {
        entry: path.resolve(__dirname, "../../apps/desktop/src/magnify/main.ts"),
        tsConfig: path.resolve(context.context.root, "apps/desktop/tsconfig.magnify.json"),
        htmlTemplate: path.resolve(__dirname, "../../apps/desktop/src/magnify/index.html"),
      },
      outputPath: path.resolve(context.context.root, context.options.outputPath),
      importAliases: [
        {
          name: "@bitwarden/sdk-internal",
          alias: "@bitwarden/commercial-sdk-internal",
        },
      ],
    });
  } else {
    return buildConfig({
      configName: "Commercial",
      renderer: {
        entry: path.resolve(__dirname, "src/app/main.ts"),
        entryModule: "bitwarden_license/bit-desktop/src/app/app.module#AppModule",
        tsConfig: path.resolve(__dirname, "tsconfig.renderer.json"),
      },
      main: {
        entry: path.resolve(__dirname, "src/entry.ts"),
        tsConfig: path.resolve(__dirname, "tsconfig.main.json"),
      },
      preload: {
        entry: path.resolve(__dirname, "src/preload.ts"),
        tsConfig: path.resolve(__dirname, "tsconfig.preload.json"),
      },
      magnify: {
        entry: path.resolve(__dirname, "../../apps/desktop/src/magnify/main.ts"),
        tsConfig: path.resolve(__dirname, "../../apps/desktop/tsconfig.magnify.json"),
        htmlTemplate: path.resolve(__dirname, "../../apps/desktop/src/magnify/index.html"),
      },
      importAliases: [
        {
          name: "@bitwarden/sdk-internal",
          alias: "@bitwarden/commercial-sdk-internal",
        },
      ],
    });
  }
};

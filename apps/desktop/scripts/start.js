/* eslint-disable @typescript-eslint/no-require-imports */
const { exec } = require("node:child_process");

const concurrently = require("concurrently");
const rimraf = require("rimraf");

// Secondary-window bundles are built once up front; only main, preload and renderer are watched.
const MINI_APP_TARGETS = [
  "build-magnify",
  "build-magnify-preload",
  "build-ssh-approval",
  "build-ssh-approval-preload",
];
const DEV_CONFIG_FLAG = "--configuration=development";

const args = process.argv.splice(2);

rimraf.sync("build");

function buildTarget(target) {
  const command = [`nx run desktop:${target}`, DEV_CONFIG_FLAG];

  return new Promise((resolve, reject) => {
    exec(command.join(" "), (err, output) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error(`Could not build ${target}: `, err);
        reject(err);
        return;
      }

      // eslint-disable-next-line no-console
      console.log(`${target} built successfully: \n`, output);
      resolve();
    });
  });
}

Promise.all(MINI_APP_TARGETS.map(buildTarget))
  .then(() => {
    concurrently(
      [
        {
          name: "Main",
          command: "npm run build:main:watch",
          prefixColor: "yellow",
        },
        {
          name: "Prel",
          command: "npm run build:preload:watch",
          prefixColor: "magenta",
        },
        {
          name: "Rend",
          command: "npm run build:renderer:watch",
          prefixColor: "cyan",
        },
        {
          name: "Elec",
          command: `npx wait-on ./build/main.js ./build/index.html ./build/app/main.js && npx electron --no-sandbox --inspect=5858 --remote-debugging-port=9222 ${args.join(
            " ",
          )} ./build --watch`,
          prefixColor: "green",
        },
      ],
      {
        prefix: "name",
        outputStream: process.stdout,
        killOthersOn: ["success", "failure"],
      },
    );
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Could not start: ", err);
    process.exit(1);
  });

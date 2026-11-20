// Bundles the Spicetify custom app into dist/.
//   --watch    rebuild on change and copy into Spicetify (pair with `spicetify watch -a`)
//   --install  copy into Spicetify and register the app (run `spicetify apply` after)

import { cpSync, mkdirSync, rmSync, watch } from "node:fs";
import { join } from "node:path";
import { $, type BunPlugin } from "bun";

const root = join(import.meta.dir, "..");
const src = join(root, "src");
const dist = join(root, "dist");
const args = new Set(process.argv.slice(2));

// Spotify ships its own React. Point imports at it instead of bundling a copy.
const spotifyReact: BunPlugin = {
  name: "spotify-react",
  setup(build) {
    build.onResolve({ filter: /^react(\/jsx-(dev-)?runtime)?$/ }, (args) => ({
      path: args.path,
      namespace: "spotify-react",
    }));
    build.onLoad({ filter: /.*/, namespace: "spotify-react" }, (args) => ({
      loader: "js",
      contents:
        args.path === "react"
          ? "module.exports = Spicetify.React;"
          : `const J = Spicetify.ReactJSX;
             export const jsx = J.jsx;
             export const jsxs = J.jsxs;
             export const jsxDEV = (type, props, key, isStatic) => (isStatic ? J.jsxs : J.jsx)(type, props, key);
             export const Fragment = Spicetify.React.Fragment;`,
    }));
  },
};

async function build() {
  rmSync(dist, { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: [join(src, "index.tsx"), join(src, "extension.ts")],
    outdir: dist,
    format: "iife",
    target: "browser",
    plugins: [spotifyReact],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    return false;
  }

  // Spicetify calls a global `render()` from the custom app's index.js.
  const indexPath = join(dist, "index.js");
  const index = await Bun.file(indexPath).text();
  await Bun.write(
    indexPath,
    `${index}\nfunction render() { return globalThis.__spottoytRender(); }\n`,
  );
  cpSync(join(src, "manifest.json"), join(dist, "manifest.json"));
  cpSync(join(src, "style.css"), join(dist, "style.css"));
  return true;
}

async function spicetifyAppDir() {
  const userdata = (await $`spicetify path userdata`.text()).trim();
  return join(userdata, "CustomApps", "spottoyt");
}

async function copyToSpicetify() {
  const dest = await spicetifyAppDir();
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(dist, dest, { recursive: true });
}

if (!(await build())) process.exit(1);
console.log("Built dist/");

if (args.has("--install")) {
  await copyToSpicetify();
  const apps = await $`spicetify config custom_apps`.text();
  if (!apps.split(/\s+/).includes("spottoyt")) {
    await $`spicetify config custom_apps spottoyt`.quiet();
  }
  console.log("Copied into Spicetify. Run `spicetify apply` to load it.");
}

if (args.has("--watch")) {
  await copyToSpicetify();
  let timer: Timer | undefined;
  watch(src, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (await build()) {
        await copyToSpicetify();
        console.log(`Rebuilt at ${new Date().toLocaleTimeString()}`);
      }
    }, 100);
  });
  console.log(
    "Watching src/. Run `spicetify watch -a` to reload Spotify on change.",
  );
}

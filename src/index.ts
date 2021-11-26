import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as fsPromises from "fs/promises";
import { createModuleRegistry } from "./create-module-registry.js";
import { createFile } from "./create-file.js";
import { walkDir } from "./walk-dir.js";
import type { SuccessfulRegistry, Registry, File } from "./local-types";

const parser = yargs(hideBin(process.argv)).options({
  path: { type: "string", demandOption: true },
  exclude: { type: "string", default: "tests" },
});

const getFileNameFromPath = (path: string): string => {
  const splitPath = path.split("/");
  return splitPath[splitPath.length - 1];
};

interface Node {
  key: string;
  fields: Array<{ name: string }>;
}

interface Link {
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}

interface Field {
  name: string;
  color: string;
  figure: string;
}

const sortIgnoreCase = (strA: Field, strB: Field) => {
  if (strA.name.toLowerCase() < strB.name.toLowerCase()) {
    return -1;
  } else if (strA.name.toLowerCase() > strB.name.toLowerCase()) {
    return 1;
  } else {
    return 0;
  }
};

const convertRegistriesToNodes = (
  registries: Array<SuccessfulRegistry>
): Array<Node> =>
  registries.map((registry) => {
    const fields = registry.exports
      .map((exp) => ({
        name: exp.name,
        color: "#00BCF2",
        figure: "TriangleLeft",
      }))
      .sort(sortIgnoreCase)
      // .concat(
      //   registry.imports
      //     .map((imp) => ({
      //       name: imp.name,
      //       color: "#F25022",
      //       figure: "TriangleRight",
      //     }))
      //     .sort(sortIgnoreCase)
      // )
      .concat({ name: "imports", color: "green", figure: "square" });
    return {
      key: registry.entry.relativePathWOExt,
      fields,
      links: [],
    };
  });

const convertRegistriesToLinks = (
  registries: Array<SuccessfulRegistry>
): Array<Link> =>
  registries
    .map((registry) =>
      registry.imports.map((imp) => ({
        to: imp.from,
        toPort: imp.name,
        from: registry.entry.relativePathWOExt,
        fromPort: "imports",
      }))
    )
    .flat(100);

const replaceInFile = async (
  nodes: Array<Node>,
  links: Array<Link>,
  registries: Array<Registry>
) => {
  const data = await fsPromises.readFile("./src/index.html", "utf8");
  const result = data
    .replace(/NODE_DATA_ARRAY_HERE/, JSON.stringify(nodes, undefined, 2))
    .replace(/LINK_DATA_ARRAY_HERE/, JSON.stringify(links, undefined, 2))
    .replace(/ALL_REGISTRIES/, JSON.stringify(registries));

  await fsPromises.writeFile("tree.html", result, "utf8");
};

(async function main() {
  const argv = await parser.argv;
  const directoriesEntries = await walkDir(argv.path, argv.exclude, argv.path);
  const files = (
    await Promise.all(directoriesEntries.map((entry) => createFile(entry)))
  ).filter((f) => !!f) as File[];

  const registries: Array<Registry | undefined> = await createModuleRegistry(
    files,
    argv.path
  );
  const happyRegistries: Array<SuccessfulRegistry> = registries.filter(
    (reg) => !!reg && !(reg.ok instanceof Error)
  ) as Array<SuccessfulRegistry>;

  const nodes = convertRegistriesToNodes(happyRegistries);
  const links = convertRegistriesToLinks(happyRegistries);
  await replaceInFile(nodes, links, happyRegistries);
})();

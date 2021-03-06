import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as fsPromises from "fs/promises";
import {
  createModuleRegistry,
  getRegistry2,
  getLinks,
} from "./create-module-registry.js";
import { createFile } from "./create-file.js";
import { walkDir } from "./walk-dir.js";
import type { File } from "./local-types";

const parser = yargs(hideBin(process.argv)).options({
  path: { type: "string", demandOption: true },
  exclude: {
    type: "string",
    default: "test|node_modules|dist|fixtures|spec|snap",
  },
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

// const sortIgnoreCase = (strA: Field, strB: Field) => {
//   if (strA.name.toLowerCase() < strB.name.toLowerCase()) {
//     return -1;
//   } else if (strA.name.toLowerCase() > strB.name.toLowerCase()) {
//     return 1;
//   } else {
//     return 0;
//   }
// };

const convertRegistryToNodes = (
  registry: ReturnType<typeof getRegistry2>,
  allLinks: ReturnType<typeof getLinks>
): Array<Node> => {
  return Object.entries(registry).map(([key, value]) => {
    const fields = [
      { name: "imports", color: "green", figure: "TriangleLeft" },
      ...Object.entries(value.imports).map(([func]) => {
        return { name: func, color: "#00BCF2", figure: "TriangleRight" };
      }),
    ];
    const links = allLinks.filter(({ from }) => from === key);

    return {
      key,
      fields,
      links,
      isRelative: registry[key].meta.isRelative,
      color: !registry[key].meta.isRelative ? "#fcba03" : "#1570a6",
    };
  });
};

const writeDiagram = async (
  nodes: Array<Node>,
  links: Array<Link>,
  registries: ReturnType<typeof getRegistry2>
) => {
  const data = await fsPromises.readFile("./src/index.html", "utf8");
  const result = data
    .replace(/NODE_DATA_ARRAY_HERE/g, JSON.stringify(nodes, undefined, 2))
    .replace(/LINK_DATA_ARRAY_HERE/g, JSON.stringify(links, undefined, 2))
    .replace(/ALL_REGISTRIES/g, JSON.stringify(registries));

  await fsPromises.writeFile("tree.html", result, "utf8");
};

const writeJson = async (registries: ReturnType<typeof getRegistry2>) =>
  await fsPromises.writeFile(
    "registries.json",
    JSON.stringify(registries),
    "utf8"
  );

(async function main() {
  const argv = await parser.argv;
  const exclusionRegex = new RegExp(argv.exclude);
  const directoriesEntries = await walkDir(
    argv.path,
    exclusionRegex,
    argv.path
  );
  const files = (
    await Promise.all(directoriesEntries.map((entry) => createFile(entry)))
  ).filter((f) => !!f) as File[];

  await createModuleRegistry(files, argv.path);

  const links = getLinks();
  const registry = getRegistry2();
  const nodes = convertRegistryToNodes(registry, links);
  await writeDiagram(nodes, links, registry);
  await writeJson(registry);
})();

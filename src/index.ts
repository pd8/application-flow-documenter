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
import type { Registry, File } from "./local-types";

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
      { name: "imports", color: "green", figure: "TriangleRight" },
      { name: "all-exports", color: "orange", figure: "TriangleLeft" },
      ...Object.entries(value).map(([func, obj]) => {
        return { name: func, color: "#00BCF2", figure: "TriangleLeft" };
      }),
    ];
    const links = allLinks.filter(({ from }) => from === key);

    return {
      key,
      fields,
      links,
    };
  });
};

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
  const nodes = convertRegistryToNodes(getRegistry2(), links);
  await replaceInFile(nodes, links, []);
})();

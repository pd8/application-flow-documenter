import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import * as Estree from "./types";
//@ts-ignore
import * as espree from "espree";
//@ts-ignore
import md5 from "md5";
//@ts-ignore
import ts from "typescript";
//@ts-ignore
import frt from "flow-remove-types";

const parser = yargs(hideBin(process.argv)).options({
  path: { type: "string", demandOption: true },
  exclude: { type: "string", default: "tests" },
});

interface Entry {
  fileName: string;
  relativePath: string;
  fullPath: string;
  fileNameWOExt: string;
  relativePathWOExt: string;
  fullPathWOExt: string;
  fullDirectory: string;
  relativeDirectory: string;
  ext: string;
}

const removeExtension = (input: string, ext: string): string =>
  input.replace(new RegExp(ext + "$"), "");

async function walkDir(
  dir: string,
  exclusionString: string,
  pathToDir: string
): Promise<Array<Entry>> {
  const dirEntries = await fsPromises.readdir(dir);
  const results = await Promise.all(
    dirEntries.map(async (entry: string) => {
      const dirPath = path.join(dir, entry);
      const isDirectory = fs.statSync(dirPath).isDirectory();
      if (isDirectory) {
        return walkDir(dirPath, exclusionString, pathToDir);
      } else {
        const ext = path.extname(dirPath);
        const fullPath = dirPath;
        const relativePath = dirPath.replace(pathToDir, "");
        const fileName = entry;
        return [
          {
            fullPath,
            relativePath,
            fileName,
            fullPathWOExt: removeExtension(fullPath, ext),
            relativePathWOExt: removeExtension(relativePath, ext),
            fileNameWOExt: removeExtension(fileName, ext),
            fullDirectory: fullPath.replace(fileName, ""),
            relativeDirectory: relativePath.replace(fileName, ""),
            ext,
          },
        ];
      }
    })
  );
  return results
    .flat(100)
    .filter(({ fullPath }) => !fullPath.includes(exclusionString));
}

type Registry = SuccessfulRegistry | UnsuccessfulRegistry;

interface SuccessfulRegistry {
  id: string;
  path: string;
  fileName: string;
  hash: string;
  exports: Array<{ name: string; type: string }>;
  imports: Array<{
    name: string;
    type: string;
    from: string;
  }>;
  entry: Entry;
  ok: true;
}

interface UnsuccessfulRegistry {
  ok: unknown;
}

const importTypes = ["ImportDeclaration"];

const exportTypes = [
  "ExportAllDeclaration",
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
];

const isModuleDeclaration = (
  node: Estree.Directive | Estree.Statement | Estree.ModuleDeclaration
): node is Estree.ModuleDeclaration => {
  const n = node as Estree.ModuleDeclaration;
  return importTypes.includes(n.type) || exportTypes.includes(n.type);
};

const isRelativePath = (path: string): boolean =>
  path.startsWith("./") || path.startsWith("../");

const getFileNameFromPath = (path: string): string => {
  const splitPath = path.split("/");
  return splitPath[splitPath.length - 1];
};

const isTypeScriptFile = (ext: string): boolean =>
  [".ts", ".tsx"].includes(ext);
const isJavaScriptFile = (ext: string): boolean =>
  [".js", ".jsx", ".cjs", ".mjs"].includes(ext);
const isFlowFile = (fileBody: string): boolean => fileBody.includes("@flow");

interface File {
  contents: string;
  hash: string;
  entry: Entry;
}

const getFile = async (entry: Entry): Promise<File | null> => {
  const fileExt = path.extname(entry.fullPath);
  const isTS = isTypeScriptFile(fileExt);
  const isJS = isJavaScriptFile(fileExt);
  if (!isJS && !isTS) return null;
  const contents = await fsPromises.readFile(entry.fullPath, "utf-8");
  const hash: string = md5(contents);

  const isFlow = isFlowFile(contents);

  const transpiledContents = isTS
    ? ts.transpileModule(contents, {
        compilerOptions: { module: ts.ModuleKind.ESNext },
      }).outputText
    : isFlow
    ? frt(contents)
    : contents;

  return { contents: transpiledContents, hash, entry };
};

async function createModuleRegistry(
  files: Array<File>,
  basePath: string
): Promise<Array<Registry | undefined>> {
  const res = await Promise.all(
    files.map(async (file) => {
      const { fileNameWOExt: fileName } = file.entry;
      try {
        const { contents, hash, entry } = file;
        const parsedFile = espree.parse(contents, {
          ecmaVersion: 12,
          sourceType: "module",
          ecmaFeatures: {
            jsx: true,
            impliedStrict: true,
          },
        }) as Estree.Program;

        const importsAndExports: Array<Estree.ModuleDeclaration> =
          parsedFile.body.filter((node) =>
            isModuleDeclaration(node)
          ) as Array<Estree.ModuleDeclaration>;

        const imports: SuccessfulRegistry["imports"] = (
          importsAndExports.filter(({ type }) =>
            importTypes.includes(type)
          ) as Array<Estree.ImportDeclaration>
        )
          .map((node) => {
            const { type, source, specifiers } = node;
            const nodePath = (source.value?.toString() || "").replace(
              basePath,
              ""
            );

            const joinedPath = isRelativePath(nodePath)
              ? path.join(entry.relativeDirectory, nodePath)
              : null;

            const from = joinedPath || nodePath;

            console.debug(from);

            return specifiers.map((specifier) => {
              switch (specifier.type) {
                case "ImportDefaultSpecifier":
                  return {
                    name: "default",
                    type,
                    from,
                  };
                case "ImportSpecifier":
                  return {
                    name: specifier.imported.name,
                    type,
                    from,
                  };
                case "ImportNamespaceSpecifier":
                  return {
                    name: "all",
                    type,
                    from,
                  };
              }
            });
          })
          .flat(100);

        const exports: SuccessfulRegistry["exports"] = (
          (
            importsAndExports.filter(({ type }) =>
              exportTypes.includes(type)
            ) as Array<
              | Estree.ExportAllDeclaration
              | Estree.ExportNamedDeclaration
              | Estree.ExportDefaultDeclaration
            >
          )
            .map((node) => {
              const { type } = node;
              switch (node.type) {
                case "ExportAllDeclaration":
                  return { type, name: "all" };
                case "ExportNamedDeclaration":
                  if (node.specifiers.length) {
                    return node.specifiers.map((specifier) => {
                      return {
                        name: specifier.exported.name,
                        type,
                      };
                    });
                  } else if (node.declaration) {
                    if (
                      node.declaration.type === "FunctionDeclaration" &&
                      node.declaration.id
                    ) {
                      return {
                        name: node.declaration.id.name,
                        type,
                      };
                    } else if (
                      node.declaration.type === "VariableDeclaration"
                    ) {
                      return node.declaration.declarations.map(
                        (declaration) => {
                          switch (declaration.id.type) {
                            case "Identifier":
                              return {
                                name: declaration.id.name,
                                type,
                              };
                          }
                        }
                      );
                    }
                  }
                case "ExportDefaultDeclaration":
                  return {
                    name: "default",
                    type,
                  };
              }
            })
            .filter((a) => !!a) as SuccessfulRegistry["exports"]
        ).flat(100);

        return {
          id: "id",
          path: entry.fullPath,
          fileName,
          hash,
          imports,
          exports,
          ok: true,
          entry,
        };
      } catch (e) {
        console.error(`Errored on file ${file.entry.fullPath}, ${e}`);
        return {
          ok: e,
        };
      }
    })
  );
  return res;
}

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
  const data = await fsPromises.readFile("index.html", "utf8");
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
    await Promise.all(directoriesEntries.map((entry) => getFile(entry)))
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

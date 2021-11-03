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

const parser = yargs(hideBin(process.argv)).options({
  path: { type: "string", demandOption: true },
  exclude: { type: "string", default: "tests" },
});

async function walkDir(
  dir: string,
  exclusionString: string
): Promise<Array<{ fullPath: string; relativePath: string }>> {
  const dirEntries = await fsPromises.readdir(dir);
  const results = await Promise.all(
    dirEntries.map(async (entry: string) => {
      const dirPath = path.join(dir, entry);
      const isDirectory = fs.statSync(dirPath).isDirectory();
      if (isDirectory) {
        return walkDir(dirPath, exclusionString);
      } else {
        return [{ fullPath: dirPath, relativePath: entry }];
      }
    })
  );
  return results
    .flat(100)
    .filter(({ fullPath }) => !fullPath.includes(exclusionString));
}

interface Registry {
  id: string;
  path: string;
  fileName: string;
  hash: string;
  exports: Array<{ name: string; type: string }>;
  imports: Array<{
    name: string;
    type: string;
    path: string;
    fileName: string;
  }>;
  ok: true | unknown;
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
  return (
    n.type === "ImportDeclaration" ||
    n.type === "ExportAllDeclaration" ||
    n.type === "ExportNamedDeclaration" ||
    n.type === "ExportDefaultDeclaration"
  );
};

const getFileNameFromPath = (path: string): string => {
  const splitPath = path.split("/");
  return splitPath[splitPath.length - 1];
};

async function createModuleRegistry(
  files: Array<{ fullPath: string; relativePath: string }>,
  basePath: string
): Promise<Array<Registry>> {
  const res = await Promise.all(
    files.map(async ({ relativePath, fullPath }) => {
      const fileName = getFileNameFromPath(relativePath);
      try {
        const contents = await fsPromises.readFile(fullPath, "utf-8");
        const hash: string = md5(contents);

        const parsed = espree.parse(contents, {
          ecmaVersion: 12,
          sourceType: "module",
          ecmaFeatures: {
            jsx: true,
            impliedStrict: true,
          },
        }) as Estree.Program;

        const importsAndExports: Array<Estree.ModuleDeclaration> =
          parsed.body.filter((node) =>
            isModuleDeclaration(node)
          ) as Array<Estree.ModuleDeclaration>;

        const imports: Registry["imports"] = (
          importsAndExports.filter(({ type }) =>
            importTypes.includes(type)
          ) as Array<Estree.ImportDeclaration>
        )
          .map((node) => {
            const { type } = node;
            const path = (node.source.value?.toString() || "").replace(
              basePath,
              ""
            );
            const fileName = getFileNameFromPath(path);
            return node.specifiers.map((specifier) => {
              switch (specifier.type) {
                case "ImportDefaultSpecifier":
                  return {
                    name: "default",
                    type,
                    path,
                    fileName,
                  };
                case "ImportSpecifier":
                  return {
                    name: specifier.imported.name,
                    type,
                    path,
                    fileName,
                  };
                case "ImportNamespaceSpecifier":
                  return {
                    name: "all",
                    type,
                    path,
                    fileName,
                  };
              }
            });
          })
          .flat(100);

        const exports: Registry["exports"] = (
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
            .filter((a) => !!a) as Registry["exports"]
        ).flat(100);

        return {
          id: "id",
          path: relativePath,
          fileName,
          hash,
          imports,
          exports,
          ok: true,
        };
      } catch (e) {
        console.error(`Errored on file ${fullPath}, ${e}`);
        return {
          id: "id",
          path: fullPath,
          fileName,
          hash: "",
          imports: [],
          exports: [],
          ok: e,
        };
      }
    })
  );
  return res;
}

const convertRegistriesToNodes = (registries: Array<Registry>) =>
  registries.map((registry, i) => ({
    key: registry.fileName,
    fields: registry.exports.map((exp) => ({ name: exp.name })),
    loc: `${i * 140}, 0`,
  }));

(async function main() {
  const argv = await parser.argv;
  const directories = await walkDir(argv.path, argv.exclude);
  const registries: Array<Registry> = await createModuleRegistry(
    directories,
    argv.path
  );
  const happyRegistries: Array<Registry> = registries.filter(
    (reg) => !(reg.ok instanceof Error)
  );
  const nodes = convertRegistriesToNodes(happyRegistries);
  console.debug(JSON.stringify(nodes));
})();

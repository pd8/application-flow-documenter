import * as path from "path";
//@ts-ignore
import * as espree from "espree";
import * as Estree from "./types";
import { v4 as uuidv4 } from "uuid";
import type { Entry, Registry, File } from "./local-types";

const importTypes = ["ImportDeclaration"];

const exportTypes = [
  "ExportAllDeclaration",
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
];

const isRelativePath = (path: string): boolean =>
  path.startsWith("./") || path.startsWith("../");

const isModuleDeclaration = (
  node: Estree.Directive | Estree.Statement | Estree.ModuleDeclaration
): node is Estree.ModuleDeclaration => {
  const n = node as Estree.ModuleDeclaration;
  return importTypes.includes(n.type) || exportTypes.includes(n.type);
};
const isImport = (
  node: Estree.Directive | Estree.Statement | Estree.ModuleDeclaration
): node is Estree.ImportDeclaration => {
  return importTypes.includes(node.type);
};
const isExport = (
  node: Estree.Directive | Estree.Statement | Estree.ModuleDeclaration
): node is
  | Estree.ExportAllDeclaration
  | Estree.ExportNamedDeclaration
  | Estree.ExportDefaultDeclaration => {
  return exportTypes.includes(node.type);
};

const registry2: Record<
  string,
  Record<string, { name: string; key: string; importedBy: Array<string> }>
> = {};

const links: Array<{
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}> = [];

const getFormattedImports = (
  imports: Array<Estree.ImportDeclaration>,
  basePath: string,
  entry: Entry
): void => {
  console.info(`\x1b[36m${entry.relativePath}\x1b[0m`);
  imports.forEach((node) => {
    const { source, specifiers } = node;
    let nodePath = (source.value?.toString() || "").replace(basePath, "");
    if (nodePath === ".") {
      nodePath = "./index";
    }

    const joinedPath = isRelativePath(nodePath)
      ? path.join(entry.relativeDirectory, nodePath)
      : "";

    // console.debug(entry.relativeDirectory, joinedPath, nodePath);
    const from = joinedPath || nodePath;

    const imps = specifiers.map((specifier) => {
      let name;
      switch (specifier.type) {
        case "ImportDefaultSpecifier":
          name = "default";
          break;

        case "ImportSpecifier":
          name = specifier.imported.name;
          break;
        case "ImportNamespaceSpecifier":
          name = "all-exports";
          break;
      }

      if (registry2[from]) {
        if (registry2[from][name]) {
          registry2[from][name].importedBy.push(entry.relativePath);
        } else {
          registry2[from][name] = {
            name,
            key: uuidv4(),
            importedBy: [entry.relativePath],
          };
        }
      } else {
        registry2[from] = {
          [name]: { name, key: uuidv4(), importedBy: [entry.relativePath] },
        };
      }

      links.push({
        to: entry.relativePathWOExt,
        toPort: "imports",
        from,
        fromPort: name,
      });

      return {
        from,
        name,
      };
    });

    if (!registry2[entry.relativePathWOExt]) {
      console.log(entry.relativePathWOExt, "added to registry");
      registry2[entry.relativePathWOExt] = {};
    }

    imps.forEach(({ from, name }) =>
      console.info(
        `\x1b[35m${name}\x1b[0m imported from \x1b[36m${from}\x1b[0m`
      )
    );
  });
};

const functionTypes = [
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
];

const getFunctions = (node: Estree.Program["body"]): Array<string> => {
  return (
    node.filter(({ type }) =>
      functionTypes.includes(type)
    ) as Array<Estree.Function>
  ).map((node) => {
    switch (node.type) {
      case "FunctionDeclaration":
        return node.id?.name || "UNNAMED_FUNCTION_DECLARATION";
      case "FunctionExpression":
        return "FUNCTION_EXPRESSION";
      case "ArrowFunctionExpression":
        return "ARROW_FUNCTION_EXPRESSION";
    }
  });
};

export const createModuleRegistry = async (
  files: Array<File>,
  basePath: string
): Promise<Array<Registry | undefined>> => {
  const res = await Promise.all(
    files.map(async (file) => {
      try {
        const { contents, entry } = file;
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

        getFormattedImports(
          importsAndExports.filter((node) =>
            isImport(node)
          ) as Array<Estree.ImportDeclaration>,
          basePath,
          entry
        );
      } catch (e) {
        console.error(`Errored on file ${file.entry.fullPath}, ${e}`);
        return {
          ok: e,
        };
      }
    })
  );
  return res;
};

export const getRegistry2 = () => {
  console.log(registry2);
  return registry2;
};
export const getLinks = () => links;

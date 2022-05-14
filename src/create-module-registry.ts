import * as path from "path";
//@ts-ignore
import * as espree from "espree";
import * as Estree from "./types";
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
// const isExport = (
//   node: Estree.Directive | Estree.Statement | Estree.ModuleDeclaration
// ): node is
//   | Estree.ExportAllDeclaration
//   | Estree.ExportNamedDeclaration
//   | Estree.ExportDefaultDeclaration => {
//   return exportTypes.includes(node.type);
// };

const registry2: Record<
  string,
  { meta: { isRelative: boolean }; functions: Record<string, Array<string>> }
> = {};

const links: Array<{
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}> = [];

const createRegistryAndLinks = (
  imports: Array<Estree.ImportDeclaration>,
  basePath: string,
  entry: Entry
): void => {
  console.info(`\x1b[33mParsing ${entry.relativePath}\x1b[0m`);
  imports.forEach((node) => {
    const { source, specifiers } = node;
    let nodePath = (source.value?.toString() || "").replace(basePath, "");

    if (nodePath === ".") {
      nodePath = nodePath.replace(".", "./index");
    }

    const isRelative = isRelativePath(nodePath);
    let from = isRelative
      ? path.join(entry.relativeDirectory, nodePath) // relative
      : nodePath; // non relative, so either aliased or node module

    from = from.replace("/index", "");

    // Add all files and the vars that are imported from, into the registry
    const imps = specifiers.map((specifier) => {
      const to = entry.relativePathWOExt.replace("/index", "");
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
        if (registry2[from].functions[name]) {
          console.info(
            `Already seen file and function, \x1b[35m${name}\x1b[0m imported from \x1b[36m${from}\x1b[0m in \x1b[36m${to}\x1b[0m`
          );
          registry2[from].functions[name].push(to);
        } else {
          console.info(
            `First time seeing function, \x1b[35m${name}\x1b[0m imported from \x1b[36m${from}\x1b[0m in \x1b[36m${to}\x1b[0m`
          );
          registry2[from].functions[name] = [to];
        }
      } else {
        console.info(
          `First time seeing file, \x1b[35m${name}\x1b[0m imported from \x1b[36m${from}\x1b[0m in \x1b[36m${to}\x1b[0m`
        );
        registry2[from] = {
          meta: { isRelative },
          functions: { [name]: [to] },
        };
      }

      // for each import, also add the link
      links.push({
        to,
        toPort: "imports",
        from,
        fromPort: name,
      });

      return {
        from,
        name,
      };
    });

    // if the current file we're looking at, isn't in the registry yet, also add it in
    if (!registry2[entry.relativePathWOExt]) {
      // if its an index file but not the root of the investigations index file
      if (entry.fileNameWOExt === "index" && entry.relativeDirectory !== "") {
        const safeFileName = entry.relativePath.replace(
          "/" + entry.fileName,
          ""
        );
        console.info(
          `\x1b[36m${entry.relativePath}\x1b[0m is index file and not the root directory, so added to the registry as directory path`
        );
        registry2[safeFileName] = { meta: { isRelative: true }, functions: {} };
      } else if (entry.fileNameWOExt === "index") {
        console.info(
          `Root \x1b[36mindex\x1b[0m file added to registry as "index"`
        );
        registry2["index"] = { meta: { isRelative: true }, functions: {} };
      } else {
        const safeFileName = path.join(
          entry.relativeDirectory,
          entry.fileNameWOExt
        );
        console.info(
          `\x1b[36m${safeFileName}\x1b[0m is unknown non index file, adding to the registry`
        );
        registry2[safeFileName] = { meta: { isRelative: true }, functions: {} };
      }
    }

    // imps.forEach(({ from, name }) =>
    //   console.info(
    //     `\x1b[35m${name}\x1b[0m imported from \x1b[36m${from}\x1b[0m`
    //   )
    // );
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

        createRegistryAndLinks(
          importsAndExports.filter((node) =>
            isImport(node)
          ) as Array<Estree.ImportDeclaration>,
          basePath,
          entry
        );

        const functions = getFunctions(parsedFile.body);
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
  // console.log(registry2);
  return registry2;
};
export const getLinks = () => links;

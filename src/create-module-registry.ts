import * as path from "path";
//@ts-ignore
import * as espree from "espree";
import * as Estree from "./types";
import type { Entry, SuccessfulRegistry, Registry, File } from "./local-types";

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

const getFormattedImports = (
  imports: Array<Estree.ImportDeclaration>,
  basePath: string,
  entry: Entry
): SuccessfulRegistry["imports"] => {
  return imports
    .map((node) => {
      const { source, specifiers } = node;
      const nodePath = (source.value?.toString() || "").replace(basePath, "");

      // TODO: add alias support
      const joinedPath = isRelativePath(nodePath)
        ? path.join(entry.relativeDirectory, nodePath)
        : null;

      const from = joinedPath || nodePath;

      return specifiers.map((specifier) => {
        switch (specifier.type) {
          case "ImportDefaultSpecifier":
            return {
              from,
              name: "default",
            };
          case "ImportSpecifier":
            return {
              from,
              name: specifier.imported.name,
            };
          case "ImportNamespaceSpecifier":
            return {
              from,
              name: "all",
            };
        }
      });
    })
    .flat(100);
};

const getFormattedExports = (
  exports: Array<
    | Estree.ExportAllDeclaration
    | Estree.ExportNamedDeclaration
    | Estree.ExportDefaultDeclaration
  >
): SuccessfulRegistry["exports"] => {
  return (
    exports
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
              } else if (node.declaration.type === "VariableDeclaration") {
                return node.declaration.declarations.map((declaration) => {
                  switch (declaration.id.type) {
                    case "Identifier":
                      return {
                        name: declaration.id.name,
                        type,
                      };
                  }
                });
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

        // const importsAndExports: Array<Estree.ModuleDeclaration> =
        //   parsedFile.body.filter((node) =>
        //     isModuleDeclaration(node)
        //   ) as Array<Estree.ModuleDeclaration>;

        // console.debug(functions);

        // const imports: SuccessfulRegistry["imports"] = getFormattedImports(
        //   importsAndExports.filter((node) =>
        //     isImport(node)
        //   ) as Array<Estree.ImportDeclaration>,
        //   basePath,
        //   entry
        // );

        // const allExports = importsAndExports.filter((node) =>
        //   isExport(node)
        // ) as Array<
        //   | Estree.ExportAllDeclaration
        //   | Estree.ExportNamedDeclaration
        //   | Estree.ExportDefaultDeclaration
        // >;

        // const exports: SuccessfulRegistry["exports"] =
        //   getFormattedExports(allExports);

        const functions = getFunctions(parsedFile.body);

        return {
          id: "id",
          path: entry.fullPath,
          fileName,
          hash,
          imports: [],
          exports: [],
          functions,
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
};

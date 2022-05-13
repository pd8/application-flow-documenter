//@ts-ignore
import md5 from "md5";
//@ts-ignore
import ts from "typescript";
//@ts-ignore
import frt from "flow-remove-types";
import * as fsPromises from "fs/promises";
import * as path from "path";
import type { Entry, File } from "./local-types";

const isTypeScriptFile = (ext: string): boolean =>
  [".ts", ".tsx"].includes(ext);
const isJavaScriptFile = (ext: string): boolean =>
  [".js", ".jsx", ".cjs", ".mjs"].includes(ext);
const isFlowFile = (fileBody: string): boolean => fileBody.includes("@flow");

const colourCodeBoolean = (val: boolean, name: string) =>
  `${val ? "\x1b[32m" : "\x1b[31m"}${name}\x1b[0m`;

export const createFile = async (entry: Entry): Promise<File | null> => {
  const fileExt = path.extname(entry.fullPath);
  const isTS = isTypeScriptFile(fileExt);
  const isJS = isJavaScriptFile(fileExt);
  if (!isJS && !isTS) {
    console.info(
      `\x1b[36m${entry.relativePath}\x1b[0m not parsed, due to not having a JS or TS extension`
    );
    return null;
  }
  const contents = await fsPromises.readFile(entry.fullPath, "utf-8");
  const hash: string = md5(contents);

  const isFlow = isFlowFile(contents);

  const deFlowedJS = isFlow ? frt(contents) : contents;

  const transpiledContents = ts.transpileModule(deFlowedJS, {
    compilerOptions: {
      module: ts.ModuleKind.ES2015,
      target: ts.ScriptTarget.ES2015,
      jsx: ts.JsxEmit.Preserve,
      checkJs: true,
      paths: {
        "sharedLib/*": ["app/lib/*"],
        "adminShared/*": ["./app/bundles/admin/*"],
        "@deliveroo/components": [
          "./node_modules/@deliveroo/tools-component-library/dist/components",
        ],
        "@deliveroo/styles": [
          "./node_modules/@deliveroo/tools-component-library/dist",
        ],
      },
    },
  }).outputText;

  console.info(
    `${colourCodeBoolean(isFlow, "Flow")}, ${colourCodeBoolean(
      isTS,
      "Typescript"
    )}, ${colourCodeBoolean(isJS, "Javascript")}: \x1b[36m${
      entry.relativePath
    }\x1b[0m`
  );

  // console.debug(transpiledContents, "\n\n");

  return { contents: transpiledContents, hash, entry };
};

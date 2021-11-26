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

export const createFile = async (entry: Entry): Promise<File | null> => {
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

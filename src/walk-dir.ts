import * as fsPromises from "fs/promises";
import * as path from "path";
import * as fs from "fs";
import type { Entry } from "./local-types";

const removeExtension = (input: string, ext: string): string =>
  input.replace(new RegExp(ext + "$"), "");

export const walkDir = async (
  dir: string,
  exclusionString: string,
  pathToDir: string
): Promise<Array<Entry>> => {
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
};

// ext: ".js"
// fileName: "ReactAct.js"
// fileNameWOExt: "ReactAct"
// fullDirectory: "../react/packages/react/src/"
// fullPath: "../react/packages/react/src/ReactAct.js"
// fullPathWOExt: "../react/packages/react/src/ReactAct"
// relativeDirectory: ""
// relativePath: "ReactAct.js"
// relativePathWOExt: "ReactAct"

// ext: ".js"
// fileName: "ReactJSX.js"
// fileNameWOExt: "ReactJSX"
// fullDirectory: "../react/packages/react/src/jsx/"
// fullPath: "../react/packages/react/src/jsx/ReactJSX.js"
// fullPathWOExt: "../react/packages/react/src/jsx/ReactJSX"
// relativeDirectory: "jsx/"
// relativePath: "jsx/ReactJSX.js"
// relativePathWOExt: "jsx/ReactJSX"

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

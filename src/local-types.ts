export interface Entry {
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

export type Registry = SuccessfulRegistry | UnsuccessfulRegistry;

export interface SuccessfulRegistry {
  id: string;
  path: string;
  fileName: string;
  hash: string;
  exports: Array<{ name: string; type: string }>;
  imports: Array<{
    name: string;
    from: string;
  }>;
  functions: Array<string>;
  entry: Entry;
  ok: true;
}

export interface UnsuccessfulRegistry {
  ok: unknown;
}

export interface File {
  contents: string;
  hash: string;
  entry: Entry;
}

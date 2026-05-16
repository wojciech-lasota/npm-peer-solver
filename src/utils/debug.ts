import * as fs from "fs";
import * as path from "path";

export const writeDebugFile = (filename: string, data: unknown): void => {
  const debugDir = path.resolve("debug");
  fs.mkdirSync(debugDir, { recursive: true });
  const debugFile = path.join(debugDir, filename);
  fs.writeFileSync(debugFile, JSON.stringify(data, null, 2));
  console.log(`  [debug] Saved ${filename} to: ${debugFile}`);
};

import {SourceTextModule} from "node:vm";
import {readdirSync, readFileSync, statSync} from "node:fs";
import {join} from "node:path";

function javascriptFiles(directory) {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? javascriptFiles(path) : (/\.(?:js|mjs)$/.test(path) ? [path] : []);
  });
}

const files = javascriptFiles("modules");
for (const file of files) {
  try {
    new SourceTextModule(readFileSync(file, "utf8"), {identifier: file});
  } catch (error) {
    console.error(file + ": " + error.message);
    process.exit(1);
  }
}
console.log(`Syntax checked ${files.length} module files.`);

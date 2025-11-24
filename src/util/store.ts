import type * as Mocha from "mocha";
import fs from "fs";
import path from "path";
import glob from "fast-glob";
import { cwd, update, snapDir } from "../constants";
import { getDir, getTest, getTitle } from "./cur-test";
import escapeGlob from "./escape-glob";
import getLinePositions from "./get-line-positions";
import getLastArgumentRange from "./get-last-argument-range";
import toTemplateLiteral from "./to-template-literal";

const store = ((fs as any).__snap__ ??= {
  // Hangs storage off of fs object to ensure it is
  // deduped when this module is loaded multiple times
  // (eg via context-require)
  pending: false,
  inlineSnaps: new Map(),
  fileSnaps: new Map(),
  indexes: new Map(),
  curTest: undefined,
}) as {
  pending: boolean;
  inlineSnaps: Map<
    string,
    {
      line: number;
      column: number;
      stack: string;
      output: string;
    }[]
  >;
  fileSnaps: Map<string, string | null>;
  indexes: Map<Mocha.Test, Record<string, number>>;
  curTest: Mocha.Test | undefined;
};

export { store as default };

export const mochaHooks = {
  beforeAll() {
    store.pending = true;
  },
  beforeEach(this: Mocha.Context) {
    store.indexes.set((store.curTest = this.currentTest!), {});
  },
  afterAll() {
    if (!store.pending) return;

    try {
      // First we write all explicit snapshot updates.
      for (const [filename, content] of store.fileSnaps) {
        if (content === null) {
          unlinkWithDirectory(filename);
        } else {
          fs.mkdirSync(path.dirname(filename), { recursive: true });
          fs.writeFileSync(filename, content, "utf-8");
        }
      }

      for (const [filename, content] of store.inlineSnaps) {
        let pos = 0;
        let result = "";
        const src = fs.readFileSync(filename, "utf-8");
        const lines = getLinePositions(src);
        const edits = content
          .map(({ line, column, output, stack }) => {
            const loc = getLastArgumentRange(src, lines[line] + column);

            if (!loc) {
              throw new Error(`Unexpected snapshot expression:\n${stack}`);
            }

            return {
              stack,
              start: loc.start,
              end: loc.end,
              data:
                loc.start === loc.end
                  ? `, ${toTemplateLiteral(output)}`
                  : toTemplateLiteral(output),
            };
          })
          .sort(sortEdits);

        for (const edit of edits) {
          if (pos && edit.start <= pos) {
            const err = new Error(
              "Multiple inline snapshots written to the same location"
            );
            err.stack = edit.stack.replace(
              /^Error:.*$/m,
              `Error: ${err.message}`
            );
            throw err;
          }
          result += src.slice(pos, edit.start) + edit.data;
          pos = edit.end;
        }

        fs.writeFileSync(filename, result + src.slice(pos));
      }

      if (update) {
        // In update mode we try to clean up any old snapshots
        // We look for all __snapshots__ directories in the project
        // then remove any files that do not match a skipped test, or
        // a recently written file.
        const ignore: string[] = Array.from(store.fileSnaps.keys(), (file) =>
          escapeGlob(path.relative(cwd, file))
        );

        const lastTest = getTest();
        let rootSuite = lastTest.parent!;
        while (rootSuite.parent) rootSuite = rootSuite.parent;

        (function addSkippedTests(parent: Mocha.Suite) {
          for (const test of parent.tests) {
            if (!store.indexes.has(test)) {
              ignore.push(
                `${escapeGlob(
                  path.relative(
                    cwd,
                    path.join(getDir(test), snapDir, getTitle(test))
                  )
                )}.*`
              );
            }
          }

          for (const suite of parent.suites) {
            addSkippedTests(suite);
          }
        })(rootSuite);

        ignore.push("**/node_modules");

        for (const filename of glob.sync(`**/${snapDir}`, {
          cwd,
          ignore,
        })) {
          unlinkWithDirectory(filename);
        }
      }
    } finally {
      store.pending = false;
      store.indexes = new Map();
      store.fileSnaps = new Map();
      store.inlineSnaps = new Map();
    }
  },
};

function unlinkWithDirectory(filename: string) {
  try {
    fs.unlinkSync(filename);
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
    return;
  }

  let dir = path.dirname(filename);
  while (dir !== cwd && !dir.endsWith(snapDir)) {
    try {
      fs.rmdirSync(dir);
    } catch (err: any) {
      if (err.code === "ENOTEMPTY" || err.code === "ENOENT") break;
      throw err;
    }
    dir = path.dirname(dir);
  }
}

function sortEdits(a: { start: number }, b: { start: number }) {
  return a.start - b.start;
}

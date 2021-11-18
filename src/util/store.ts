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
  async afterAll() {
    if (!store.pending) return;

    try {
      // First we write all explicit snapshot updates.
      await Promise.all([
        ...Array.from(store.fileSnaps, async ([filename, content]) => {
          if (content === null) {
            await unlinkWithDirectory(filename);
          } else {
            await fs.promises.mkdir(path.dirname(filename), {
              recursive: true,
            });
            await fs.promises.writeFile(filename, content, "utf-8");
          }
        }),
        ...Array.from(store.inlineSnaps, async ([filename, content]) => {
          let pos = 0;
          let result = "";
          const src = await fs.promises.readFile(filename, "utf-8");
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

          await fs.promises.writeFile(filename, result + src.slice(pos));
        }),
      ]);

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

        for await (const filename of glob.stream(`**/${snapDir}`, {
          cwd,
          ignore,
        }) as AsyncIterable<string>) {
          await unlinkWithDirectory(filename);
        }
      }
    } finally {
      store.pending = false;
      store.indexes.clear();
      store.fileSnaps.clear();
      store.inlineSnaps.clear();
    }
  },
};

async function unlinkWithDirectory(filename: string) {
  let dir = filename;
  try {
    await fs.promises.unlink(filename);

    while ((dir = path.dirname(dir)) && dir !== cwd) {
      // Will stop on non empty dirs.
      await fs.promises.rmdir(dir);
    }
    // eslint-disable-next-line no-empty
  } catch {}
}

function sortEdits(a: { start: number }, b: { start: number }) {
  return a.start - b.start;
}

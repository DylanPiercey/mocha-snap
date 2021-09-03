import type * as Mocha from "mocha";
import fs from "fs";
import path from "path";
import assert from "assert";
import glob from "fast-glob";
import { inspect } from "util";

const update =
  process.env.UPDATE_SNAPSHOTS || process.argv.includes("--update");
const noop = () => {};
const cwd = process.cwd();
const cwdRegExp = new RegExp(escapeRegExp(cwd), "gi");
const testMissingMsg =
  "Cannot snapshot outside of a test. Did you enable the Mocha root hook for mocha-snap?";
const snapDir = "__snapshots__";
const store = ((fs as any).__snap__ ??= {
  // Hangs storage off of fs object to ensure it is
  // deduped when this module is loaded multiple times
  // (eg via context-require)
  pending: false,
  files: new Map(),
  indexes: new Map(),
  curTest: undefined,
}) as {
  pending: boolean;
  files: Map<string, string | null>;
  indexes: Map<Mocha.Test, Record<string, number>>;
  curTest: Mocha.Test | undefined;
};
const inspectOpts: Parameters<typeof inspect>[1] = {
  depth: null,
  sorted: true,
  colors: false,
  getters: "get",
  compact: false,
  showHidden: true,
  maxArrayLength: null,
  maxStringLength: null,
};

export default async function snapshot(
  fixture: unknown,
  opts?: { name?: string }
) {
  const title = getTitle(store.curTest);
  const result = await resolveFixture(fixture);
  const indexes = store.indexes.get(store.curTest!)!;
  const snapshotDir = path.join(getDir(store.curTest), snapDir);
  let name = (opts && opts.name) || "";

  if (!name.includes(".")) name += ".txt";
  if (name[0] !== ".") name = path.sep + name;
  if (result.error) name = `.error${name}`;
  if (indexes[name]) {
    name = `.${indexes[name] + name}`;
    indexes[name]++;
  } else {
    indexes[name] = 1;
  }

  const expectedFile = path.join(snapshotDir, `${title}.expected${name}`);
  const actualFile = path.join(snapshotDir, `${title}.actual${name}`);
  const expectedOutput = await fs.promises
    .readFile(expectedFile, "utf-8")
    .catch(noop);
  const shouldUpdate =
    update || (expectedOutput === undefined && !result.error);

  if (shouldUpdate) {
    store.files.set(expectedFile, result.output);
    store.files.set(actualFile, null);
  } else {
    try {
      assert.strictEqual(
        result.output,
        expectedOutput,
        path.relative(cwd, actualFile)
      );
    } catch (snapErr) {
      if (expectedOutput === undefined && result.error) throw result.error;
      store.files.set(actualFile, result.output);
      throw snapErr;
    }
  }
}

export const mochaHooks = {
  beforeAll() {
    store.pending = true;
  },
  beforeEach(this: Mocha.Context) {
    store.indexes.set((store.curTest = this.currentTest!), {});
  },
  async afterAll() {
    if (!store.pending) return;

    // First we write all explicit snapshot updates.
    await Promise.all(
      Array.from(store.files, async ([filename, content]) => {
        if (content === null) {
          await unlinkWithDirectory(filename);
        } else {
          await fs.promises.mkdir(path.dirname(filename), { recursive: true });
          await fs.promises.writeFile(filename, content, "utf-8");
        }
      })
    );

    if (update) {
      // In update mode we try to clean up any old snapshots
      // We look for all __snapshots__ directories in the project
      // then remove any files that do not match a skipped test, or
      // a recently written file.
      const ignore: string[] = Array.from(store.files.keys(), (file) =>
        escapeGlob(path.relative(cwd, file))
      );
      const lastTest = store.curTest!;
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

      for await (const filename of glob.stream(`**/${snapDir}/**`, {
        cwd,
        ignore,
      }) as AsyncIterable<string>) {
        await unlinkWithDirectory(filename);
      }
    }

    store.pending = false;
    store.indexes.clear();
    store.files.clear();
  },
};

async function resolveFixture(fixture: unknown) {
  let output = fixture;
  let error: Error | undefined;

  if (typeof fixture === "function") {
    const trackedErrors: Error[] = [];
    const addError = (ev: Error | ErrorEvent) => {
      const curErr = (ev as ErrorEvent).error || (ev as Error);
      if (!trackedErrors.includes(curErr)) {
        trackedErrors.push(curErr);
      }
    };

    if (typeof window === "object") {
      window.addEventListener("error", addError as any);
      window.addEventListener("unhandledrejection", addError as any);
    } else if (typeof process === "object") {
      process.on("uncaughtException", addError);
      process.on("unhandledRejection", addError);
    }

    try {
      output = await fixture();
    } catch (curErr) {
      addError(curErr);
    } finally {
      if (typeof window === "object") {
        window.removeEventListener("error", addError as any);
        window.removeEventListener("unhandledrejection", addError as any);
      } else if (typeof process === "object") {
        process.removeListener("uncaughtException", addError);
        process.removeListener("unhandledRejection", addError);
      }
    }

    error = mergeErrors(trackedErrors);

    if (error) {
      output = stripAnsiCodes(
        isAggregationError(error)
          ? error.errors.map((it) => it.message).join("\n\n")
          : error.message
      ).replace(cwdRegExp, ".");
    }
  }

  return {
    error,
    output: typeof output === "string" ? output : inspect(output, inspectOpts),
  };
}

function getDir(test: Mocha.Test | undefined) {
  if (!test) throw new Error(testMissingMsg);
  return test.file ? path.dirname(test.file) : cwd;
}

function getTitle(test: Mocha.Test | undefined) {
  if (!test) throw new Error(testMissingMsg);
  let cur: Mocha.Test | Mocha.Suite = test;
  let title = "";

  while (cur) {
    title = path.join(escapeFilename(cur.title), title);
    cur = cur.parent!;
  }

  return title;
}

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

function mergeErrors(errors: Error[]) {
  switch (errors.length) {
    case 0:
      return;
    case 1:
      return errors[0];
    default: {
      const message = `\n${errors
        .map((it) => inspect(it))
        .join("\n\n")
        .replace(/^(?!\s*$)/gm, "    ")}\n`;

      if (typeof AggregateError === "function") {
        return new AggregateError(errors, message);
      }

      const error = new Error(message);
      (error as AggregateError).errors = errors;
      return error;
    }
  }
}

function stripAnsiCodes(str: string) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, "");
}

function escapeFilename(str: string) {
  return str.replace(/[^a-z0-9$_-]+/gi, "-").replace(/^-|-$/, "");
}

function escapeGlob(str: string) {
  return str.replace(/[*?[{}()!\\\\]]/g, "\\$&");
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAggregationError(error: Error): error is AggregateError {
  return !!(error as AggregateError).errors;
}

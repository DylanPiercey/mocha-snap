import fs from "fs";
import path from "path";
import assert from "assert";
import resolveFixture from "./util/resolve-fixture";
import escapeFilename from "./util/escape-file-name";
import store from "./util/store";
import { getTest, getDir, getTitle } from "./util/cur-test";
import { cwd, update, snapDir } from "./constants";
import { normalizeNL } from "./util/normalize-nl";

const noop = () => {};

export default (expectError: boolean) => {
  return async function snap(
    fixture: unknown,
    {
      ext,
      file,
      dir,
    }:
      | { ext?: string; file?: never; dir?: string }
      | { ext?: never; file?: string; dir?: string } = {}
  ) {
    const curTest = getTest();
    const title = dir ? escapeFilename(curTest.title) : getTitle(curTest);
    const result = await resolveFixture(fixture);
    const indexes = store.indexes.get(store.curTest!)!;
    const snapshotDir = path.join(dir || getDir(curTest), snapDir);

    if (ext && file) {
      throw new Error("Cannot specify both ext and file");
    }

    let name = ".txt";

    if (file) {
      if (file[0] !== path.sep) file = path.sep + file;
      name = file;
    } else if (ext) {
      if (ext[0] !== ".") ext = "." + ext;
      name = ext;
    }

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
    const shouldUpdate = update || expectedOutput === undefined;

    store.fileSnaps.set(actualFile, null);

    if (expectError && !result.error) {
      store.fileSnaps.set(actualFile, result.output);
      throw new Error(
        `Expected error but got: ${path.relative(cwd, actualFile)}`
      );
    } else if (!expectError && result.error) {
      throw result.error;
    } else if (shouldUpdate) {
      store.fileSnaps.set(expectedFile, result.output);
    } else {
      try {
        assert.strictEqual(
          result.output,
          normalizeNL(expectedOutput),
          path.relative(cwd, actualFile)
        );
      } catch (snapErr) {
        store.fileSnaps.set(actualFile, result.output);
        throw snapErr;
      }
    }
  };
};

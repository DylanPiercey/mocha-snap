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
const extReg = /\.[^/\\]+$/;

export default async function snap(fixture: unknown, name = "", dir?: string) {
  const curTest = getTest();
  const title = dir ? escapeFilename(curTest.title) : getTitle(curTest);
  const result = await resolveFixture(fixture);
  const indexes = store.indexes.get(store.curTest!)!;
  const snapshotDir = path.join(dir || getDir(curTest), snapDir);

  if (!extReg.test(name)) name += ".txt";
  if (name[0] !== "." && name[0] !== path.sep) name = path.sep + name;
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
    store.fileSnaps.set(expectedFile, result.output);
    store.fileSnaps.set(actualFile, null);
  } else {
    try {
      assert.strictEqual(
        result.output,
        normalizeNL(expectedOutput),
        path.relative(cwd, actualFile)
      );
    } catch (snapErr) {
      if (expectedOutput === undefined && result.error) throw result.error;
      store.fileSnaps.set(actualFile, result.output);
      throw snapErr;
    }
  }
}

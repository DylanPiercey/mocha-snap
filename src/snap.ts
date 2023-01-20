import fs from "fs";
import path from "path";
import assert from "assert";
import resolveFixture from "./util/resolve-fixture";
import escapeFilename from "./util/escape-file-name";
import store from "./util/store";
import { getTest, getDir, getTitle } from "./util/cur-test";
import { cwd, update, updateErrors, snapDir } from "./constants";
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
  if (indexes[name]) {
    name = `.${indexes[name] + name}`;
    indexes[name]++;
  } else {
    indexes[name] = 1;
  }
  const errorName = `.error${name}`;

  const expectedFile = path.join(snapshotDir, `${title}.expected${name}`);
  const expectedErrorFile = path.join(
    snapshotDir,
    `${title}.expected${errorName}`
  );
  const actualFile = path.join(snapshotDir, `${title}.actual${name}`);
  const expectedOutput = await fs.promises
    .readFile(expectedFile, "utf-8")
    .catch(noop);
  const expectedErrorOutput = await fs.promises
    .readFile(expectedErrorFile, "utf-8")
    .catch(noop);
  const shouldUpdate =
    updateErrors ||
    (update && result.error
      ? expectedOutput === undefined
      : expectedErrorOutput === undefined) ||
    (expectedOutput === undefined &&
      expectedErrorOutput === undefined &&
      !result.error);

  if (shouldUpdate) {
    if (result.error) {
      store.fileSnaps.set(expectedErrorFile, result.output);
      store.fileSnaps.set(expectedFile, null);
    } else {
      store.fileSnaps.set(expectedErrorFile, result.output);
      store.fileSnaps.set(expectedFile, null);
    }
    store.fileSnaps.set(actualFile, null);
  } else {
    if (expectedOutput !== undefined && expectedErrorOutput !== undefined) {
      throw new Error(
        `Ambiguous Snapshot: Both ${path.relative(
          cwd,
          expectedFile
        )} and ${path.relative(cwd, expectedErrorFile)} files exist`
      );
    }
    try {
      assert.strictEqual(
        result.output,
        normalizeNL(expectedOutput ?? expectedErrorOutput),
        path.relative(cwd, actualFile)
      );
      store.fileSnaps.set(actualFile, null);
    } catch (snapErr) {
      if (expectedOutput === undefined && result.error) throw result.error;
      store.fileSnaps.set(actualFile, result.output);
      throw snapErr;
    }
  }
}
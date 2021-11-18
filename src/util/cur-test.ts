import type * as Mocha from "mocha";
import path from "path";
import { cwd } from "../constants";
import store from "./store";
import escapeFilename from "./escape-file-name";

export function getTest() {
  if (!store.curTest) {
    throw new Error(
      "Cannot snapshot outside of a test. Did you enable the Mocha root hook for mocha-snap?"
    );
  }

  return store.curTest;
}

export function getDir(test: Mocha.Test) {
  return test.file ? path.dirname(test.file) : cwd;
}

export function getTitle(test: Mocha.Test) {
  let cur: Mocha.Test | Mocha.Suite = test;
  let title = "";

  while (cur) {
    title = path.join(escapeFilename(cur.title), title);
    cur = cur.parent!;
  }

  return title;
}

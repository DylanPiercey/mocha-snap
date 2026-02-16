import type * as Mocha from "mocha";
import path from "path";
import { cwd } from "../constants";
import store from "./store";
import escapeFilename from "./escape-file-name";
import { argv, env } from "process";

export function getTest() {
  if (!store.curTest) {
    throw new Error(
      "Cannot snapshot outside of a test. Did you enable the Mocha root hook for mocha-snap?"
    );
  }

  return store.curTest;
}

export function getPath() {
  const envPath = retrievePathFromEnv();
  const argsPath = retrievePathFromArguments();

  const snapPath = envPath || argsPath;

  return typeof snapPath === "string" ? snapPath : undefined;
}

function retrievePathFromEnv() {
  const rawPath = env.SNAPSHOTS_PATH;

  if (!rawPath) {
    return undefined;
  }

  const absolutePath = path.resolve(rawPath);

  if (!absolutePath.startsWith(cwd)) {
    throw new Error("Potential path traversal");
  }

  return absolutePath;
}

function retrievePathFromArguments() {
  const pathIndex = argv.indexOf("--snapshots_path");
  const pathValue = pathIndex > -1 ? argv[pathIndex + 1] : undefined;

  if (!pathValue) {
    return undefined;
  }

  const absolutePath = path.resolve(pathValue);

  if (!absolutePath.startsWith(cwd)) {
    throw new Error("Potential path traversal");
  }

  return absolutePath;
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

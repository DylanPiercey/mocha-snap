import assert from "assert";
import resolveFixture from "./util/resolve-fixture";
import { update } from "./constants";
import store from "./util/store";
import { normalizeNL } from "./util/normalize-nl";

const stackFrameReg = /^\s*at\s*[^ ]+ \((.*?):(\d+):(\d+)\)\s*$/m;

export default (expectError: boolean) => {
  return function inlineSnap(fixture: unknown, expectedOutput?: unknown) {
    const err = {} as Error;
    Error.captureStackTrace(err, inlineSnap);

    return (async () => {
      const result = await resolveFixture(fixture);
      const missingOutput = arguments.length < 2;
      const shouldUpdate = update || missingOutput;

      if (expectError && !result.error) {
        throw new Error(`Expected error but got:\n${result.output}`);
      } else if (!expectError && result.error) {
        throw result.error;
      } else {
        try {
          assert.strictEqual(result.output, normalizeNL(expectedOutput));
        } catch (snapErr) {
          if (shouldUpdate) {
            const [, file, line, col] = stackFrameReg.exec(err.stack!)!;
            const snaps = store.inlineSnaps.get(file);
            const edit = {
              stack: err.stack!,
              line: parseInt(line, 10) - 1,
              column: parseInt(col, 10) - 1,
              output: result.output,
            };

            if (snaps) {
              snaps.push(edit);
            } else {
              store.inlineSnaps.set(file, [edit]);
            }
          } else {
            throw snapErr;
          }
        }
      }
    })();
  };
};

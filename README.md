<h1 align="center">
  <!-- Logo -->
  <br/>
  mocha-snap
  <br/>

  <!-- Language -->
  <a href="http://typescriptlang.org">
    <img src="https://img.shields.io/badge/%3C%2F%3E-typescript-blue.svg" alt="TypeScript"/>
  </a>
  <!-- Format -->
  <a href="https://github.com/prettier/prettier">
    <img src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg" alt="Styled with prettier"/>
  </a>
  <!-- CI -->
  <a href="https://github.com/dylanpiercey/mocha-snap/actions/workflows/ci.yml">
    <img src="https://github.com/dylanpiercey/mocha-snap/actions/workflows/ci.yml/badge.svg" alt="Build status"/>
  </a>
  <!-- Coverage -->
  <a href="https://codecov.io/gh/dylanpiercey/mocha-snap">
    <img src="https://codecov.io/gh/dylanpiercey/mocha-snap/branch/main/graph/badge.svg?token=5bffc299-715e-4e06-9653-266b79b9f7f1"/>
  </a>
  <!-- NPM Version -->
  <a href="https://npmjs.org/package/mocha-snap">
    <img src="https://img.shields.io/npm/v/mocha-snap.svg" alt="NPM Version"/>
  </a>
  <!-- Downloads -->
  <a href="https://npmjs.org/package/mocha-snap">
    <img src="https://img.shields.io/npm/dm/mocha-snap.svg" alt="Downloads"/>
  </a>
</h1>

Snapshot testing for Mocha with support for both file & inline snapshots.

# Installation

```console
npm install mocha-snap
```

# Setup

This package exposes a [Mocha root hook plugin](https://mochajs.org/#root-hook-plugins-can-export-a-function) that must be loaded before any snapshots can execute. It handles writing updated files to disk and cleaning up.

When running the Mocha CLI, provide `--require mocha-snap` to enable the hook.
Alternatively you can add the `require` option to your `.mocharc` to look something like:

```json
{
  "require": ["mocha-snap"]
}
```

# Inline snapshots

## Example

```javascript
import snap from "mocha-snap";

it("takes a snapshot", async () => {
  await snap.inline({
    hello: "world",
  });
});
```

The above will [format](#serializing-snapshots) the data passed to `snap.inline` and update the test file to pass the expected content in as the second argument.
This will then update the test to include the following:

```js
await snap.inline(
  {
    hello: "world",
  },
  `{ hello: "world" }`
);
```

After that point the expected and actual values are compared and an error is thrown if there is no match. You can [update the snapshot from the cli](#updating).

# File snapshots

## Example

```javascript
import snap from "mocha-snap";

it("takes a snapshot", async () => {
  await snap({
    hello: "world",
  });
});
```

The above will [format](#serializing-snapshots) the data passed to `snap` and save it to `%TEST_DIRECTORY%/__snapshots__/takes-a-snapshot.expected.txt`.
If the snapshot file already exists, it will be compared with the current content and an error is thrown if there is no match. You can [update the snapshot from the cli](#updating).

## Custom file name output

The second parameter to `mocha-snap` is the `name` property which can override the default `.txt` file extension for the output snapshots (except when an error occurs).

It can be useful to create utility functions for snapshotting different types of data to both normalize it, and provide the file extension.

Below we create simple JSON and HTML snapshot wrappers.

```javascript
import snap from "mocha-snap";

const snapHTML = (val) => snap(val, { ext: ".html" });
const snapJSON = (val) => snap(JSON.stringify(val), { ext: ".json" });

it("takes an html snapshot", async () => {
  await snapHTML("<h1>Hello World!</h1>");
});

it("takes a json snapshot", async () => {
  await snapJSON({ hello: "world" });
});
```

The `name` property can also be a file path which will be created within a snapshot folder with the name of the current test.

```javascript
it("takes a nested snapshot", async () => {
  await snap("Hello", { file: "part-1.txt" }); // Outputs a folder snapshot with a "part-1.txt" file.
  await snap("World", { file: "part-2.txt" }); // Adds another file ("part-2.txt") to the the above snapshot folder.
  await snap("!", { file: "nested/part-3.txt" }); // Creates another folder within the output ("nested") with the file "part-3.txt".
});
```

When multiple snapshots would have the same resolved file name, the test name is prefixed with an incrementing id.
This means the following is also perfectly fine.

```javascript
it("takes a nested snapshot", async () => {
  await snap("Hello"); // outputs as normal
  await snap("World"); // outputs with a `.1` prefix
});
```

## Custom `__snapshots__` folder

By default the `__snapshots__` folder is created in the same directory as the running test, but you can override this by passing in the third parameter `dir`.

```javascript
it("puts snapshot somewhere else", async () => {
  await snap("Hello", { ext: ".md", dir: process.cwd() }); // Put the snapshot in the project root, instead of beside this test.
});
```

## Output files

Unlike some snapshotting tools this module outputs an individual file _per snapshot call_.
This makes it easier to analyze, diff and manage the individual snapshots.

Output snapshots match the following format: `%TEST_DIRECTORY%/__snapshots__/<TEST_NAME><ACTUAL_OR_EXPECTED><NAME>`.

- `TEST_DIRECTORY`: the folder the current test is in.
- `TEST_NAME`: a file friendly name for the current test test. Each parent suite will create a new nested directory.
- `ACTUAL_OR_EXPECTED`: will be `.expected` when updating a test, and `.actual` when a test has failed the comparison.
- `NAME`: If the `ext` is passed (eg `.json`) it is appended directly to the test file, otherwise the `file` is joined by a path separator allowing (eg `result.json` will output a file in the current test folder called `result.json`). If neither `ext` nor `file` is provided, `.txt` will be used as the `ext`.

An example output file might look like `src/my-component/__tests__/__snapshots__/my-test-suite/my-test-name.expected.txt`.

# Updating

Run your test command with `--update`.
If the snapshot was previously empty it is auto saved, even without `--update` being used.

```terminal
mocha --update
```

Or set the `UPDATE_SNAPSHOTS` environment variable.

```terminal
UPDATE_SNAPSHOTS=1 mocha
```

# Serializing snapshots

If a `string` is passed to one of the snapshot api's that string will be saved as the raw snapshot content.
If anything else is passed it is first serialized using using [util.inspect](https://nodejs.org/dist/latest-v16.x/docs/api/util.html#util_util_inspect_object_options).

# Catching errors

You can also pass a function the `snap.catch` or `snap.inline.cach` apis which will execute the function, `await` any returned promises, and snapshot the thrown errors.

The useful part here is that during that function execution _all_ errors (including uncaught ones) are tracked.
If there are any errors before we take the snapshot, the entire snapshot will error. This allows you to snapshot test your errors, in aggregate.

```js
it("should throw some exceptions", async () => {
  await snap.catch(async () => {
    setTimeout(() => {
      throw new Error("Fail during snapshot!");
    }, 100);
    await sleep(1000);
    return "success";
  });
});
```

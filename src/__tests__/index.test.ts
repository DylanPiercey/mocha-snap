/* eslint-disable no-irregular-whitespace */
import path from "path";
import snap from "..";

it("takes a single snapshot", async () => {
  await snap(1);
});

describe("when nested", () => {
  it("takes a snapshot", async () => {
    await snap(2);
  });
});

it("takes multiple snapshots", async () => {
  await snap({ a: 1, c: 3, b: 2 });
  await snap("Hello!");
});

it("takes an error snapshot", async () => {
  await snap(async () => {
    void tick().then(() => Promise.reject(new Error("fail")));
    void tick().then(() => Promise.reject(new Error("twice")));
    await tick();
    await tick();
  });
});

it("takes an extension override snapshot", async () => {
  await snap(
    JSON.stringify(
      {
        hello: "world",
      },
      null,
      2
    ),
    ".json"
  );

  await snap("<div>Hello World</div>", ".html");
});

it("takes a name override snapshot", async () => {
  await snap(
    JSON.stringify(
      {
        hello: "world",
      },
      null,
      2
    ),
    "result.json"
  );

  await snap("<div>Hello World</div>", "nested/result.html");
});

it("takes a dir override snapshot", async () => {
  await snap(
    JSON.stringify(
      {
        hello: "world",
      },
      null,
      2
    ),
    ".json",
    path.join(__dirname, "override_snap_dir")
  );
});

describe("when nested", () => {
  it("takes a dir override snapshot", async () => {
    await snap(
      JSON.stringify(
        {
          hello: "world",
        },
        null,
        2
      ),
      ".json",
      path.join(__dirname, "override_snap_dir_nested")
    );
  });
});

it("takes an inline snapshot", async () => {
  await snap.inline(1, `1`);
  await snap.inline(
    `\`\${"\\"    \\n\\r\\\\\\x3C\\u2028\\u2029some other content"`,
    `\`\${"\\"    \\n\\r\\\\\\x3C\\u2028\\u2029some other content"`
  );
  await snap.inline(
    () => "Hello World".repeat(3),
    `Hello WorldHello WorldHello World`
  );
  await snap.inline(
    {
      hello: "world",
    },
    `{
  hello: 'world'
}`
  );
});

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

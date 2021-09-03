import snapshot from "..";

it("takes a single snapshot", async () => {
  await snapshot(1);
});

describe("when nested", () => {
  it("takes a snapshot", async () => {
    await snapshot(2);
  });
});

it("takes multiple snapshots", async () => {
  await snapshot({ a: 1, c: 3, b: 2 });
  await snapshot("Hello!");
});

it("takes an error snapshot", async () => {
  await snapshot(async () => {
    void tick().then(() => Promise.reject(new Error("fail")));
    void tick().then(() => Promise.reject(new Error("twice")));
    await tick();
    await tick();
  });
});

it("takes an extension override snapshot", async () => {
  await snapshot(
    JSON.stringify(
      {
        hello: "world",
      },
      null,
      2
    ),
    {
      name: ".json",
    }
  );

  await snapshot("<div>Hello World</div>", {
    name: ".html",
  });
});

it("takes a name override snapshot", async () => {
  await snapshot(
    JSON.stringify(
      {
        hello: "world",
      },
      null,
      2
    ),
    {
      name: "result.json",
    }
  );

  await snapshot("<div>Hello World</div>", {
    name: "nested/result.html",
  });
});

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough, Readable } from "node:stream";

import * as React from "react";
import { renderToPipeableStream } from "react-dom/server";

import { decode, encode } from "./runtime.js";

const CLIENT_REFERENCE_SYMBOL = Symbol.for("react.client.reference");
const SERVER_REFERENCE_SYMBOL = Symbol.for("react.server.reference");

function renderToString(root: React.ReactElement) {
  const { pipe } = renderToPipeableStream(root);
  const stream = pipe(new PassThrough());

  const readable = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  return new Response(readable, {
    headers: {
      "Content-Type": "text/html",
    },
  }).text();
}

async function AsyncComponent() {
  await 0;
  return <h1>Hello, world!</h1>;
}

test("can encode and decode basic tree", async () => {
  const root = (
    <html lang="en">
      <head>
        <title>Hello, world!</title>
      </head>
      <body>
        <h1>Hello, world!</h1>
      </body>
    </html>
  );

  const encoded = encode(root);
  const decoded = await decode(encoded);
  assert.equal(
    await renderToString(decoded.value as React.ReactElement),
    await renderToString(root)
  );
  await decoded.done;
});

test("can encode and decode tree with fragment", async () => {
  const root = (
    <html lang="en">
      <head>
        <title>Hello, world!</title>
      </head>
      <body>
        <>
          <h1>Hello, world!</h1>
        </>
      </body>
    </html>
  );

  const encoded = encode(root);
  const decoded = await decode(encoded);
  assert.equal(
    await renderToString(decoded.value as React.ReactElement),
    await renderToString(root)
  );
  await decoded.done;
});

test("can encode and decode tree with suspense", async () => {
  const root = (
    <html lang="en">
      <head>
        <title>Hello, world!</title>
      </head>
      <body>
        <React.Suspense fallback={<h1>Loading...</h1>}>
          <AsyncComponent />
        </React.Suspense>
      </body>
    </html>
  );

  const encoded = encode(root);
  const decoded = await decode(encoded);
  assert.equal(
    await renderToString(decoded.value as React.ReactElement),
    await renderToString(root)
  );
  await decoded.done;
});

test("can encode and decode client reference", async () => {
  const ClientReference = {
    $$typeof: CLIENT_REFERENCE_SYMBOL,
    $$id: "client-module",
    $$name: "ClientReference",
  } as unknown as React.FC;

  const ClientReferenceImplementation = () => <h1>ClientReference</h1>;

  const Root = ({ children }: { children: React.ReactNode }) => (
    <html lang="en">
      <head>
        <title>Hello, world!</title>
      </head>
      <body>{children}</body>
    </html>
  );
  const encoded = encode(
    <Root>
      <ClientReference />
    </Root>,
    {
      clientReferenceMetadata(clientReference): [string, string] {
        if (clientReference.$$id !== "client-module") {
          throw new Error("Invalid client reference");
        }
        if (clientReference.$$name !== "ClientReference") {
          throw new Error("Invalid client reference");
        }
        return [clientReference.$$id, clientReference.$$name];
      },
    }
  );
  const decoded = await decode(encoded, {
    async loadClientReference([id, name]: [string, string]) {
      if (id !== "client-module") {
        throw new Error("Invalid client reference");
      }
      if (name !== "ClientReference") {
        throw new Error("Invalid client reference");
      }
      return ClientReferenceImplementation;
    },
  });

  assert.equal(
    await renderToString(decoded.value as React.ReactElement),
    await renderToString(
      <Root>
        <ClientReferenceImplementation />
      </Root>
    )
  );

  await decoded.done;
});

test("can encode and decode unbound server reference", async () => {
  const serverReference = Object.defineProperties(() => {}, {
    $$typeof: {
      value: SERVER_REFERENCE_SYMBOL,
    },
    $$id: {
      value: "serverReference",
    },
    $$bound: {
      value: null,
    },
  });

  const root = (
    <button type="button" onClick={serverReference}>
      Call server reference
    </button>
  );

  let serverCall: [unknown, unknown] | undefined;
  const encoded = encode(root);
  const decoded = await decode(encoded, {
    async callServer(id, args) {
      serverCall = [id, args];
    },
  });

  const onClick = (decoded.value as { props: { onClick: () => void } }).props
    .onClick;
  await onClick();
  assert.deepEqual(serverCall, ["serverReference", []]);
});

test("can encode and decode unbound server reference and bind again", async () => {
  const serverReference = Object.defineProperties(() => {}, {
    $$typeof: {
      value: SERVER_REFERENCE_SYMBOL,
    },
    $$id: {
      value: "serverReference",
    },
    $$bound: {
      value: null,
    },
  });

  const root = (
    <button type="button" onClick={serverReference}>
      Call server reference
    </button>
  );

  let serverCall: [unknown, unknown] | undefined;
  const encoded = encode(root);
  const decoded = await decode(encoded, {
    async callServer(id, args) {
      serverCall = [id, args];
    },
  });

  const onClick = (
    decoded.value as {
      props: { onClick: (a: string, b: string, c: string) => void };
    }
  ).props.onClick
    .bind(null, "a")
    .bind(null, "b");
  await onClick("c");
  assert.deepEqual(serverCall, ["serverReference", ["a", "b", "c"]]);
});

test("can encode and decode bound server reference", async () => {
  const serverReference = Object.defineProperties(() => {}, {
    $$typeof: {
      value: SERVER_REFERENCE_SYMBOL,
    },
    $$id: {
      value: "serverReference",
    },
    $$bound: {
      value: null,
    },
  });

  const root = (
    <button type="button" onClick={serverReference}>
      Call server reference
    </button>
  );

  let serverCall: [unknown, unknown] | undefined;
  const encoded = encode(root);
  const decoded = await decode(encoded, {
    async callServer(id, args) {
      serverCall = [id, args];
    },
  });

  const onClick = (decoded.value as { props: { onClick: () => void } }).props
    .onClick;
  await onClick();
  assert.deepEqual(serverCall, ["serverReference", []]);
});

test("can encode and decode bound server reference and bind again", async () => {
  const serverReference = Object.defineProperties(() => {}, {
    $$typeof: {
      value: SERVER_REFERENCE_SYMBOL,
    },
    $$id: {
      value: "serverReference",
    },
    $$bound: {
      value: ["a"],
    },
  });

  const root = (
    <button type="button" onClick={serverReference}>
      Call server reference
    </button>
  );

  let serverCall: [unknown, unknown] | undefined;
  const encoded = encode(root);
  const decoded = await decode(encoded, {
    async callServer(id, args) {
      serverCall = [id, args];
    },
  });

  const onClick = (
    decoded.value as { props: { onClick: (b: string, c: string) => void } }
  ).props.onClick.bind(null, "b");
  await onClick("c");
  assert.deepEqual(serverCall, ["serverReference", ["a", "b", "c"]]);
});

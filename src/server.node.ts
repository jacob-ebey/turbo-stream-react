import * as stream from "node:stream";
import type * as streamWeb from "node:stream/web";

import type { EncodeOptions } from "./runtime.js";
import type { ReactOptions } from "./server.js";

import { renderToReadableStream } from "./server.js";

export { renderToReadableStream };

export function renderToPipeableStream(
  value: unknown,
  encodeOptions: EncodeOptions,
  options?: ReactOptions
) {
  const readable = renderToReadableStream(value, encodeOptions, options);

  return stream.Readable.fromWeb(
    readable as streamWeb.ReadableStream<Uint8Array>
  );
}

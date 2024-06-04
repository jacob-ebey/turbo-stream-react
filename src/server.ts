import type { EncodeOptions } from "./runtime.js";
import { encode } from "./runtime.js";

export type ReactOptions = {
  onError?: (error: unknown) => void;
};

export function renderToReadableStream(
  value: unknown,
  encodeOptions: EncodeOptions,
  options?: ReactOptions
) {
  return encode(value, {
    ...options,
    ...encodeOptions,
  });
}

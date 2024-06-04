import type { DecodeOptions } from "./runtime.js";
import { decode } from "./runtime.js";

export async function createFromReadableStream(
  readable: ReadableStream<Uint8Array>,
  options?: DecodeOptions
) {
  const result = await decode(readable, options);
  result.done.catch(console.error);
  return result.value;
}

export async function createFromFetch(
  fetchPromise: Promise<Response>,
  options?: DecodeOptions
) {
  const response = await fetchPromise;
  if (!response.body) {
    throw new Error("Response body is not readable");
  }
  return createFromReadableStream(response.body, options);
}

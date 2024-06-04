import * as React from "react";
import * as turbo from "turbo-stream";

const REACT_ELEMENT_SYMBOL = Symbol.for("react.element");
const REACT_TRANSITIONAL_ELEMENT_SYMBOL = Symbol.for(
  "react.transitional.element"
);
const CLIENT_REFERENCE_SYMBOL = Symbol.for("react.client.reference");
const SERVER_REFERENCE_SYMBOL = Symbol.for("react.server.reference");
const FRAGMENT_SYMBOL = Symbol.for("react.Fragment");
const SUSPENSE_SYMBOL = Symbol.for("react.Suspense");

const REACT_FRAGMENT_SYMBOL = React.createElement(React.Fragment).type;
const REACT_SUSPENSE_SYMBOL = React.createElement(React.Suspense).type;

type CallServerFunction = (id: string, args: unknown[]) => Promise<unknown>;

export type DecodeOptions = {
  callServer?: CallServerFunction;
  loadClientReference?: (
    // biome-ignore lint/suspicious/noExplicitAny: This is appropriate usage of any
    metadata: any
  ) => Promise<React.ComponentType>;
};

// biome-ignore lint/complexity/noBannedTypes: This is appropriate usage of Function
function bind(this: Function, thisArg: unknown, ...args: unknown[]) {
  if (thisArg) {
    throw new Error(
      'Cannot bind "this" of a Server Action. Pass null or undefined as the first argument to .bind().'
    );
  }

  const newFn = (...more: unknown[]) => this.apply(this, [...args, ...more]);

  return Object.assign(newFn, {
    bind,
  });
}

function decodePlugin({
  callServer,
  loadClientReference,
}: DecodeOptions = {}): turbo.DecodePlugin {
  return (pluginType, ...inputs: unknown[]) => {
    switch (pluginType) {
      case "j": {
        const [type, key, props] = inputs;
        const { children, ...restProps } = props as Record<string, unknown>;
        let result: unknown;
        const pr = {
          ...restProps,
          key,
        } as React.Attributes & { key?: React.Key };
        const args = Array.isArray(children) ? children : [children];
        if (typeof type === "string") {
          result = React.createElement(type, pr, ...args);
        } else if (type === FRAGMENT_SYMBOL) {
          result = React.createElement(React.Fragment, pr, ...args);
        } else if (type === SUSPENSE_SYMBOL) {
          result = React.createElement(React.Suspense, pr, ...args);
        }

        if (!result) {
          throw new Error("Invalid React.createElementNode");
        }

        return { value: result };
      }
      case "a": {
        const [value] = inputs;
        if (
          value &&
          typeof value === "object" &&
          "then" in value &&
          typeof value.then === "function"
        ) {
          return {
            value: React.createElement(
              React.lazy(async () => {
                const node = await (value as Promise<React.ReactNode>);
                return {
                  default: () => node,
                };
              })
            ),
          };
        }
        return {
          value,
        };
      }
      case "c": {
        if (!loadClientReference) {
          throw new Error(
            "loadClientReference is required to decode client references"
          );
        }
        const [key, props, ...metadata] = inputs as [
          string | number,
          Record<string, unknown>,
          ...unknown[]
        ];

        const valuePromise = loadClientReference(metadata).then((Component) => {
          const { children, ...restProps } = props as Record<string, unknown>;
          if (typeof Component !== "function") {
            throw new Error("Invalid client reference, expected a function");
          }
          return React.createElement(
            Component,
            { ...restProps, key },
            ...(Array.isArray(children) ? children : [children])
          );
        });

        return {
          value: React.createElement(
            React.lazy(async () => {
              const value = await valuePromise;
              return {
                default: () => value,
              };
            }),
            { key }
          ),
        };
      }
      case "s": {
        const [id, ...bound] = inputs as [string, ...unknown[]];
        const unboundCallServerFunction = ((...args: unknown[]) => {
          if (!callServer) {
            throw new Error(
              "callServer is not implemented in this environment"
            );
          }

          return callServer(id, args);
        }).bind(null, ...bound);

        const callServerFunction = Object.assign(unboundCallServerFunction, {
          bind,
        });

        return {
          value: Object.defineProperties(callServerFunction, {
            $$typeof: {
              value: SERVER_REFERENCE_SYMBOL,
            },
            $$id: {
              value: id,
            },
            $$bound: {
              value: bound,
            },
          } satisfies {
            [key in keyof ServerReference]: { value: ServerReference[key] };
          }),
        };
      }
      default:
        return false;
    }
  };
}

export function decode(
  readable: ReadableStream<Uint8Array>,
  options: DecodeOptions = {}
) {
  return turbo.decode(readable, {
    plugins: [decodePlugin(options)],
  });
}

export type ServerReference = {
  $$typeof: symbol;
  $$id: string;
  $$bound: null | unknown[];
};

export type ClientReference = {
  $$typeof: symbol;
  $$id: string;
  $$name: string;
};

export type ClientReferenceMetadataFunction = (
  clientReference: ClientReference
) => unknown[];

export type EncodeOptions = {
  clientReferenceMetadata?: ClientReferenceMetadataFunction;
  onError?: (error: unknown) => void;
};

function encodePlugin({
  clientReferenceMetadata,
  onError,
}: EncodeOptions = {}): turbo.EncodePlugin {
  return (value) => {
    if (
      typeof value === "object" &&
      value !== null &&
      "$$typeof" in value &&
      (value.$$typeof === REACT_ELEMENT_SYMBOL ||
        value.$$typeof === REACT_TRANSITIONAL_ELEMENT_SYMBOL)
    ) {
      const node = value as unknown as React.ReactElement;

      switch (typeof node.type) {
        case "symbol":
          switch (node.type) {
            case REACT_FRAGMENT_SYMBOL:
              return ["j", FRAGMENT_SYMBOL, node.key, node.props];
            case REACT_SUSPENSE_SYMBOL:
              return ["j", SUSPENSE_SYMBOL, node.key, node.props];
            default: {
              const reason = new Error("Invalid React.createElementNode");
              onError?.(reason);
              throw reason;
            }
          }
        case "function":
          switch (node.type) {
            default: {
              let result: unknown;
              try {
                result = (node.type as React.FC)(node.props);
              } catch (reason) {
                onError?.(reason);
                result = Promise.reject(reason);
              }

              return ["a", result];
            }
          }
        case "string":
          return ["j", node.type, node.key, node.props];
        case "object": {
          const clientReference = node.type as null | ClientReference;
          if (clientReference?.$$typeof === CLIENT_REFERENCE_SYMBOL) {
            if (!clientReferenceMetadata) {
              const reason = new Error(
                "clientReferenceMetadata is required to encode client references"
              );
              onError?.(reason);
              throw reason;
            }
            const metadata = clientReferenceMetadata(clientReference);
            return ["c", node.key, node.props, ...metadata];
          }
          const reason = new Error("Invalid React.createElementNode");
          onError?.(reason);
          throw reason;
        }
        default: {
          const reason = new Error("Invalid React.createElementNode");
          onError?.(reason);
          throw reason;
        }
      }
    }

    if (
      typeof value === "function" &&
      "$$typeof" in value &&
      value.$$typeof === SERVER_REFERENCE_SYMBOL
    ) {
      // biome-ignore lint/complexity/noBannedTypes: This is appropriate usage of Function
      const serverReference = value as Function & ServerReference;
      return ["s", serverReference.$$id, ...(serverReference.$$bound ?? [])];
    }

    return false;
  };
}

export function encode(
  value: unknown,
  { signal, ...options }: EncodeOptions & { signal?: AbortSignal } = {}
) {
  return turbo.encode(value, {
    signal,
    plugins: [encodePlugin(options)],
  });
}

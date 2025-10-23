import type { SymbolMapperFn } from "@qwik.dev/core/optimizer";

declare global {
  var qwikSymbolMapper: SymbolMapperFn | undefined;
}

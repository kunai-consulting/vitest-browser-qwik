import type { SymbolMapperFn } from "@builder.io/qwik/optimizer";

declare global {
  var qwikSymbolMapper: SymbolMapperFn | undefined;
}

import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["./src/index.ts", "./src/pure.tsx"],
	format: ["esm"],
	dts: true,
	external: [
		"@qwik-client-manifest",
		"@vitest/browser/context",
		"@vitest/browser/utils",
		"vitest",
	],
});

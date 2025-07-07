import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["./src/index.ts", "./src/pure.tsx"],
	format: ["esm"],
	dts: true,
	platform: "browser",
	external: [
		"@builder.io/qwik",
		"@builder.io/qwik/server",
		"@vitest/browser/context", 
		"@vitest/browser/utils", 
		"vitest"
	],
});
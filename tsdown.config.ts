import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"./src/index.ts",
		"./src/pure.tsx",
		"./src/ssr-plugin.ts",
	],
	format: ["esm"],
	dts: true,
	platform: "browser",
});
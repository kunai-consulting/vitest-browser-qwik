import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: ["./src/index.ts", "./src/pure.tsx"],
		format: ["esm"],
		dts: true,
		platform: "browser",
	},
	{
		entry: ["./src/ssr-plugin.ts"],
		format: ["esm"],
		dts: true,
		platform: "neutral",
		external: [
			/^node:/,
			"oxc-parser",
			"oxc-resolver",
			"magic-string",
			"@builder.io/qwik",
			"@builder.io/qwik/optimizer",
			"@builder.io/qwik/server",
			"vitest/config",
			"vitest/node",
		],
	},
]);

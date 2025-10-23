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
			"@qwik.dev/core",
			"@qwik.dev/core/optimizer",
			"@qwik.dev/core/server",
			"vitest/config",
			"vitest/node",
		],
	},
]);

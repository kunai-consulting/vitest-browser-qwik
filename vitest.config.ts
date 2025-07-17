import { qwikVite, symbolMapper } from "@builder.io/qwik/optimizer";
import { register as handleTSXImports } from "tsx/esm/api";
import { defineConfig } from "vitest/config";
import { createSSRTransformPlugin } from "./src/ssr-plugin";

handleTSXImports();

export default defineConfig({
	plugins: [
		createSSRTransformPlugin(),
		qwikVite({
			devTools: {
				clickToSource: ["Alt"],
			},
		}),
		{
			name: "resolve-qwik-symbol-mapper",
			configResolved() {
				globalThis.qwikSymbolMapper = symbolMapper;
			},
		},
	],
	test: {
		browser: {
			enabled: true,
			provider: "playwright",
			instances: [{ browser: "chromium" }],
			headless: true,
		},
		exclude: ["node_modules", "test/ssr-plugin.test.ts"],
	},
});

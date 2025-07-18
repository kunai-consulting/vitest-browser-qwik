import { qwikVite } from "@builder.io/qwik/optimizer";
import { register as handleTSXImports } from "tsx/esm/api";
import { defineConfig } from "vitest/config";
import { testSSR } from "./src/ssr-plugin";

handleTSXImports();

export default defineConfig({
	plugins: [
		testSSR(),
		qwikVite({
			devTools: {
				clickToSource: ["Alt"],
			},
		}),
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

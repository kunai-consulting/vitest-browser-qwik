import { qwikVite } from "@builder.io/qwik/optimizer";
import { defineConfig } from "vitest/config";
import { testSSR } from "./src/ssr-plugin";

export default defineConfig({
	plugins: [testSSR(), qwikVite()],
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

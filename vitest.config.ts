import { qwikVite } from "@qwik.dev/core/optimizer";
import { defineConfig } from "vitest/config";
import { testSSR } from "./src/ssr-plugin";

export default defineConfig({
	plugins: [testSSR(), qwikVite()],
	test: {
		browser: {
			enabled: true,
			provider: "playwright",
			instances: [{ browser: "chromium" }],
			headless: false,
		},
		exclude: ["node_modules", "test/ssr-plugin.test.ts"],
	},
});

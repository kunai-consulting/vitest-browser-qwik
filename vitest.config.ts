import { qwikVite } from "@qwik.dev/core/optimizer";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { testSSR } from "./src/ssr-plugin";

export default defineConfig({
	plugins: [
		testSSR(),
		qwikVite({
			devSsrServer: false,
		}),
	],
	test: {
		testTimeout: 2000,
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [{ browser: "chromium" }],
			headless: false,
		},
		exclude: ["node_modules", "test/ssr-plugin.test.ts"],
	},
});

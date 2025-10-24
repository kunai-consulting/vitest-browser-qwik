import { qwikVite } from "@builder.io/qwik/optimizer";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { testSSR } from "./src/ssr-plugin";

export default defineConfig({
	plugins: [testSSR(), qwikVite()],
	test: {
		testTimeout: 2000,
		browser: {
			enabled: true,
			provider: playwright({
				launchOptions: {
					headless: false,
				},
			}),
			instances: [{ browser: "chromium" }],
		},
		exclude: ["node_modules", "test/ssr-plugin.test.ts"],
	},
});

import { qwikVite } from "@builder.io/qwik/optimizer";
import { defineConfig } from "vitest/config";
import SSRCommand from "./src/ssr";

export default defineConfig({
	plugins: [qwikVite(), SSRCommand()],
	test: {
		browser: {
			enabled: true,
			provider: "playwright",
			instances: [{ browser: "chromium" }],
		},
	},
});

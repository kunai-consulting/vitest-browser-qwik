import { qwikVite } from "@builder.io/qwik/optimizer";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [qwikVite()],
	test: {
		browser: {
			enabled: true,
			provider: "playwright",
			instances: [{ browser: "chromium" }],
		},
	},
});

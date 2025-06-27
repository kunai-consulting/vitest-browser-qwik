import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Run unit tests in Node.js environment (not browser)
		environment: "node",
		// Only include plugin unit tests
		include: ["test/**/ssr-plugin.test.ts"],
		// Exclude browser-specific tests
		exclude: [
			"test/ssr.test.tsx",
			"test/render.test.tsx",
			"test/render-hook.test.tsx",
		],
	},
});

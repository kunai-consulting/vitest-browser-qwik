import { commands } from "@vitest/browser/context";
import { expect, test } from "vitest";

// Extend the commands interface for TypeScript
declare module "@vitest/browser/context" {
	interface BrowserCommands {
		renderSSR: (
			componentPath: string,
			componentName: string,
			props?: Record<string, any>,
		) => Promise<{
			html: string;
		}>;
	}
}

test("SSR renders Counter correctly", async () => {
	const { html } = await commands.renderSSR(
		"./test/fixtures/Counter.tsx",
		"Counter",
		{ initialCount: 5 },
	);

	console.log(html);

	// Test the server-rendered HTML
	expect(html).toContain("Count is");
	expect(html).toContain("5");
	expect(html).toContain("button");
});

test("SSR rendering with HelloWorld", async () => {
	const result = await commands.renderSSR(
		"./test/fixtures/HelloWorld.tsx",
		"HelloWorld",
	);

	expect(result.html).toContain("Hello World");
	expect(result.html).toContain("<div");
});

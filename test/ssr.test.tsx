import { commands } from "@vitest/browser/context";
import { expect, test } from "vitest";
import { Counter } from "./fixtures/Counter";
import { HelloWorld } from "./fixtures/HelloWorld";

test("SSR renders Counter correctly", async () => {
	const { html } = await commands.renderSSR(<Counter initialCount={5} />);

	// Test the server-rendered HTML
	expect(html).toContain("Count is");
	expect(html).toContain("5");
	expect(html).toContain("button");
});

test("SSR renders HelloWorld correctly", async () => {
	const { html } = await commands.renderSSR(<HelloWorld />);

	expect(html).toContain("Hello World");
});

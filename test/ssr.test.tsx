import type { JSXOutput } from "@builder.io/qwik";
import { expect, test } from "vitest";
import { Counter } from "./fixtures/Counter";
import { HelloWorld } from "./fixtures/HelloWorld";

// renderSSR function will be transformed by the plugin
declare function renderSSR(element: JSXOutput): Promise<{ html: string }>;

test("SSR renders Counter correctly", async () => {
	const { html } = await renderSSR(<Counter initialCount={5} />);

	console.log(html);

	// Test the server-rendered HTML
	expect(html).toContain("Count is");
	expect(html).toContain("5");
	expect(html).toContain("button");
});

test("SSR rendering with HelloWorld", async () => {
	const result = await renderSSR(<HelloWorld />);

	expect(result.html).toContain("Hello World");
	expect(result.html).toContain("<div");
});

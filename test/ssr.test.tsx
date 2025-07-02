import { expect, test } from "vitest";
import { renderSSR } from "../src";
import { Counter, TaskCounter } from "./fixtures/Counter";
import { HelloWorld } from "./fixtures/HelloWorld";

test("SSR renders Counter correctly", async () => {
	const screen = await renderSSR(<Counter initialCount={5} />);

	expect(screen.container.innerHTML).toContain("Count is");
	expect(screen.container.innerHTML).toContain("5");
	expect(screen.container.innerHTML).toContain("button");
});

test("SSR rendering with HelloWorld", async () => {
	const screen = await renderSSR(<HelloWorld />);

	expect(screen.container.innerHTML).toContain("Hello World");
	expect(screen.container.innerHTML).toContain("<div");
});

test("Incrementing count from task", async () => {
	const screen = await renderSSR(<TaskCounter />);

	await expect(screen.getByRole("button")).toHaveTextContent("5");
});

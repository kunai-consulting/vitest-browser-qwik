import { expect, test } from "vitest";
import { renderSSR } from "../src";
import { Counter } from "./fixtures/Counter";
import { HelloWorld } from "./fixtures/HelloWorld";

test("SSR with DOM assertions - HelloWorld", async () => {
	// Directly get a screen from SSR
	const screen = await renderSSR(<HelloWorld />);

	// Now we can use Vitest browser assertions on the SSR HTML
	await expect.element(screen.getByText("Hello World")).toBeVisible();
	expect(screen.container.innerHTML).toContain("Hello World");

	screen.unmount();
});

test("SSR with DOM assertions - Counter with props", async () => {
	// Directly get a screen from SSR with props
	const screen = await renderSSR(<Counter initialCount={42} />);

	// Test the server-rendered content with browser assertions
	await expect.element(screen.getByText("42")).toBeVisible();
	await expect.element(screen.getByRole("button")).toBeVisible();

	// Verify the HTML structure
	expect(screen.container.innerHTML).toContain("42");
	expect(screen.container.innerHTML).toContain("button");

	screen.unmount();
});

test("SSR HTML can be queried and debugged", async () => {
	const screen = await renderSSR(<Counter initialCount={5} />);

	// Test various query methods work
	const countText = screen.getByText(/Count is/);
	const button = screen.getByRole("button");

	await expect.element(countText).toBeVisible();
	await expect.element(button).toBeVisible();

	// Debug functionality works
	screen.debug(); // This should print the DOM

	// Fragment functionality works
	const fragment = screen.asFragment();
	expect(fragment.textContent).toContain("Count is 5");

	screen.unmount();
});

test("Multiple SSR components in same test", async () => {
	const helloScreen = await renderSSR(<HelloWorld />);
	const counterScreen = await renderSSR(<Counter initialCount={10} />);

	await expect.element(helloScreen.getByText("Hello World")).toBeVisible();
	await expect.element(counterScreen.getByText("Count is 10")).toBeVisible();

	helloScreen.unmount();
	counterScreen.unmount();
});

test("SSR Counter interactivity test", async () => {
	const screen = await renderSSR(<Counter initialCount={5} />);

	// Verify initial state
	await expect.element(screen.getByText("Count is 5")).toBeVisible();

	// Try to click the button
	const button = screen.getByRole("button");
	await button.click();

	// Check if count increased (this will likely fail since there's no hydration)
	await expect.element(screen.getByText("Count is 6")).toBeVisible();

	screen.unmount();
});

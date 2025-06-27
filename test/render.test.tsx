import { page } from "@vitest/browser/context";
// import { Button } from "react-aria-components";
import { expect, test } from "vitest";
import { render } from "../src/index";
import { Counter } from "./fixtures/Counter";
import { HelloWorld } from "./fixtures/HelloWorld";
import { component$, useSignal } from "@builder.io/qwik";

test("renders simple component", async () => {
	const screen = render(<HelloWorld />);
	await expect.element(page.getByText("Hello World")).toBeVisible();
	expect(screen.container).toMatchSnapshot();
});

test("renders counter", async () => {
	const screen = render(<Counter initialCount={1} />);

	await expect.element(screen.getByText("Count is 1")).toBeVisible();
	await screen.getByRole("button", { name: "Increment" }).click();
	await expect.element(screen.getByText("Count is 2")).toBeVisible();
});

export const InteractiveCounter = component$<{ initialCount: number }>(
	({ initialCount = 0 }) => {
		const count = useSignal(initialCount);

		return (
			<>
				<div>Count is {count.value}</div>
				<button type="button" onClick$={() => count.value++}>
					Increment
				</button>
			</>
		);
	},
);

test("renders local counter", async () => {
	const screen = render(<InteractiveCounter initialCount={1} />);

	await expect.element(screen.getByText("Count is 1")).toBeVisible();
	await screen.getByRole("button", { name: "Increment" }).click();
	await expect.element(screen.getByText("Count is 2")).toBeVisible();
});


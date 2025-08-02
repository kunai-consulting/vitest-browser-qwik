import { component$, useSignal, useTask$ } from "@builder.io/qwik";
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

const LocalCounter = component$(() => {
	const count = useSignal(0);

	useTask$(() => {
		console.log("FROM THE LOCAL TASK COUNTER");
		count.value = count.value + 5;
	});

	return (
		<button type="button" onClick$={() => count.value++}>
			Count is {count.value}
		</button>
	);
});

test("Incrementing count from local component", async () => {
	const screen = await renderSSR(<LocalCounter />);

	await expect(screen.getByRole("button")).toHaveTextContent("5");
});

const externalMessage = "Hello from external scope!";
const externalValue = 99;

const ComponentWithExternalRefs = component$((props: { randomNum: number }) => {
	const count = useSignal(externalValue);
	return (
		<div>
			<p>{externalMessage}</p>
			<span data-testid="count">
				Count: {count.value}, {props.randomNum}
			</span>
		</div>
	);
});

test("Local component with external variable references", async () => {
	const screen = await renderSSR(
		<ComponentWithExternalRefs randomNum={77192} />,
	);

	expect(screen.container.innerHTML).toContain("Hello from external scope!");
	expect(screen.container.innerHTML).toContain("99");
	expect(screen.container.innerHTML).toContain("77192");
});

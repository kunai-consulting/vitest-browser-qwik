import { component$, isServer, useSignal, useTask$ } from "@qwik.dev/core";

export const Counter = component$<{ initialCount: number }>(
	({ initialCount = 0 }) => {
		const count = useSignal(initialCount);

		console.log("Counter component rendering on server side");
		console.log("Node.js environment:", typeof process !== "undefined");
		console.log("Window object exists:", typeof window !== "undefined");
		console.log("Initial count:", initialCount);
		console.log("Current count value:", count.value);

		useTask$(() => {
			if (isServer) {
				console.log("INSIDE TASK");
			}

			console.log("IS SERVER", isServer);
			console.log("IS CLIENT", !isServer);
		});

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

// Create a separate interactive Counter for browser tests
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

export const TaskCounter = component$(() => {
	const count = useSignal(0);

	useTask$(() => {
		console.log("FROM THE TASK COUNTER");
		count.value = count.value + 5;
	});

	return (
		<button type="button" onClick$={() => count.value++}>
			Count is {count.value}
		</button>
	);
});

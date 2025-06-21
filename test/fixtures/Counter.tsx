import { component$, useSignal } from "@builder.io/qwik";

export const Counter = component$<{ initialCount: number }>(
	({ initialCount = 0 }) => {
		const count = useSignal(initialCount);

		return (
			<>
				<div>
					Count is
					{count.value}
				</div>
				<button type="button" onClick$={() => count.value++}>
					Increment
				</button>
			</>
		);
	},
);

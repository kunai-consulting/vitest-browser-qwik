import { $, type QRL, type Signal } from "@qwik.dev/core";

export function useCounter({ countSignal }: { countSignal: Signal<number> }): {
	count: Signal<number>;
	increment$: QRL<() => number>;
} {
	const count = countSignal;

	const increment$ = $(() => count.value++);

	return { count, increment$ };
}

import { $, type Signal } from "@builder.io/qwik";

export function useCounter({ countSignal }: { countSignal: Signal<number> }): {
	count: Signal<number>;
	increment: () => void;
} {
	const count = countSignal;

	const increment = $(() => count.value++);

	return { count, increment };
}

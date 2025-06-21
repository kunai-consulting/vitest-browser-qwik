import type { JSXOutput } from "@builder.io/qwik";
import { render as qwikRender } from "@builder.io/qwik";
import type { Locator, LocatorSelectors } from "@vitest/browser/context";
import {
	debug,
	getElementLocatorSelectors,
	type PrettyDOMOptions,
} from "@vitest/browser/utils";

export interface RenderResult extends LocatorSelectors {
	container: HTMLElement;
	baseElement: HTMLElement;
	debug: (
		el?: HTMLElement | HTMLElement[] | Locator | Locator[],
		maxLength?: number,
		options?: PrettyDOMOptions,
	) => void;
	unmount: () => void;
	asFragment: () => DocumentFragment;
}

export interface RenderOptions {
	container?: HTMLElement;
	baseElement?: HTMLElement;
}

export function render(
	ui: JSXOutput,
	{ container, baseElement }: RenderOptions = {},
): RenderResult {
	if (!baseElement) {
		baseElement = document.body;
	}

	if (!container) {
		container = baseElement.appendChild(document.createElement("div"));
	}

	qwikRender(container, ui);

	return {
		container,
		baseElement,
		debug: (el, maxLength, options) => debug(el, maxLength, options),
		unmount: () => {
			container.innerHTML = "";
			if (container.parentNode === document.body) {
				document.body.removeChild(container);
			}
		},
		asFragment: () => {
			return document
				.createRange()
				.createContextualFragment(container.innerHTML);
		},
		...getElementLocatorSelectors(baseElement),
	};
}

export interface RenderHookResult<Result> {
	result: Result;
	unmount: () => void;
}

export function renderHook<Result>(
	hook: () => Result,
): RenderHookResult<Result> {
	const result = hook();

	return {
		result,
		unmount: () => {
			// Qwik handles cleanup automatically
		},
	};
}

import type { JSXOutput } from "@builder.io/qwik";
import { render as qwikRender } from "@builder.io/qwik";
import { getQwikLoaderScript } from "@builder.io/qwik/server";
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

export interface SSRRenderOptions {
	container?: HTMLElement;
	baseElement?: HTMLElement;
}

// Track mounted components for cleanup
const mountedContainers = new Set<HTMLElement>();
let qwikLoaderInjected = false;

function csrQwikLoader() {
	if (qwikLoaderInjected) return;

	const script = document.createElement("script");
	script.innerHTML = getQwikLoaderScript();
	document.head.appendChild(script);
	qwikLoaderInjected = true;
}

export function render(
	ui: JSXOutput,
	{ container, baseElement }: RenderOptions = {},
): RenderResult {
	csrQwikLoader();

	if (!baseElement) {
		baseElement = document.body;
	}

	if (!container) {
		container = baseElement.appendChild(document.createElement("div"));
	}

	qwikRender(container, ui);

	// Track this container for cleanup
	mountedContainers.add(container);

	const unmount = () => {
		container.innerHTML = "";
		mountedContainers.delete(container);
		if (container.parentNode === document.body) {
			document.body.removeChild(container);
		}
	};

	return {
		container,
		baseElement,
		debug: (el, maxLength, options) => debug(el, maxLength, options),
		unmount,
		asFragment: () => {
			return document
				.createRange()
				.createContextualFragment(container.innerHTML);
		},
		...getElementLocatorSelectors(baseElement),
	};
}

export function renderSSRHTML(
	html: string,
	{ container, baseElement }: SSRRenderOptions = {},
): RenderResult {
	if (!baseElement) {
		baseElement = document.body;
	}

	if (!container) {
		container = baseElement.appendChild(document.createElement("div"));
	}

	// Inject the server-rendered HTML directly into the container
	container.innerHTML = html;

	// Track this container for cleanup
	mountedContainers.add(container);

	const unmount = () => {
		container.innerHTML = "";
		mountedContainers.delete(container);
		if (container.parentNode === document.body) {
			document.body.removeChild(container);
		}
	};

	return {
		container,
		baseElement,
		debug: (el, maxLength, options) => debug(el, maxLength, options),
		unmount,
		asFragment: () => {
			return document
				.createRange()
				.createContextualFragment(container.innerHTML);
		},
		...getElementLocatorSelectors(baseElement),
	};
}

// Convenience function that combines SSR rendering with DOM injection
export async function renderSSR(
	component: JSXOutput,
	options: SSRRenderOptions = {},
): Promise<RenderResult> {
	// Import the renderSSR function from the index (this will be transformed by the plugin)
	const { renderSSR: serverRenderSSR } = await import("./index");

	// The plugin transforms this to return a RenderResult directly
	return await serverRenderSSR(component);
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

// Cleanup function to be called after each test
export function cleanup(): void {
	mountedContainers.forEach((container) => {
		container.innerHTML = "";
		if (container.parentNode === document.body) {
			document.body.removeChild(container);
		}
	});
	mountedContainers.clear();
}

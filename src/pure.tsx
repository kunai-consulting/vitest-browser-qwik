import type { JSXOutput } from "@builder.io/qwik";
import { component$, render as qwikRender } from "@builder.io/qwik";
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

const mountedContainers = new Set<HTMLElement>();
let qwikLoaderInjected = false;

function csrQwikLoader() {
	if (qwikLoaderInjected) return;

	const script = document.createElement("script");
	script.innerHTML = getQwikLoaderScript();
	document.head.appendChild(script);
	qwikLoaderInjected = true;
}

function createRenderResult(
	container: HTMLElement,
	baseElement: HTMLElement,
): RenderResult {
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

function setupContainer(
	baseElement?: HTMLElement,
	container?: HTMLElement,
): { container: HTMLElement; baseElement: HTMLElement } {
	if (!baseElement) {
		baseElement = document.body;
	}

	if (!container) {
		container = baseElement.appendChild(document.createElement("div"));
	}

	return { container, baseElement };
}

export function render(
	ui: JSXOutput,
	{ container, baseElement }: RenderOptions = {},
): RenderResult {
	csrQwikLoader();

	const setup = setupContainer(baseElement, container);
	qwikRender(setup.container, ui);

	return createRenderResult(setup.container, setup.baseElement);
}

export function renderServerHTML(
	html: string,
	{ container, baseElement }: SSRRenderOptions = {},
): RenderResult {
	const setup = setupContainer(baseElement, container);

	setup.container.innerHTML = html;

	return createRenderResult(setup.container, setup.baseElement);
}

export interface RenderHookResult<Result> {
	result: Result;
	unmount: () => void;
}

export async function renderHook<Result>(
	hook: () => Result,
): Promise<RenderHookResult<Result>> {
	const resultContainer = { value: undefined as Result | undefined };
	let resolveRender: () => void;

	const renderPromise = new Promise<void>((resolve) => {
		resolveRender = resolve;
	});

	const TestHookComponent = component$(() => {
		const result = hook();
		resultContainer.value = result;
		resolveRender();
		return <div data-testid="hook-result"></div>;
	});

	const screen = render(<TestHookComponent />);

	// Wait for the component to actually render
	await renderPromise;

	return {
		result:
			resultContainer.value ??
			(() => {
				throw new Error("Hook result not available");
			})(),
		unmount: () => {
			screen.unmount();
		},
	};
}

export function cleanup(): void {
	mountedContainers.forEach((container) => {
		container.innerHTML = "";
		if (container.parentNode === document.body) {
			document.body.removeChild(container);
		}
	});
	mountedContainers.clear();
}

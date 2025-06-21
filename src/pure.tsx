import type { Component, JSXOutput, RenderOptions } from "@builder.io/qwik";
import type { Locator, LocatorSelectors } from "@vitest/browser/context";
import {
	debug,
	getElementLocatorSelectors,
	type PrettyDOMOptions,
} from "@vitest/browser/utils";

export interface Options extends RenderOptions {
	container?: HTMLElement;
	baseElement?: HTMLElement;
	wrapper?: Component;
}

export type DebugFn = (
	baseElement?: HTMLElement | HTMLElement[],
	maxLength?: number,
	options?: PrettyDOMOptions,
) => void;

export type RenderResult = {
	asFragment: () => DocumentFragment;
	container: HTMLElement;
	baseElement: HTMLElement;
	debug: DebugFn;
	unmount: () => void;
};

export type ComponentRef = {
	container: HTMLElement;
	componentCleanup: () => void;
};

// export interface RenderResult extends LocatorSelectors {
// 	container: HTMLElement;
// 	baseElement: HTMLElement;
// 	debug: (
// 		el?: HTMLElement | HTMLElement[] | Locator | Locator[],
// 		maxLength?: number,
// 		options?: PrettyDOMOptions,
// 	) => void;
// 	unmount: () => void;
// 	rerender: (ui: React.ReactNode) => void;
// 	asFragment: () => DocumentFragment;
// }

export interface ComponentRenderOptions {
	container?: HTMLElement;
	baseElement?: HTMLElement;
	wrapper?: JSXOutput;
}

// Ideally we'd just use a WeakMap where containers are keys and roots are values.
// We use two variables so that we can bail out in constant time when we render with a new container (most common use case)
const mountedContainers = new Set<Container>();
const mountedRootEntries: {
	container: Container;
	root: ReturnType<typeof createConcurrentRoot>;
}[] = [];

export function render(
	ui: JSXOutput,
	{
		container,
		baseElement,
		wrapper: WrapperComponent,
	}: ComponentRenderOptions = {},
): RenderResult {
	if (!baseElement) {
		// default to document.body instead of documentElement to avoid output of potentially-large
		// head elements (such as JSS style blocks) in debug output
		baseElement = document.body;
	}

	if (!container) {
		container = baseElement.appendChild(document.createElement("div"));
	}

	let root: QwikRoot;

	if (!mountedContainers.has(container)) {
		root = createConcurrentRoot(container);

		mountedRootEntries.push({ container, root });
		// we'll add it to the mounted containers regardless of whether it's actually
		// added to document.body so the cleanup method works regardless of whether
		// they're passing us a custom container or not.
		mountedContainers.add(container);
	} else {
		mountedRootEntries.forEach((rootEntry) => {
			// Else is unreachable since `mountedContainers` has the `container`.
			// Only reachable if one would accidentally add the container to `mountedContainers` but not the root to `mountedRootEntries`
			/* istanbul ignore else */
			if (rootEntry.container === container) {
				root = rootEntry.root;
			}
		});
	}

	return {
		container,
		baseElement,
		debug: (el, maxLength, options) => debug(el, maxLength, options),
		unmount: () => {
			root.unmount();
		},
		asFragment: () => {
			return document
				.createRange()
				.createContextualFragment(container.innerHTML);
		},
		...getElementLocatorSelectors(baseElement),
	};
}

export interface RenderHookOptions<Props> extends ComponentRenderOptions {
	/**
	 * The argument passed to the renderHook callback. Can be useful if you plan
	 * to use the rerender utility to change the values passed to your hook.
	 */
	initialProps?: Props | undefined;
}

export interface RenderHookResult<Result, Props> {
	/**
	 * This is a stable reference to the latest value returned by your renderHook
	 * callback
	 */
	result: {
		/**
		 * The value returned by your renderHook callback
		 */
		current: Result;
	};
	/**
	 * Unmounts the test component. This is useful for when you need to test
	 * any cleanup your useEffects have.
	 */
	unmount: () => void;
}

export function renderHook<Props, Result>(
	renderCallback: (initialProps?: Props) => Result,
	options: RenderHookOptions<Props> = {},
): RenderHookResult<Result, Props> {
	const { initialProps, ...renderOptions } = options;

	return { result, unmount };
}

export function cleanup(): void {
	mountedRootEntries.forEach(({ root, container }) => {
		root.unmount();
		if (container.parentNode === document.body) {
			document.body.removeChild(container);
		}
	});
	mountedRootEntries.length = 0;
	mountedContainers.clear();
}

interface QwikRoot {
	render: (element: JSXOutput) => void;
	unmount: () => void;
}

function createConcurrentRoot(container: HTMLElement): QwikRoot {
	// I think this is the render function for Qwik version?
	const root = ReactDOMClient.createRoot(container);

	return {
		render(element: JSXOutput) {
			root.render(element);
		},
		unmount() {
			root.unmount();
		},
	};
}

export interface RenderConfiguration {
	reactStrictMode: boolean;
}

const config: RenderConfiguration = {
	reactStrictMode: false,
};

// can prob be removed
function strictModeIfNeeded(innerElement: React.ReactNode) {
	return config.reactStrictMode
		? React.createElement(React.StrictMode, null, innerElement)
		: innerElement;
}

// maybe removed?
function wrapUiIfNeeded(
	innerElement: React.ReactNode,
	wrapperComponent?: React.JSXElementConstructor<{
		children: React.ReactNode;
	}>,
) {
	return wrapperComponent
		? React.createElement(wrapperComponent, null, innerElement)
		: innerElement;
}

export function configure(customConfig: Partial<RenderConfiguration>): void {
	Object.assign(config, customConfig);
}

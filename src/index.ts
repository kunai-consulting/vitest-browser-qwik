import type { JSXOutput } from "@builder.io/qwik";
import { page } from "@vitest/browser/context";
import { beforeEach } from "vitest";
import { cleanup, render } from "./pure";

// renderSSR function will be transformed by the plugin
export declare function renderSSR(
	jsxNode: JSXOutput,
): Promise<{ html: string }>;

export type { RenderResult } from "./pure";
export { cleanup, render, renderHook } from "./pure";

page.extend({
	render,
	[Symbol.for("vitest:component-cleanup")]: cleanup,
});

beforeEach(() => {
	cleanup();
});

declare module "@vitest/browser/context" {
	interface BrowserPage {
		render: typeof render;
	}

	interface BrowserCommands {
		renderOnServer: (component: JSXOutput) => Promise<{
			html: string;
		}>;
	}
}

import type { JSXOutput } from "@builder.io/qwik";
import { page } from "@vitest/browser/context";
import { beforeEach } from "vitest";
import {
	cleanup,
	render,
	renderSSR as renderSSRComponent,
	renderSSRHTML,
} from "./pure";

// renderSSR function will be transformed by the plugin
export declare function renderSSR(
	jsxNode: JSXOutput,
): Promise<import("./pure").RenderResult>;

export type { RenderResult, SSRRenderOptions } from "./pure";
export {
	cleanup,
	render,
	renderHook,
	renderSSR as renderSSRDirect,
	renderSSRHTML,
} from "./pure";

page.extend({
	render,
	renderSSRHTML,
	[Symbol.for("vitest:component-cleanup")]: cleanup,
});

beforeEach(() => {
	cleanup();
});

declare module "@vitest/browser/context" {
	interface BrowserPage {
		render: typeof render;
		renderSSRHTML: typeof renderSSRHTML;
	}

	interface BrowserCommands {
		renderOnServer: (component: JSXOutput) => Promise<{
			html: string;
		}>;
	}
}

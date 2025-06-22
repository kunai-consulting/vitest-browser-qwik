import type { JSXOutput } from "@builder.io/qwik";
import { page } from "@vitest/browser/context";
import { beforeEach } from "vitest";
import { cleanup, render, renderServerHTML } from "./pure";

export declare function renderSSR(
	jsxNode: JSXOutput,
): Promise<import("./pure").RenderResult>;

export type { RenderResult, SSRRenderOptions } from "./pure";
export {
	cleanup,
	render,
	renderHook,
	renderServerHTML as renderSSRHTML,
} from "./pure";

page.extend({
	render,
	renderServerHTML: renderServerHTML,
	[Symbol.for("vitest:component-cleanup")]: cleanup,
});

beforeEach(() => {
	cleanup();
});

declare module "@vitest/browser/context" {
	interface BrowserPage {
		render: typeof render;
		renderServerHTML: typeof renderServerHTML;
	}

	interface BrowserCommands {
		renderOnServer: (component: JSXOutput) => Promise<{
			html: string;
		}>;
	}
}

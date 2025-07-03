import type { JSXOutput } from "@builder.io/qwik";
import { page } from "@vitest/browser/context";
import { beforeEach } from "vitest";
import { cleanup, render, renderServerHTML } from "./pure";

/** This is replaced with actual code by the ssr-plugin.ts transform */
export declare function renderSSR(
	jsxNode: JSXOutput,
): Promise<import("./pure").RenderResult>;

export type { RenderResult, SSRRenderOptions } from "./pure";
export {
	cleanup,
	render,
	renderHook,
	renderServerHTML,
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
}

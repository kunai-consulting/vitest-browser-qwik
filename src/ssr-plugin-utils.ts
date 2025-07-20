import { dirname, relative, resolve } from "node:path";
import type { Component } from "@builder.io/qwik";
import type {
	BindingIdentifier,
	CallExpression,
	ExpressionStatement,
	FunctionType,
	ImportDeclaration,
	ImportDefaultSpecifier,
	ImportSpecifier,
	JSXAttribute,
	JSXAttributeItem,
	JSXElement,
	JSXExpressionContainer,
	Node,
	Function as OxcFunction,
	Span,
	VariableDeclarator,
} from "@oxc-project/types";
import { ResolverFactory } from "oxc-resolver";
import type { BrowserCommandContext } from "vitest/node";

const resolver = new ResolverFactory({
	extensions: [".tsx", ".ts", ".jsx", ".js"],
});

// Type guards for better type safety
export function isFunction(node: Node): node is OxcFunction {
	const functionTypes: FunctionType[] = [
		"FunctionDeclaration",
		"FunctionExpression",
		"TSDeclareFunction",
		"TSEmptyBodyFunctionExpression",
	];
	return functionTypes.includes(node.type as FunctionType);
}

export function isCallExpression(node: Node): node is CallExpression {
	return node.type === "CallExpression";
}

export function isImportDeclaration(node: Node): node is ImportDeclaration {
	return node.type === "ImportDeclaration";
}

export function isVariableDeclarator(node: Node): node is VariableDeclarator {
	return node.type === "VariableDeclarator";
}

export function isExpressionStatement(node: Node): node is ExpressionStatement {
	return node.type === "ExpressionStatement";
}

export function isJSXElement(node: Node): node is JSXElement {
	return node.type === "JSXElement";
}

export function isJSXExpressionContainer(
	node: Node,
): node is JSXExpressionContainer {
	return node.type === "JSXExpressionContainer";
}

export function traverseChildren(
	node: Node,
	callback: (child: Node) => boolean | undefined,
): boolean {
	for (const key in node) {
		const child = (node as unknown as Record<string, unknown>)[key];
		if (Array.isArray(child)) {
			for (const item of child) {
				if (item && typeof item === "object" && callback(item as Node)) {
					return true;
				}
			}
		} else if (child && typeof child === "object") {
			if (callback(child as Node)) return true;
		}
	}
	return false;
}

export function hasRenderSSRCallInAST(ast: unknown, code: string): boolean {
	const renderSSRIdentifiers = new Set<string>(["renderSSR"]);
	let hasRenderSSRCallInCode = false;

	function walkForDetection(node: Node): boolean {
		if (!node || typeof node !== "object") return false;

		// Track renderSSR imports and aliases
		if (isImportDeclaration(node)) {
			if (!node.source?.value || !node.specifiers) return false;

			for (const spec of node.specifiers) {
				if (spec.type === "ImportSpecifier") {
					const importSpec = spec as ImportSpecifier;
					if (importSpec.imported.type !== "Identifier") continue;
					if (importSpec.imported.name === "renderSSR") {
						renderSSRIdentifiers.add(importSpec.local.name);
					}
				} else if (spec.type === "ImportDefaultSpecifier") {
					const defaultSpec = spec as ImportDefaultSpecifier;
					if (defaultSpec.local.name.toLowerCase().includes("renderssr")) {
						renderSSRIdentifiers.add(defaultSpec.local.name);
					}
				}
			}
		}

		// Track declared renderSSR functions (including TypeScript declares)
		if (isFunction(node)) {
			if (node.id?.name === "renderSSR") {
				renderSSRIdentifiers.add("renderSSR");
			}
		}

		// Track variable aliases
		if (isVariableDeclarator(node)) {
			if (node.id.type !== "Identifier") return false;
			if (node.init?.type !== "Identifier") return false;
			if (!renderSSRIdentifiers.has(node.init.name)) return false;

			const bindingId = node.id as BindingIdentifier;
			renderSSRIdentifiers.add(bindingId.name);
		}

		// Check for renderSSR calls
		if (isCallExpression(node)) {
			if (node.callee.type === "Identifier") {
				if (renderSSRIdentifiers.has(node.callee.name)) {
					hasRenderSSRCallInCode = true;
					return true;
				}
			}
		}

		// Recursively check children
		return traverseChildren(node, walkForDetection);
	}

	walkForDetection(ast as Node);

	// If we have renderSSR calls, transform the code
	// This handles both cases:
	// 1. Explicit imports/declares with calls
	// 2. Direct renderSSR calls (common in tests)
	const hasCallsInString = code.includes("renderSSR(");
	const result = hasRenderSSRCallInCode || hasCallsInString;

	return result;
}

export function extractPropsFromJSX(
	attributes: JSXAttributeItem[],
	sourceCode: string,
): Record<string, string> {
	const props: Record<string, string> = {};

	for (const attr of attributes) {
		if (attr.type !== "JSXAttribute") continue;

		const jsxAttr = attr as JSXAttribute;
		if (jsxAttr.name.type !== "JSXIdentifier") continue;

		const propName = jsxAttr.name.name;
		if (!jsxAttr.value) continue;

		if (isJSXExpressionContainer(jsxAttr.value)) {
			// Extract the raw source code of the expression
			if (jsxAttr.value.expression.type !== "JSXEmptyExpression") {
				const exprSpan = jsxAttr.value.expression as Node & Span;
				const expressionCode = sourceCode.slice(exprSpan.start, exprSpan.end);
				props[propName] = expressionCode;
			}
		} else if (jsxAttr.value.type === "Literal") {
			// For string literals, use the actual value
			const literal = jsxAttr.value as { value: unknown };
			props[propName] = JSON.stringify(literal.value);
		}
	}

	return props;
}

export function isTestFile(id: string): boolean {
	return id.includes(".test.") || id.includes(".spec.");
}

function fallbackResolveComponentPath(
	importPath: string,
	testFileId: string,
): string {
	if (!importPath.startsWith(".")) {
		// Absolute import, add extension if needed
		return importPath.endsWith(".tsx") || importPath.endsWith(".ts")
			? importPath
			: `${importPath}.tsx`;
	}

	// Relative import - resolve relative to test file
	const testFileDir = dirname(testFileId);
	const resolvedPath = resolve(testFileDir, importPath);
	const projectRoot = process.cwd();
	let componentPath = `./${relative(projectRoot, resolvedPath)}`;

	// Add extension if needed
	if (!componentPath.endsWith(".tsx") && !componentPath.endsWith(".ts")) {
		componentPath += ".tsx";
	}

	return componentPath;
}

export function resolveComponentPath(
	importPath: string,
	testFileId: string,
): string {
	const testFileDir = dirname(testFileId);
	const result = resolver.sync(testFileDir, importPath);

	if (result.error || !result.path) {
		const errorMsg = result.error || "No path resolved";

		console.warn(
			`[oxc-resolver] Could not resolve "${importPath}" from "${testFileId}": ${errorMsg}. Using fallback resolution. If this is not a test file, this might be a bug.`,
		);

		return fallbackResolveComponentPath(importPath, testFileId);
	}

	const projectRoot = process.cwd();
	const relativePath = relative(projectRoot, result.path);

	return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

export function hasCommandsImport(node: Node): boolean {
	if (!isImportDeclaration(node)) return false;

	if (node.source?.value !== "@vitest/browser/context") return false;
	if (!node.specifiers) return false;

	return node.specifiers.some(
		(spec) =>
			spec.type === "ImportSpecifier" &&
			spec.imported.type === "Identifier" &&
			spec.imported.name === "commands",
	);
}

export async function renderComponentToSSR(
	ctx: BrowserCommandContext,
	Component: Component,
	props: Record<string, unknown> = {},
): Promise<{ html: string }> {
	const viteServer = ctx.project.vite;

	const qwikModule = await viteServer.ssrLoadModule("@builder.io/qwik");
	const { jsx } = qwikModule;
	const jsxElement = jsx(Component, props);

	const serverModule = await viteServer.ssrLoadModule(
		"@builder.io/qwik/server",
	);
	const { renderToString } = serverModule;

	const result = await renderToString(jsxElement, {
		containerTagName: "div",
		base: "/",
		qwikLoader: { include: "always" },
		symbolMapper: globalThis.qwikSymbolMapper,
	});

	return { html: result.html };
}

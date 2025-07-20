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
		} else if (child && typeof child === "object" && callback(child as Node)) {
			return true;
		}
	}
	return false;
}

export function hasRenderSSRCallInAST(ast: Node, code: string): boolean {
	const renderSSRIdentifiers = new Set<string>(["renderSSR"]);
	let hasRenderSSRCallInCode = false;

	function walkForDetection(node: Node): boolean {
		if (!node || typeof node !== "object") return false;

		if (isImportDeclaration(node) && node.source?.value && node.specifiers) {
			for (const spec of node.specifiers) {
				if (spec.type === "ImportSpecifier") {
					const importSpec = spec as ImportSpecifier;
					if (
						importSpec.imported.type === "Identifier" &&
						importSpec.imported.name === "renderSSR"
					) {
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

		if (isFunction(node) && node.id?.name === "renderSSR") {
			renderSSRIdentifiers.add("renderSSR");
		}

		if (isVariableDeclarator(node)) {
			if (
				node.id.type === "Identifier" &&
				node.init?.type === "Identifier" &&
				renderSSRIdentifiers.has(node.init.name)
			) {
				const bindingId = node.id as BindingIdentifier;
				renderSSRIdentifiers.add(bindingId.name);
			}
		}

		if (
			isCallExpression(node) &&
			node.callee.type === "Identifier" &&
			renderSSRIdentifiers.has(node.callee.name)
		) {
			hasRenderSSRCallInCode = true;
			return true;
		}

		return traverseChildren(node, walkForDetection);
	}

	walkForDetection(ast);

	return hasRenderSSRCallInCode || code.includes("renderSSR(");
}

export function extractPropsFromJSX(
	attributes: JSXAttributeItem[],
	sourceCode: string,
): Record<string, string> {
	const props: Record<string, string> = {};

	for (const attr of attributes) {
		if (attr.type !== "JSXAttribute") continue;

		const jsxAttr = attr as JSXAttribute;
		if (jsxAttr.name.type !== "JSXIdentifier" || !jsxAttr.value) continue;

		const propName = jsxAttr.name.name;

		if (
			isJSXExpressionContainer(jsxAttr.value) &&
			jsxAttr.value.expression.type !== "JSXEmptyExpression"
		) {
			const exprSpan = jsxAttr.value.expression as Node & Span;
			const expressionCode = sourceCode.slice(exprSpan.start, exprSpan.end);
			props[propName] = expressionCode;
		} else if (jsxAttr.value.type === "Literal") {
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
		return importPath.endsWith(".tsx") || importPath.endsWith(".ts")
			? importPath
			: `${importPath}.tsx`;
	}

	const testFileDir = dirname(testFileId);
	const resolvedPath = resolve(testFileDir, importPath);
	const projectRoot = process.cwd();
	let componentPath = `./${relative(projectRoot, resolvedPath)}`;

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
		console.warn(
			`[oxc-resolver] Could not resolve "${importPath}" from "${testFileId}": ${result.error || "No path resolved"}. Using fallback resolution.`,
		);
		return fallbackResolveComponentPath(importPath, testFileId);
	}

	const projectRoot = process.cwd();
	const relativePath = relative(projectRoot, result.path);

	return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

export function hasCommandsImport(node: Node): boolean {
	if (
		!isImportDeclaration(node) ||
		node.source?.value !== "@vitest/browser/context" ||
		!node.specifiers
	) {
		return false;
	}

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

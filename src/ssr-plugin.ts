import { resolve } from "node:path";
import { symbolMapper } from "@builder.io/qwik/optimizer";
import type { Node } from "@oxc-project/types";
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import type { Plugin } from "vitest/config";
import type { BrowserCommand } from "vitest/node";
import {
	extractPropsFromJSX,
	hasCommandsImport,
	hasRenderSSRCallInAST,
	isCallExpression,
	isExpressionStatement,
	isImportDeclaration,
	isJSXElement,
	isTestFile,
	isVariableDeclarator,
	renderComponentToSSR,
	resolveComponentPath,
	traverseChildren,
} from "./ssr-plugin-utils";

type ComponentFormat = BrowserCommand<
	[
		componentPath: string,
		componentName: string,
		props?: Record<string, unknown>,
	]
>;

type LocalComponentFormat = BrowserCommand<
	[
		testFilePath: string,
		componentName: string,
		allLocalComponents: string[],
		props?: Record<string, unknown>,
	]
>;

const renderSSRCommand: ComponentFormat = async (
	ctx,
	componentPath: string,
	componentName: string,
	props: Record<string, unknown> = {},
) => {
	const projectRoot = process.cwd();
	const absoluteComponentPath = resolve(projectRoot, componentPath);
	const viteServer = ctx.project.vite;

	// it does not replace env vars in the test file, so we need to do it manually
	if (!viteServer.config.define) return;
	for (const [key, value] of Object.entries(viteServer.config.env)) {
		viteServer.config.define[`__vite_ssr_import_meta__.env.${key}`] =
			JSON.stringify(value);
	}

	const componentModule = await viteServer.ssrLoadModule(absoluteComponentPath);
	const Component = componentModule[componentName];

	if (!Component) {
		throw new Error(
			`Component "${componentName}" not found in ${absoluteComponentPath}`,
		);
	}

	return await renderComponentToSSR(ctx, Component, props);
};

const renderSSRLocalCommand: LocalComponentFormat = async (
	ctx,
	testFilePath: string,
	componentName: string,
	allLocalComponents: string[],
	props: Record<string, unknown> = {},
) => {
	const viteServer = ctx.project.vite;

	// it does not replace env vars in the test file, so we need to do it manually
	if (!viteServer.config.define) return;
	for (const [key, value] of Object.entries(viteServer.config.env)) {
		viteServer.config.define[`__vite_ssr_import_meta__.env.${key}`] =
			JSON.stringify(value);
	}

	const { readFileSync, writeFileSync, unlinkSync } = await import("node:fs");
	const { dirname, join } = await import("node:path");

	const tempFileName = `ssr-test-${Date.now()}-${Math.random().toString(36).slice(2, 11)}.tsx`;
	// temp file inthe same folder to support relative imports
	const testFileDir = dirname(testFilePath);
	const tempFilePath = join(testFileDir, tempFileName);

	try {
		const originalContent = readFileSync(testFilePath, "utf8");
		const ast = parseSync(testFilePath, originalContent);
		const s = new MagicString(originalContent);

		function cleanTestFile(node: Node): undefined {
			if (isImportDeclaration(node)) {
				const source = node.source?.value;
				if (source === "vitest" || source?.includes("@vitest/")) {
					s.remove(node.start, node.end);
				}
			}

			if (
				isExpressionStatement(node) &&
				node.expression?.type === "CallExpression"
			) {
				const callExpr = node.expression;
				if (callExpr.callee.type === "Identifier") {
					const calleeName = callExpr.callee.name;
					if (
						calleeName === "test" ||
						calleeName === "describe" ||
						calleeName === "it"
					) {
						s.remove(node.start, node.end);
					}
				}
			}

			traverseChildren(node, cleanTestFile);
			return undefined;
		}

		cleanTestFile(ast.program);

		let cleanedContent = s.toString();
		if (allLocalComponents.length > 0) {
			const exportStatement = `\n\n// Auto-generated exports for local components\nexport { ${allLocalComponents.join(", ")} };`;
			cleanedContent += exportStatement;
		}

		writeFileSync(tempFilePath, cleanedContent, "utf8");

		const componentModule = await viteServer.ssrLoadModule(tempFilePath);
		const Component = componentModule[componentName];

		if (!Component) {
			throw new Error(
				`[vitest-browser-qwik]: Local component "${componentName}" not found in ${testFilePath}. Available exports: ${Object.keys(componentModule).join(", ")}`,
			);
		}

		return await renderComponentToSSR(ctx, Component, props);
	} finally {
		try {
			unlinkSync(tempFilePath);
		} catch (cleanupError) {
			console.warn("Failed to clean up temporary file:", cleanupError);
		}
	}
};

export function testSSR(): Plugin {
	return {
		name: "vitest:ssr-transform",
		enforce: "pre",

		async transform(code, id) {
			if (!isTestFile(id)) return null;

			const ast = parseSync(id, code);
			if (!hasRenderSSRCallInAST(ast.program, code)) return null;

			const s = new MagicString(code);
			const componentImports = new Map<string, string>();
			const localComponents = new Map<string, string>();
			const renderSSRIdentifiers = new Set<string>(["renderSSR"]);
			let hasExistingCommandsImport = false;

			function walkForTransformation(node: Node): undefined {
				if (
					isImportDeclaration(node) &&
					node.source?.value &&
					node.specifiers
				) {
					const source = node.source.value;
					for (const spec of node.specifiers) {
						if (
							spec.type === "ImportSpecifier" &&
							spec.imported.type === "Identifier"
						) {
							componentImports.set(spec.imported.name, source);
							if (spec.imported.name === "renderSSR") {
								renderSSRIdentifiers.add(spec.local.name);
							}
						} else if (
							spec.type === "ImportDefaultSpecifier" &&
							spec.local.name.toLowerCase().includes("renderssr")
						) {
							renderSSRIdentifiers.add(spec.local.name);
						}
					}
				}

				if (isVariableDeclarator(node)) {
					if (
						node.id.type === "Identifier" &&
						node.init?.type === "Identifier" &&
						renderSSRIdentifiers.has(node.init.name)
					) {
						renderSSRIdentifiers.add(node.id.name);
					}

					if (
						node.id.type === "Identifier" &&
						node.init?.type === "CallExpression"
					) {
						const callExpr = node.init;
						if (
							callExpr.callee.type === "Identifier" &&
							callExpr.callee.name === "component$"
						) {
							const fullDeclaration = code.slice(node.start, node.end);
							localComponents.set(node.id.name, fullDeclaration);
						}
					}
				}

				if (hasCommandsImport(node)) {
					hasExistingCommandsImport = true;
				}

				if (
					isCallExpression(node) &&
					node.callee.type === "Identifier" &&
					renderSSRIdentifiers.has(node.callee.name)
				) {
					const jsxArg = node.arguments?.[0];
					if (
						!isJSXElement(jsxArg) ||
						jsxArg.openingElement?.name?.type !== "JSXIdentifier"
					) {
						traverseChildren(node, walkForTransformation);
						return;
					}

					const componentName = jsxArg.openingElement.name.name;
					const props = extractPropsFromJSX(
						jsxArg.openingElement.attributes || [],
						code,
					);

					let propsStr = "";
					if (Object.keys(props).length > 0) {
						const propsEntries = Object.entries(props).map(
							([key, value]) => `${JSON.stringify(key)}: ${value}`,
						);
						propsStr = `, { ${propsEntries.join(", ")} }`;
					}

					const localComponentCode = localComponents.get(componentName);
					if (localComponentCode) {
						const allLocalComponentNames = Array.from(localComponents.keys());
						const localComponentsArray = JSON.stringify(allLocalComponentNames);
						const replacement = `(async () => {
							const { html } = await commands.renderSSRLocal("${id}", "${componentName}", ${localComponentsArray}${propsStr});
							return renderServerHTML(html);
						})()`;
						s.overwrite(node.start, node.end, replacement);
					} else {
						const componentImportPath = componentImports.get(componentName);
						if (componentImportPath) {
							const componentPath = resolveComponentPath(
								componentImportPath,
								id,
							);
							const replacement = `(async () => {
								const { html } = await commands.renderSSR("${componentPath}", "${componentName}"${propsStr});
								return renderServerHTML(html);
							})()`;
							s.overwrite(node.start, node.end, replacement);
						}
					}
				}

				traverseChildren(node, walkForTransformation);
				return undefined;
			}

			walkForTransformation(ast.program);

			if (s.hasChanged()) {
				if (!hasExistingCommandsImport) {
					let lastImportEnd = 0;

					function findLastImport(node: Node): undefined {
						if (isImportDeclaration(node)) {
							lastImportEnd = Math.max(lastImportEnd, node.end);
						}
						traverseChildren(node, findLastImport);
						return undefined;
					}

					findLastImport(ast.program);

					if (lastImportEnd > 0) {
						s.appendLeft(
							lastImportEnd,
							'\nimport { commands } from "@vitest/browser/context";\nimport { renderServerHTML } from "vitest-browser-qwik";',
						);
					}
				}

				if (localComponents.size > 0) {
					const localComponentNames = Array.from(localComponents.keys());
					const exportStatement = `\n\n// Auto-generated exports for local components\nexport { ${localComponentNames.join(", ")} };`;
					s.append(exportStatement);
				}

				return {
					code: s.toString(),
					map: s.generateMap({ hires: true }),
				};
			}

			return null;
		},
		configResolved(config) {
			globalThis.qwikSymbolMapper = symbolMapper;

			if (config.test?.browser?.enabled) {
				config.test.browser.commands = {
					...config.test.browser.commands,
					renderSSR: renderSSRCommand,
					renderSSRLocal: renderSSRLocalCommand,
				};
			}
		},
	};
}

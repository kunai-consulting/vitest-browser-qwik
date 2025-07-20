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
	try {
		const projectRoot = process.cwd();
		const absoluteComponentPath = resolve(projectRoot, componentPath);

		const viteServer = ctx.project.vite;

		// vite doesn't replace import.meta.env with hardcoded values so we need to do it manually
		for (const [key, value] of Object.entries(viteServer.config.env)) {
			// biome-ignore lint/style/noNonNullAssertion: it's always defined
			viteServer.config.define![`__vite_ssr_import_meta__.env.${key}`] =
				JSON.stringify(value);
		}

		const componentModule = await viteServer.ssrLoadModule(
			absoluteComponentPath,
		);
		const Component = componentModule[componentName];

		if (!Component) {
			throw new Error(
				`Component "${componentName}" not found in ${absoluteComponentPath}`,
			);
		}

		return await renderComponentToSSR(ctx, Component, props);
	} catch (error) {
		console.error("SSR Command Error:", error);
		throw error;
	}
};

const renderSSRLocalCommand: LocalComponentFormat = async (
	ctx,
	testFilePath: string,
	componentName: string,
	allLocalComponents: string[],
	props: Record<string, unknown> = {},
) => {
	try {
		const viteServer = ctx.project.vite;
		// vite doesn't replace import.meta.env with hardcoded values so we need to do it manually
		for (const [key, value] of Object.entries(viteServer.config.env)) {
			// biome-ignore lint/style/noNonNullAssertion: it's always defined
			viteServer.config.define![`__vite_ssr_import_meta__.env.${key}`] =
				JSON.stringify(value);
		}

		// Create a modified version of the test file without vitest imports
		const { readFileSync, writeFileSync, unlinkSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const tempFileName = `ssr-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.tsx`;
		const tempFilePath = join(tmpdir(), tempFileName);

		try {
			// Read the original test file
			const originalContent = readFileSync(testFilePath, "utf8");

			const ast = parseSync(testFilePath, originalContent);
			const s = new MagicString(originalContent);

			// biome-ignore lint/suspicious/noExplicitAny: AST node types from oxc-parser are complex
			function cleanTestFile(node: any): undefined {
				if (!node || typeof node !== "object") return;

				// Remove vitest imports
				if (isImportDeclaration(node)) {
					const source = node.source?.value;
					if (source === "vitest" || source?.includes("@vitest/")) {
						s.remove(node.start, node.end);
					}
				}

				// Remove test function calls (test, describe, it)
				if (isExpressionStatement(node)) {
					if (node.expression?.type === "CallExpression") {
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
				}

				// Recursively clean children
				traverseChildren(node, cleanTestFile);
				return undefined;
			}

			cleanTestFile(ast as unknown);

			// Add export statements for local components
			let cleanedContent = s.toString();
			if (allLocalComponents.length > 0) {
				const exportStatement = `\n\n// Auto-generated exports for local components\nexport { ${allLocalComponents.join(", ")} };`;
				cleanedContent += exportStatement;
			}

			// Write the modified content to temp file
			writeFileSync(tempFilePath, cleanedContent, "utf8");

			// Import the component from the modified test file
			const componentModule = await viteServer.ssrLoadModule(tempFilePath);
			const Component = componentModule[componentName];

			if (!Component) {
				throw new Error(
					`Local component "${componentName}" not found in ${testFilePath}. Available exports: ${Object.keys(componentModule).join(", ")}`,
				);
			}

			return await renderComponentToSSR(ctx, Component, props);
		} finally {
			// Clean up temporary file
			try {
				unlinkSync(tempFilePath);
			} catch (cleanupError) {
				console.warn("Failed to clean up temporary file:", cleanupError);
			}
		}
	} catch (error) {
		console.error("SSR Local Command Error:", error);
		throw error;
	}
};

// Vite plugin that transforms renderSSR(<Component />) calls to commands.renderSSR() calls
export function testSSR(): Plugin {
	return {
		name: "vitest:ssr-transform",
		enforce: "pre",

		async transform(code, id) {
			if (!isTestFile(id)) return null;

			try {
				const ast = parseSync(id, code);

				// Check if this file has renderSSR calls using the parsed AST
				if (!hasRenderSSRCallInAST(ast as unknown as Node, code)) {
					return null;
				}

				const s = new MagicString(code);

				const componentImports = new Map<string, string>();
				const localComponents = new Map<string, string>(); // componentName -> componentCode

				const renderSSRIdentifiers = new Set<string>(["renderSSR"]);
				let hasExistingCommandsImport = false;

				// biome-ignore lint/suspicious/noExplicitAny: AST node types from oxc-parser are complex
				function walkForTransformation(node: any): undefined {
					if (!node || typeof node !== "object") return;

					// Track component imports
					if (isImportDeclaration(node)) {
						if (node.source?.value && node.specifiers) {
							const source = node.source.value;
							for (const spec of node.specifiers) {
								if (spec.type === "ImportSpecifier") {
									if (spec.imported.type === "Identifier") {
										componentImports.set(spec.imported.name, source);

										// Also track renderSSR aliases
										if (spec.imported.name === "renderSSR") {
											renderSSRIdentifiers.add(spec.local.name);
										}
									}
								} else if (spec.type === "ImportDefaultSpecifier") {
									if (spec.local.name.toLowerCase().includes("renderssr")) {
										renderSSRIdentifiers.add(spec.local.name);
									}
								}
							}
						}
					}

					// Track variable aliases for renderSSR
					if (isVariableDeclarator(node)) {
						if (
							node.id.type === "Identifier" &&
							node.init?.type === "Identifier" &&
							renderSSRIdentifiers.has(node.init.name)
						) {
							renderSSRIdentifiers.add(node.id.name);
						}
					}

					// Check for existing commands import
					if (hasCommandsImport(node)) {
						hasExistingCommandsImport = true;
					}

					// Detect local component definitions and collect all variable declarations
					if (isVariableDeclarator(node)) {
						if (node.id.type === "Identifier") {
							const variableName = node.id.name;

							// Check if it's a component definition
							if (node.init?.type === "CallExpression") {
								const callExpr = node.init;
								if (
									callExpr.callee.type === "Identifier" &&
									callExpr.callee.name === "component$"
								) {
									// Extract the full variable declaration
									const fullDeclaration = code.slice(node.start, node.end);
									localComponents.set(variableName, fullDeclaration);
								}
							}
						}
					}

					// Transform renderSSR calls
					if (isCallExpression(node)) {
						if (
							node.callee.type === "Identifier" &&
							renderSSRIdentifiers.has(node.callee.name)
						) {
							const jsxArg = node.arguments?.[0];
							if (isJSXElement(jsxArg)) {
								if (jsxArg.openingElement?.name?.type === "JSXIdentifier") {
									const componentName = jsxArg.openingElement.name.name;
									const props = extractPropsFromJSX(
										jsxArg.openingElement.attributes || [],
										code,
									);

									// Generate props object with proper JavaScript expressions
									let propsStr = "";
									if (Object.keys(props).length > 0) {
										const propsEntries = Object.entries(props).map(
											([key, value]) => {
												return `${JSON.stringify(key)}: ${value}`;
											},
										);
										propsStr = `, { ${propsEntries.join(", ")} }`;
									}

									// Check if it's a local component first
									const localComponentCode = localComponents.get(componentName);
									if (localComponentCode) {
										// For local components, import from the original test file with all local component names
										const allLocalComponentNames = Array.from(
											localComponents.keys(),
										);
										const localComponentsArray = JSON.stringify(
											allLocalComponentNames,
										);
										const replacement = `(async () => {
											const { html } = await commands.renderSSRLocal("${id}", "${componentName}", ${localComponentsArray}${propsStr});
											return renderServerHTML(html);
										})()`;

										s.overwrite(node.start, node.end, replacement);
									} else {
										// Check for imported components
										const componentImportPath =
											componentImports.get(componentName);
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
							}
						}
					}

					// Recursively walk children
					traverseChildren(node, walkForTransformation);
					return;
				}

				walkForTransformation(ast);

				// Add commands import and export local components if needed
				if (s.hasChanged()) {
					if (!hasExistingCommandsImport) {
						let lastImportEnd = 0;

						// biome-ignore lint/suspicious/noExplicitAny: AST node types from oxc-parser are complex
						function findLastImport(node: any): undefined {
							if (!node || typeof node !== "object") return;

							if (isImportDeclaration(node)) {
								lastImportEnd = Math.max(lastImportEnd, node.end);
							}

							traverseChildren(node, findLastImport);
							return undefined;
						}

						findLastImport(ast);

						if (lastImportEnd > 0) {
							s.appendLeft(
								lastImportEnd,
								'\nimport { commands } from "@vitest/browser/context";\nimport { renderServerHTML } from "vitest-browser-qwik";',
							);
						}
					}

					// Add exports for local components
					if (localComponents.size > 0) {
						const localComponentNames = Array.from(localComponents.keys());
						const exportStatement = `\n\n// Auto-generated exports for local components\nexport { ${localComponentNames.join(", ")} };`;
						s.append(exportStatement);
					}
				}

				if (s.hasChanged()) {
					return {
						code: s.toString(),
						map: s.generateMap({ hires: true }),
					};
				}
			} catch (error) {
				console.warn(`Failed to transform ${id}:`, error);
			}

			return null;
		},
		// Add the renderSSR commands
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

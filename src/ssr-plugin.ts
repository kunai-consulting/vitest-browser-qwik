import { dirname, relative, resolve } from "node:path";
import type { Plugin } from "vitest/config";

// Helper function to check if code contains renderSSR calls using semantic analysis
async function hasRenderSSRCall(
	code: string,
	filename: string,
): Promise<boolean> {
	try {
		const { parseSync } = await import("oxc-parser");
		const ast = parseSync(filename, code);
		const renderSSRIdentifiers = new Set<string>(["renderSSR"]);

		function walkForDetection(node: any): boolean {
			if (!node || typeof node !== "object") return false;

			// Track renderSSR imports and aliases
			if (
				node.type === "ImportDeclaration" &&
				node.source?.value &&
				node.specifiers
			) {
				for (const spec of node.specifiers) {
					if (
						spec.type === "ImportSpecifier" &&
						spec.imported?.name === "renderSSR"
					) {
						renderSSRIdentifiers.add(spec.local?.name || "renderSSR");
					}
					if (
						spec.type === "ImportDefaultSpecifier" &&
						spec.local?.name?.toLowerCase().includes("renderssr")
					) {
						renderSSRIdentifiers.add(spec.local.name);
					}
				}
			}

			// Track variable aliases
			if (
				node.type === "VariableDeclarator" &&
				node.id?.name &&
				node.init?.type === "Identifier" &&
				renderSSRIdentifiers.has(node.init.name)
			) {
				renderSSRIdentifiers.add(node.id.name);
			}

			// Check for renderSSR calls
			if (
				node.type === "CallExpression" &&
				node.callee?.type === "Identifier" &&
				renderSSRIdentifiers.has(node.callee.name)
			) {
				return true;
			}

			// Recursively check children
			for (const key in node) {
				const child = node[key];
				if (Array.isArray(child)) {
					if (child.some(walkForDetection)) return true;
				} else if (child && typeof child === "object") {
					if (walkForDetection(child)) return true;
				}
			}

			return false;
		}

		return walkForDetection(ast);
	} catch (error) {
		console.warn(
			`Failed to parse ${filename} for renderSSR detection, falling back to string check:`,
			error,
		);
		return code.includes("renderSSR");
	}
}

function resolveComponentPath(importPath: string, testFileId: string): string {
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
	let componentPath = "./" + relative(projectRoot, resolvedPath);

	// Add extension if needed
	if (!componentPath.endsWith(".tsx") && !componentPath.endsWith(".ts")) {
		componentPath += ".tsx";
	}

	return componentPath;
}

function extractPropsFromJSX(attributes: any[]): Record<string, any> {
	const props: Record<string, any> = {};

	for (const attr of attributes) {
		if (attr.type !== "JSXAttribute" || !attr.name?.name) continue;

		const propName = attr.name.name;

		if (
			attr.value?.type === "JSXExpressionContainer" &&
			attr.value.expression?.type === "Literal"
		) {
			props[propName] = attr.value.expression.value;
		} else if (attr.value?.type === "Literal") {
			props[propName] = attr.value.value;
		}
	}

	return props;
}

function isTestFile(id: string): boolean {
	return id.includes(".test.") || id.includes(".spec.");
}

function hasCommandsImport(node: any): boolean {
	return (
		node.type === "ImportDeclaration" &&
		node.source?.value === "@vitest/browser/context" &&
		node.specifiers?.some(
			(spec: any) =>
				spec.type === "ImportSpecifier" && spec.imported?.name === "commands",
		)
	);
}

// Vite plugin that transforms renderSSR(<Component />) calls to commands.renderSSR() calls
export function createSSRTransformPlugin(): Plugin {
	return {
		name: "vitest:ssr-transform",
		enforce: "pre",

		async transform(code, id) {
			if (!isTestFile(id)) return null;
			if (!(await hasRenderSSRCall(code, id))) return null;

			console.log(`🔧 SSR Transform Plugin processing: ${id}`);

			try {
				const { parseSync } = await import("oxc-parser");
				const MagicString = (await import("magic-string")).default;

				const ast = parseSync(id, code);
				const s = new MagicString(code);

				const componentImports = new Map<string, string>();
				const renderSSRIdentifiers = new Set<string>(["renderSSR"]);
				let hasExistingCommandsImport = false;

				function walkForTransformation(node: any): void {
					if (!node || typeof node !== "object") return;

					// Track component imports
					if (
						node.type === "ImportDeclaration" &&
						node.source?.value &&
						node.specifiers
					) {
						const source = node.source.value;

						for (const spec of node.specifiers) {
							if (spec.type === "ImportSpecifier" && spec.imported?.name) {
								componentImports.set(spec.imported.name, source);

								// Also track renderSSR aliases
								if (spec.imported.name === "renderSSR") {
									renderSSRIdentifiers.add(spec.local?.name || "renderSSR");
								}
							}
							if (
								spec.type === "ImportDefaultSpecifier" &&
								spec.local?.name?.toLowerCase().includes("renderssr")
							) {
								renderSSRIdentifiers.add(spec.local.name);
							}
						}
					}

					// Track variable aliases for renderSSR
					if (
						node.type === "VariableDeclarator" &&
						node.id?.name &&
						node.init?.type === "Identifier" &&
						renderSSRIdentifiers.has(node.init.name)
					) {
						renderSSRIdentifiers.add(node.id.name);
					}

					// Check for existing commands import
					if (hasCommandsImport(node)) {
						hasExistingCommandsImport = true;
					}

					// Transform renderSSR calls
					if (
						node.type === "CallExpression" &&
						node.callee?.type === "Identifier" &&
						renderSSRIdentifiers.has(node.callee.name)
					) {
						const jsxArg = node.arguments?.[0];
						if (jsxArg?.type !== "JSXElement") return;

						const componentName = jsxArg.openingElement?.name?.name;
						if (!componentName) return;

						const componentImportPath = componentImports.get(componentName);
						if (!componentImportPath) return;

						const componentPath = resolveComponentPath(componentImportPath, id);
						const props = extractPropsFromJSX(
							jsxArg.openingElement?.attributes || [],
						);
						const propsStr =
							Object.keys(props).length > 0 ? `, ${JSON.stringify(props)}` : "";
						const replacement = `commands.renderSSR("${componentPath}", "${componentName}"${propsStr})`;

						console.log(
							`📁 Resolved path: ${componentImportPath} -> ${componentPath}`,
						);
						console.log(
							`🔄 Transforming: ${node.callee.name}(<${componentName} />) -> ${replacement}`,
						);

						s.overwrite(node.start, node.end, replacement);
					}

					// Recursively walk children
					for (const key in node) {
						const child = node[key];
						if (Array.isArray(child)) {
							child.forEach(walkForTransformation);
						} else if (child && typeof child === "object") {
							walkForTransformation(child);
						}
					}
				}

				walkForTransformation(ast);

				// Add commands import if needed and we made changes
				if (!hasExistingCommandsImport && s.hasChanged()) {
					let lastImportEnd = 0;

					function findLastImport(node: any): void {
						if (!node || typeof node !== "object") return;

						if (node.type === "ImportDeclaration") {
							lastImportEnd = Math.max(lastImportEnd, node.end);
						}

						for (const key in node) {
							const child = node[key];
							if (Array.isArray(child)) {
								child.forEach(findLastImport);
							} else if (child && typeof child === "object") {
								findLastImport(child);
							}
						}
					}

					findLastImport(ast);

					if (lastImportEnd > 0) {
						s.appendLeft(
							lastImportEnd,
							'\nimport { commands } from "@vitest/browser/context";',
						);
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
	};
}

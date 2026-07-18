import * as vscode from "vscode";
import * as path from "path";
import { BaseModule, PackageInfo } from "../modules/BaseModule.js";
import { MavenModule } from "../modules/MavenModule.js";
import { NpmModule } from "../modules/NpmModule.js";
import { PythonModule } from "../modules/PythonModule.js";

export class DependencyTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private modules: Map<string, BaseModule> = new Map();
	private selectedLanguage: string = "";
	private searchResults: Map<string, PackageInfo[]> = new Map();
	private currentSearchQuery: string = "";
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.loadConfiguration();
	}

	private loadConfiguration(): void {
		const routesPath = path.join(this.context.extensionPath, "route.json");
		const routes = require(routesPath);

		Object.keys(routes).forEach((language) => {
			Object.keys(routes[language]).forEach((repoName) => {
				const config = routes[language][repoName];
				const key = `${language}:${repoName}`;

				// Create appropriate module based on repo name
				let module: BaseModule;
				switch (repoName) {
					case "maven":
						module = new MavenModule(this.context, config);
						break;
					case "npm":
						module = new NpmModule(this.context, config);
						break;
					case "pypi":
						module = new PythonModule(this.context, config);
						break;
					default:
						module = new (class extends BaseModule {
							getIcon(): vscode.ThemeIcon {
								return new vscode.ThemeIcon("library");
							}
						})(this.context, config);
				}

				this.modules.set(key, module);
			});
		});
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	setLanguage(language: string): void {
		this.selectedLanguage = language;
		this.refresh();
	}

	async search(query: string): Promise<void> {
		this.currentSearchQuery = query;
		this.searchResults.clear();

		const languageModules = this.getLanguageModules();

		for (const [key, module] of languageModules) {
			try {
				const results = await module.search(query);
				this.searchResults.set(key, results);
			} catch (error) {
				console.error(`Error searching ${key}:`, error);
			}
		}

		this.refresh();
	}

	private getLanguageModules(): Map<string, BaseModule> {
		const languageModules = new Map<string, BaseModule>();

		this.modules.forEach((module, key) => {
			if (key.startsWith(this.selectedLanguage + ":")) {
				languageModules.set(key, module);
			}
		});

		return languageModules;
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
		if (!element) {
			// Root level - show languages
			return this.getLanguageItems();
		} else if (element.contextValue === "repository") {
			// Repository level - show search results or search prompt
			return this.getRepositoryItems(element);
		} else if (element.contextValue === "packageItem") {
			// Package level - no children
			return [];
		}

		return [];
	}

	private getLanguageItems(): vscode.TreeItem[] {
		const languages = new Set<string>();
		this.modules.forEach((_, key) => {
			const language = key.split(":")[0];
			languages.add(language);
		});

		return Array.from(languages).map((language) => {
			const item = new vscode.TreeItem(language, vscode.TreeItemCollapsibleState.Expanded);

			// Set appropriate icon for each language
			switch (language) {
				case "Java":
					item.iconPath = new vscode.ThemeIcon("coffee");
					break;
				case "JavaScript":
					item.iconPath = new vscode.ThemeIcon("json");
					break;
				case "Python":
					item.iconPath = new vscode.ThemeIcon("python");
					break;
				case "DotNet":
					item.iconPath = new vscode.ThemeIcon("symbol-namespace");
					break;
				default:
					item.iconPath = new vscode.ThemeIcon("code");
			}

			item.contextValue = "language";

			// Add click command to select language
			item.command = {
				command: "dependencyManager.selectLanguage",
				title: "Select Language",
				arguments: [language],
			};

			// Highlight selected language
			if (language === this.selectedLanguage) {
				item.description = "✓ Selected";
				item.iconPath = new vscode.ThemeIcon("pass-filled");
			}

			return item;
		});
	}

	private getRepositoryItems(element: vscode.TreeItem): vscode.TreeItem[] {
		const repositoryKey = element.id!;
		const results = this.searchResults.get(repositoryKey);

		if (!results || results.length === 0) {
			const noResultsItem = new vscode.TreeItem("No packages found. Use search button above.", vscode.TreeItemCollapsibleState.None);
			noResultsItem.iconPath = new vscode.ThemeIcon("info");
			return [noResultsItem];
		}

		return results.map((pkg, index) => {
			const item = new vscode.TreeItem(pkg.name, vscode.TreeItemCollapsibleState.None);

			item.description = `v${pkg.version}`;
			item.tooltip = pkg.description || `${pkg.name} v${pkg.version}`;
			item.contextValue = "packageItem";
			item.iconPath = new vscode.ThemeIcon("symbol-package");

			// Add copy command
			item.command = {
				command: "dependencyManager.copyToClipboard",
				title: "Copy to Clipboard",
				arguments: [pkg.formattedString, pkg.name],
			};

			return item;
		});
	}
}

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { loadRoutes } from "./utils.js";
import { handleSearch } from "./searchHandlers.js";

export class DependencyPanel {
	public static currentPanel: DependencyPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _context: vscode.ExtensionContext;
	private _disposables: vscode.Disposable[] = [];
	private static routes: any = {};

	public static createOrShow(context: vscode.ExtensionContext) {
		const column = vscode.ViewColumn.Active;
		if (DependencyPanel.currentPanel) {
			DependencyPanel.currentPanel._panel.reveal(column);
			return;
		}

		DependencyPanel.routes = loadRoutes(context);

		const panel = vscode.window.createWebviewPanel("dependencyViewer", "🍂 Dependency Viewer", column, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist", "panel")],
		});
		DependencyPanel.currentPanel = new DependencyPanel(panel, context);
	}

	private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
		this._panel = panel;
		this._context = context;

		this._loadWebviewContent();
		this._setupMessageHandlers();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
	}

	private _loadWebviewContent() {
		const htmlPath = path.join(this._context.extensionPath, "dist", "panel", "webview.html");
		const cssPath = path.join(this._context.extensionPath, "dist", "panel", "styles.css");
		const jsPath = path.join(this._context.extensionPath, "dist", "panel", "main.js");

		if (!fs.existsSync(htmlPath)) {
			vscode.window.showErrorMessage(`HTML file not found at: ${htmlPath}`);
			return;
		}

		const cssUri = this._panel.webview.asWebviewUri(vscode.Uri.file(cssPath));
		const jsUri = this._panel.webview.asWebviewUri(vscode.Uri.file(jsPath));

		let html = fs.readFileSync(htmlPath, "utf8");
		html = html.replace("${STYLES_CSS}", cssUri.toString());
		html = html.replace("${MAIN_JS}", jsUri.toString());

		this._panel.webview.html = html;
	}

	private _setupMessageHandlers() {
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case "getLanguages":
						this._panel.webview.postMessage({
							command: "setLanguages",
							languages: Object.keys(DependencyPanel.routes),
						});
						break;

					case "search":
						try {
							const results = await handleSearch(DependencyPanel.routes, message.language, message.query);
							this._panel.webview.postMessage({
								command: "searchResults",
								results: results,
							});
						} catch (error) {
							this._panel.webview.postMessage({
								command: "searchError",
								error: String(error),
							});
						}
						break;

					case "copyToClipboard":
						await vscode.env.clipboard.writeText(message.text);
						// vscode.window.showInformationMessage(`📋 Copied: ${message.name}`);
						break;

					case "close":
						this._panel.dispose();
						break;
				}
			},
			null,
			this._disposables,
		);
	}

	public dispose() {
		DependencyPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			this._disposables.pop()?.dispose();
		}
	}
}

import * as vscode from "vscode";
import { DependencyPanel } from "./DependencyPanel.js";

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
	console.log("🍂 Dependency Viewer activated");

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "$(package) Dependency Viewer";
	statusBarItem.tooltip = "Search and add dependencies";
	statusBarItem.command = "dependencyManager.openPanel";
	statusBarItem.show();

	const openPanelCommand = vscode.commands.registerCommand("dependencyManager.openPanel", () => {
		DependencyPanel.createOrShow(context);
	});

	context.subscriptions.push(statusBarItem, openPanelCommand);
}

export function deactivate() {}

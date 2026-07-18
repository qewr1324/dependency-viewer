import * as vscode from "vscode";
import { BaseModule, RepositoryConfig } from "./BaseModule.js";

export class MavenModule extends BaseModule {
	constructor(context: vscode.ExtensionContext, config: RepositoryConfig) {
		super(context, config);
	}

	getIcon(): vscode.ThemeIcon {
		return new vscode.ThemeIcon("coffee");
	}
}

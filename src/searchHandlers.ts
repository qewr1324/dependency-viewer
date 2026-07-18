import * as vscode from "vscode";

export async function handleSearch(routes: any, language: string, query: string): Promise<any[]> {
	const languageRoutes = routes[language];
	if (!languageRoutes) {
		return [];
	}

	const results: any[] = [];
	for (const [repoName, config] of Object.entries(languageRoutes)) {
		try {
			const repoResults = await searchRepo(config as any, query, repoName);
			results.push(...repoResults);
		} catch (error) {
			console.error(`Error searching ${repoName}:`, error);
			vscode.window.showErrorMessage(`Error searching ${repoName}: ${error}`);
		}
	}

	const uniqueResults = results.filter((item, index, self) => index === self.findIndex((t) => t.name === item.name && t.version === item.version));

	return uniqueResults;
}

async function searchRepo(config: any, query: string, repoName: string): Promise<any[]> {
	try {
		await new Promise((resolve) => setTimeout(resolve, 200));

		if (repoName === "rubygems") {
			return await searchRubyGems(query, config);
		}

		const params = { ...config.params };
		Object.keys(params).forEach((key) => {
			if (typeof params[key] === "string") {
				params[key] = params[key].replace("${query}", encodeURIComponent(query));
			}
		});

		const urlObj = new URL(config.searchUrl);
		Object.keys(params).forEach((key) => urlObj.searchParams.append(key, params[key]));
		const url = urlObj.toString();

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 ثانیه تایم‌اوت

		const response = await fetch(url, {
			headers: {
				"User-Agent": "VSCode-Dependency-Viewer/1.0",
				...(config.headers || {}),
			},
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			console.error(`HTTP error ${response.status}: ${response.statusText}`);
			return [];
		}

		const data = await response.json();
		return parseResults(data, config, repoName);
	} catch (error) {
		if (error instanceof Error) {
			if (error.name === "AbortError") {
				console.error(`Request timeout for ${repoName}`);
				vscode.window.showWarningMessage(`Timeout searching ${repoName}`);
			} else {
				console.error(`Error in searchRepo for ${repoName}:`, error);
			}
		}
		return [];
	}
}

async function searchRubyGems(query: string, config: any): Promise<any[]> {
	try {
		const url = `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent(query)}`;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000);

		const response = await fetch(url, {
			headers: {
				"User-Agent": "VSCode-Dependency-Viewer/1.0",
				Accept: "application/json",
			},
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) return [];
		const items: any = await response.json();

		return items.slice(0, 20).map((item: any) => {
			const pkgName = item.name || "unknown";
			const pkgVersion = item.version || "unknown";
			const formatted = config.parseResponse.format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);

			return {
				name: pkgName,
				version: pkgVersion,
				description: item.info || item.description || "",
				formatted: formatted,
				repoName: config.name || "RubyGems",
			};
		});
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			console.error("RubyGems request timeout");
			vscode.window.showWarningMessage("Timeout searching RubyGems");
		} else {
			console.error("RubyGems search error:", error);
		}
		return [];
	}
}

function buildMavenOutput(item: any, repoName: string): { name: string; version: string; formatted: string } {
	const groupId = item.g || item.groupId || "unknown";
	const artifactId = item.a || item.artifactId || "unknown";
	const version = item.latestVersion || item.version || "unknown";
	const name = groupId + ":" + artifactId;
	const packaging = item.p || "";

	const isBom = packaging.toLowerCase() === "pom";

	let formatted = "";

	switch (repoName) {
		case "maven": // Java - Maven XML
			formatted = "<dependency>\n";
			formatted += `    <groupId>${groupId}</groupId>\n`;
			formatted += `    <artifactId>${artifactId}</artifactId>\n`;
			formatted += `    <version>${version}</version>\n`;
			if (isBom) {
				formatted += `    <type>pom</type>\n`;
			}
			formatted += "</dependency>";
			break;

		case "maven-kotlin": // Kotlin - Gradle Kotlin DSL
			if (isBom) {
				formatted = `implementation(platform("${groupId}:${artifactId}:${version}"))`;
			} else {
				formatted = `implementation("${groupId}:${artifactId}:${version}")`;
			}
			break;

		case "maven-groovy": // Groovy - Gradle Groovy DSL
			if (isBom) {
				formatted = `implementation platform("${groupId}:${artifactId}:${version}")`;
			} else {
				formatted = `implementation '${groupId}:${artifactId}:${version}'`;
			}
			break;

		default:
			formatted = "<dependency>\n";
			formatted += `    <groupId>${groupId}</groupId>\n`;
			formatted += `    <artifactId>${artifactId}</artifactId>\n`;
			formatted += `    <version>${version}</version>\n`;
			if (isBom) {
				formatted += `    <type>pom</type>\n`;
			}
			formatted += "</dependency>";
	}

	return {
		name: name,
		version: version,
		formatted: formatted,
	};
}

function parseResults(data: any, config: any, repoName: string): any[] {
	const { items, version, format } = config.parseResponse;
	let itemsArray: any = data;
	const itemPath = items.split(".");
	for (const key of itemPath) {
		itemsArray = itemsArray?.[key];
	}
	if (!Array.isArray(itemsArray)) return [];

	return itemsArray.map((item: any) => {
		let pkgVersion = "Unknown";
		let temp = item;
		for (const key of version) {
			temp = temp?.[key];
		}
		pkgVersion = temp || "Unknown";

		let pkgName = "";
		let formatted = "";

		if (repoName === "maven" || repoName === "maven-kotlin" || repoName === "maven-groovy") {
			const result = buildMavenOutput(item, repoName);
			pkgName = result.name;
			pkgVersion = result.version;
			formatted = result.formatted;
		} else if (repoName === "nuget") {
			pkgName = item.id || item.title || "unknown";
			formatted = format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
		} else if (repoName === "npm" || repoName === "npm-types") {
			pkgName = item.package?.name || item.name || "unknown";
			formatted = format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
		} else if (repoName === "crates") {
			pkgName = item.name || item.id || "unknown";
			pkgVersion = item.max_version || item.version || "unknown";
			formatted = format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
		} else if (repoName === "rubygems") {
			pkgName = item.name || "unknown";
			formatted = format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
		} else {
			pkgName = item.name || item.id || "unknown";
			formatted = format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
		}

		return {
			name: pkgName,
			version: pkgVersion,
			description: item.description || item.summary || item.info || item.title || "",
			formatted: formatted,
			repoName: config.name || repoName,
		};
	});
}

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
		}
	}

	const uniqueResults = results.filter((item, index, self) => index === self.findIndex((t) => t.name === item.name && t.version === item.version));

	return uniqueResults;
}

async function searchRepo(config: any, query: string, repoName: string): Promise<any[]> {
	try {
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

		const response = await fetch(url, {
			headers: {
				"User-Agent": "VSCode-Dependency-Viewer/1.0",
				...(config.headers || {}),
			},
		});

		if (!response.ok) return [];
		const data = await response.json();
		return parseResults(data, config, repoName);
	} catch (error) {
		console.error(`Error in searchRepo for ${repoName}:`, error);
		return [];
	}
}

async function searchRubyGems(query: string, config: any): Promise<any[]> {
	try {
		const url = `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent(query)}`;
		const response = await fetch(url, {
			headers: {
				"User-Agent": "VSCode-Dependency-Viewer/1.0",
				Accept: "application/json",
			},
		});

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
		console.error("RubyGems search error:", error);
		return [];
	}
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
		let formatted = format;

		if (repoName === "maven" || repoName === "maven-kotlin" || repoName === "maven-groovy") {
			const g = item.g || item.groupId || "unknown";
			const a = item.a || item.artifactId || "unknown";
			pkgName = g + ":" + a;
			formatted = format
				.replace(/\{groupId\}/g, g)
				.replace(/\{artifactId\}/g, a)
				.replace(/\{version\}/g, pkgVersion);
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

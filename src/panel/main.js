const vscode = acquireVsCodeApi();
let currentLanguage = "";
let searchTimeout;

const langSelect = document.getElementById("langSelect");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const resultsDiv = document.getElementById("results");
const toastContainer = document.getElementById("toastContainer");

vscode.postMessage({ command: "getLanguages" });

langSelect.addEventListener("change", function () {
	currentLanguage = this.value;
	searchInput.disabled = !currentLanguage;
	searchBtn.disabled = !currentLanguage;
	if (currentLanguage) {
		searchInput.focus();
		const placeholders = {
			Java: "e.g., spring-boot, jackson, guava",
			JavaScript: "e.g., react, lodash, express",
			TypeScript: "e.g., @types/react, @types/node",
			"C#": "e.g., Newtonsoft.Json, EntityFramework",
			Ruby: "e.g., rails, rspec, devise",
			Rust: "e.g., serde, tokio, clap",
			Kotlin: "e.g., coroutines, retrofit, koin",
			Groovy: "e.g., spock, groovy, gradle",
		};
		searchInput.placeholder = placeholders[currentLanguage] || "Search packages...";
	}
});

searchInput.addEventListener("input", function () {
	clearTimeout(searchTimeout);
	searchTimeout = setTimeout(doSearch, 400);
});

searchInput.addEventListener("keypress", function (e) {
	if (e.key === "Enter") {
		clearTimeout(searchTimeout);
		doSearch();
	}
});

searchBtn.addEventListener("click", doSearch);

document.addEventListener("keydown", function (e) {
	if (e.key === "Escape") closePanel();
	if ((e.ctrlKey || e.metaKey) && e.key === "k") {
		e.preventDefault();
		searchInput.focus();
	}
});

function doSearch() {
	const query = searchInput.value.trim();
	if (!query || !currentLanguage) return;
	showLoading();
	vscode.postMessage({ command: "search", language: currentLanguage, query: query });
}

function showLoading() {
	resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p style="color: var(--text-secondary);">Searching packages...</p></div>';
}

function getLangClass(repoName) {
	const repo = (repoName || "").toLowerCase();
	if (repo.includes("npm") || repo.includes("types")) return "json";
	if (repo.includes("maven") || repo.includes("nuget")) return "xml";
	if (repo.includes("rubygems")) return "ruby";
	if (repo.includes("crates")) return "toml";
	return "plain";
}

function highlightXML(code) {
	let result = code;
	result = result.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-comment">$1</span>');
	result = result.replace(/(&lt;\/?)([\w:.]+)/g, '$1<span class="hl-tag">$2</span>');
	result = result.replace(/\s(\w[\w-]*)(=)(&quot;|')(.*?)(\3)/g, ' <span class="hl-attr">$1</span>$2<span class="hl-punctuation">$3</span><span class="hl-value">$4</span><span class="hl-punctuation">$3</span>');
	result = result.replace(/(&lt;|&gt;|\/&gt;)/g, '<span class="hl-punctuation">$1</span>');
	return result;
}

function highlightJSON(code) {
	let result = code;
	result = result.replace(/("[\w-@\/]+")(\s*:)/g, '<span class="hl-attr">$1</span>$2');
	result = result.replace(/("(?:[^"\\]|\\.)*")/g, function (match) {
		if (match.includes("hl-attr")) return match;
		return '<span class="hl-string">' + match + "</span>";
	});
	result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>');
	result = result.replace(/\b(true|false|null)\b/g, '<span class="hl-keyword">$1</span>');
	result = result.replace(/([{}[\],:])/g, '<span class="hl-punctuation">$1</span>');
	return result;
}

function highlightRuby(code) {
	let result = code;
	result = result.replace(/(#.*$)/gm, '<span class="hl-comment">$1</span>');
	result = result.replace(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, '<span class="hl-string">$1</span>');
	result = result.replace(/(:\w+)/g, '<span class="hl-attr">$1</span>');
	const keywords = ["gem", "require", "do", "end", "class", "def", "module", "group", "source", "ruby", "git", "branch", "path", "platforms"];
	keywords.forEach((kw) => {
		const regex = new RegExp("\\b(" + kw + ")\\b", "g");
		result = result.replace(regex, '<span class="hl-keyword">$1</span>');
	});
	result = result.replace(/([~>=<^]+)\s*([\d.]+)/g, '<span class="hl-punctuation">$1</span> <span class="hl-number">$2</span>');
	return result;
}

function highlightTOML(code) {
	let result = code;
	result = result.replace(/(#.*$)/gm, '<span class="hl-comment">$1</span>');
	result = result.replace(/^(\s*)([\w.-]+)(\s*=)/gm, '$1<span class="hl-attr">$2</span>$3');
	result = result.replace(/("(?:[^"\\]|\\.)*")/g, '<span class="hl-string">$1</span>');
	const keywords = ["dependencies", "dev-dependencies", "build-dependencies", "package", "version", "features", "default-features"];
	keywords.forEach((kw) => {
		const regex = new RegExp("\\b(" + kw + ")\\b", "g");
		result = result.replace(regex, '<span class="hl-keyword">$1</span>');
	});
	return result;
}

function highlightCode(code, lang) {
	if (!code) return "";
	const escaped = escapeHtml(code);
	switch (lang) {
		case "xml":
			return highlightXML(escaped);
		case "json":
			return highlightJSON(escaped);
		case "ruby":
			return highlightRuby(escaped);
		case "toml":
			return highlightTOML(escaped);
		default:
			return escaped;
	}
}

function displayResults(results) {
	if (!results || results.length === 0) {
		resultsDiv.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><h2>No Packages Found</h2><p>Try different keywords</p></div>';
		return;
	}

	let html = '<div class="results-info">Found <strong>' + results.length + "</strong> package(s) for <strong>" + currentLanguage + "</strong></div>";
	html += '<div class="results-grid" id="resultsGrid"></div>';
	resultsDiv.innerHTML = html;

	const grid = document.getElementById("resultsGrid");

	results.forEach(function (pkg) {
		const card = document.createElement("div");
		card.className = "package-card";

		const langType = getLangClass(pkg.repoName);
		const highlightedCode = highlightCode(pkg.formatted, langType);

		let cardHTML = '<div class="card-header">';
		cardHTML += '<div class="card-title">';
		cardHTML += '<span class="card-name">📦 ' + escapeHtml(pkg.name) + "</span>";
		cardHTML += '<div style="display:flex;gap:6px">';
		cardHTML += '<span class="badge badge-version">v' + escapeHtml(pkg.version) + "</span>";
		cardHTML += '<span class="badge badge-repo">' + escapeHtml(pkg.repoName || "") + "</span>";
		cardHTML += "</div></div></div>";

		if (pkg.description) {
			cardHTML += '<div class="card-desc">' + escapeHtml(pkg.description) + "</div>";
		}

		cardHTML += '<div class="card-code"><pre><code>' + highlightedCode + "</code></pre></div>";
		cardHTML += '<div class="card-actions">';
		cardHTML += '<button class="btn-copy" data-text="' + encodeURIComponent(pkg.formatted) + '" data-name="' + encodeURIComponent(pkg.name) + '" onclick="copyDependency(this)">📋 Copy to Clipboard</button>';
		cardHTML += "</div>";

		card.innerHTML = cardHTML;
		grid.appendChild(card);
	});

	vscode.setState({ language: currentLanguage, query: searchInput.value, results: results });
}

function copyDependency(btn) {
	const text = decodeURIComponent(btn.getAttribute("data-text"));
	const name = decodeURIComponent(btn.getAttribute("data-name"));
	vscode.postMessage({ command: "copyToClipboard", text: text, name: name });
	btn.innerHTML = "✅ Copied!";
	btn.classList.add("copied");
	setTimeout(function () {
		btn.innerHTML = "📋 Copy to Clipboard";
		btn.classList.remove("copied");
	}, 2000);
	showToast(name);
}

function showToast(name) {
	const toast = document.createElement("div");
	toast.className = "toast";
	toast.innerHTML = "✅ <strong>" + escapeHtml(name) + "</strong> copied!";
	toastContainer.appendChild(toast);
	setTimeout(function () {
		toast.remove();
	}, 2500);
}

function closePanel() {
	vscode.postMessage({ command: "close" });
}

function escapeHtml(text) {
	if (!text) return "";
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

window.addEventListener("message", function (event) {
	const msg = event.data;
	if (msg.command === "setLanguages") {
		langSelect.innerHTML = '<option value="">Choose Language...</option>';
		msg.languages.forEach(function (lang) {
			const option = document.createElement("option");
			option.value = lang;
			const emojis = {
				Java: "☕",
				JavaScript: "💛",
				TypeScript: "💙",
				"C#": "🔷",
				Ruby: "💎",
				Rust: "🦀",
				Kotlin: "🟣",
				Groovy: "⭐",
			};
			option.textContent = (emojis[lang] || "📦") + " " + lang;
			langSelect.appendChild(option);
		});
		const state = vscode.getState();
		if (state && state.language) {
			langSelect.value = state.language;
			currentLanguage = state.language;
			searchInput.disabled = false;
			searchBtn.disabled = false;
			if (state.query) searchInput.value = state.query;
			if (state.results) displayResults(state.results);
		}
	} else if (msg.command === "searchResults") {
		displayResults(msg.results);
	} else if (msg.command === "searchError") {
		resultsDiv.innerHTML = '<div class="empty-state"><div class="icon">❌</div><h2>Search Failed</h2><p>' + escapeHtml(msg.error) + "</p></div>";
	}
});

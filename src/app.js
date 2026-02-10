const APP_NAME = "nametrace";
const APP_VERSION = "0.1.0";
const nameInput = document.getElementById("nameInput");
const checkButton = document.getElementById("checkButton");
const inputError = document.getElementById("inputError");
const resultsBody = document.getElementById("resultsBody");
const riskSummary = document.getElementById("riskSummary");
const suggestionsList = document.getElementById("suggestionsList");
const appVersion = document.getElementById("appVersion");
const appName = document.getElementById("appName");

const BASE_SUGGESTIONS = [
	(name) => `${name}-rs`,
	(name) => `git-${name}`,
	(name) => `${name}-cli`,
	(name) => `${name}-dev`,
	(name) => `${name}x`,
];

const SERVICES = [
	{
		key: "crates",
		label: "crates.io",
		check: checkCrates,
	},
	{
		key: "github",
		label: "GitHub",
		check: checkGitHub,
		formatDetails: buildGitHubDetails,
	},
	{
		key: "homebrew",
		label: "Homebrew",
		check: checkHomebrew,
	},
	{
		key: "npm",
		label: "npm",
		check: checkNpm,
	},
	{
		key: "nuget",
		label: "NuGet",
		check: checkNuGet,
	},
	{
		key: "powershell",
		label: "PowerShell Gallery",
		check: checkPowerShellGallery,
	},
	{
		key: "pypi",
		label: "PyPI",
		check: checkPyPi,
	},
	{
		key: "rubygems",
		label: "RubyGems",
		check: checkRubyGems,
	},
	{
		key: "maven",
		label: "Maven Central",
		check: checkMavenCentral,
	},
];

checkButton.addEventListener("click", () => {
	handleCheck();
});

nameInput.addEventListener("keydown", (event) => {
	if (event.key === "Enter") {
		handleCheck();
	}
});

if (appVersion) {
	appVersion.textContent = `v${APP_VERSION}`;
}

if (appName) {
	appName.textContent = APP_NAME;
}

if (document?.title) {
	document.title = APP_NAME;
}

function getEnabledServiceKeys() {
	const inputs = Array.from(
		document.querySelectorAll('input[name="serviceFilter"]'),
	);
	const enabled = inputs
		.filter((input) => input.checked)
		.map((input) => input.value);
	return new Set(enabled);
}

function getEnabledServices() {
	const enabled = getEnabledServiceKeys();
	return SERVICES.filter((service) => enabled.has(service.key));
}

function normalizeName(value) {
	return value.trim().toLowerCase();
}

function setLoading(isLoading) {
	checkButton.disabled = isLoading;
	checkButton.textContent = isLoading ? "Checking..." : "Check";
}

function clearOutput(enabledServices) {
	const checks = {};
	for (const service of enabledServices) {
		if (service.key === "github") {
			checks[service.key] = {
				status: "unknown",
				details: "Checking...",
				count: 0,
				examples: [],
				exact: false,
			};
			continue;
		}
		if (service.key === "homebrew") {
			checks[service.key] = {
				status: "unknown",
				details: "Checking...",
				note: "best-effort",
			};
			continue;
		}
		checks[service.key] = { status: "unknown", details: "Checking..." };
	}

	renderTable(checks, enabledServices);
	if (
		enabledServices.some((service) => service.key === "crates") &&
		enabledServices.some((service) => service.key === "github")
	) {
		riskSummary.innerHTML = `<p class="muted">Waiting for crates.io and GitHub...</p>`;
	} else {
		riskSummary.innerHTML = `<p class="muted">Enable crates.io and GitHub to see risk summary.</p>`;
	}
	suggestionsList.innerHTML = `<li class="muted">Waiting for risk summary...</li>`;
	return checks;
}

async function handleCheck() {
	const name = normalizeName(nameInput.value);
	inputError.textContent = "";

	if (!name) {
		inputError.textContent = "Please enter a project name.";
		return;
	}

	setLoading(true);
	const enabledServices = getEnabledServices();
	if (enabledServices.length === 0) {
		riskSummary.innerHTML = `<p class="muted">Select at least one service to run checks.</p>`;
		suggestionsList.innerHTML = `<li class="muted">No services selected.</li>`;
		resultsBody.innerHTML = `
      <tr>
        <td colspan="3" class="empty">Select services to run checks.</td>
      </tr>
    `;
		setLoading(false);
		return;
	}
	const checks = clearOutput(enabledServices);
	let riskReady = false;

	const pending = enabledServices.map((service) =>
		service.check(name).then((result) => {
			checks[service.key] = result;
			renderTable(checks, enabledServices);

			if (!riskReady && checks.crates && checks.github) {
				const resultData = buildResult(
					name,
					checks.crates,
					checks.github,
					checks.homebrew,
					checks.npm,
					checks.nuget,
					checks.powershell,
					checks.pypi,
					checks.rubygems,
					checks.maven,
				);
				renderRisk(resultData);
				void renderSuggestions(resultData);
				riskReady = true;
			}
		}),
	);

	await Promise.all(pending);
	setLoading(false);
}

const CORS_PROXY = "https://api.allorigins.win/raw?url=";
const JINA_PROXY = "https://r.jina.ai/http://";

function buildAllOriginsUrl(url) {
	return `${CORS_PROXY}${encodeURIComponent(url)}`;
}

function buildJinaUrl(url) {
	return `${JINA_PROXY}${url.replace(/^https?:\/\//, "")}`;
}

async function fetchJsonWithCorsFallback(url, options = {}) {
	const { preferProxy = false } = options;
	if (preferProxy) {
		try {
			const proxyResponse = await fetch(
				`${CORS_PROXY}${encodeURIComponent(url)}`,
			);
			if (!proxyResponse.ok) {
				return { ok: false, response: proxyResponse };
			}
			const data = await proxyResponse.json();
			return { ok: true, response: proxyResponse, data, viaProxy: true };
		} catch (proxyError) {
			return { ok: false, response: null, error: proxyError };
		}
	}

	try {
		const response = await fetch(url);
		if (!response.ok) {
			return { ok: false, response };
		}
		const data = await response.json();
		return { ok: true, response, data };
	} catch (error) {
		try {
			const proxyResponse = await fetch(
				`${CORS_PROXY}${encodeURIComponent(url)}`,
			);
			if (!proxyResponse.ok) {
				return { ok: false, response: proxyResponse };
			}
			const data = await proxyResponse.json();
			return { ok: true, response: proxyResponse, data, viaProxy: true };
		} catch (proxyError) {
			return { ok: false, response: null, error: proxyError };
		}
	}
}

async function fetchTextWithCorsFallback(url, options = {}) {
	const { preferProxy = false, proxyProviders = [buildAllOriginsUrl] } =
		options;

	const tryProxy = async () => {
		let lastResponse = null;
		let lastError = null;
		for (const provider of proxyProviders) {
			try {
				const proxyUrl = provider(url);
				const proxyResponse = await fetch(proxyUrl);
				if (!proxyResponse.ok) {
					lastResponse = proxyResponse;
					continue;
				}
				const data = await proxyResponse.text();
				return { ok: true, response: proxyResponse, data, viaProxy: true };
			} catch (proxyError) {
				lastError = proxyError;
			}
		}
		return { ok: false, response: lastResponse, error: lastError };
	};

	if (preferProxy) {
		return await tryProxy();
	}

	try {
		const response = await fetch(url);
		if (!response.ok) {
			return { ok: false, response };
		}
		const data = await response.text();
		return { ok: true, response, data };
	} catch (error) {
		return await tryProxy();
	}
}

function formatExamples(examples) {
	if (!Array.isArray(examples) || examples.length === 0) {
		return "";
	}

	const trimmed = examples
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter(Boolean)
		.slice(0, 2)
		.map((item) => (item.length > 40 ? `${item.slice(0, 37)}…` : item));

	return trimmed.length ? `Examples: ${trimmed.join(", ")}` : "";
}

function clampDetails(text, maxLength = 140) {
	if (typeof text !== "string") {
		return "";
	}
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength - 1)}…`;
}

async function checkCrates(name) {
	const url = `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`;

	try {
		const response = await fetch(url);

		if (response.status === 404) {
			return { status: "not_found", details: "No crate found" };
		}

		if (!response.ok) {
			return {
				status: "unknown",
				details: `Error: ${response.status}`,
			};
		}

		const data = await response.json();
		const version = data?.crate?.max_version || "";
		return {
			status: "taken",
			details: version ? `${name} v${version}` : `${name} exists`,
		};
	} catch (error) {
		return {
			status: "unknown",
			details: "Network error",
		};
	}
}

async function checkGitHub(name) {
	const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
		`${name} in:name`,
	)}`;

	try {
		const response = await fetch(url);

		if (response.status === 403) {
			return {
				status: "unknown",
				details: "Rate limit exceeded",
				count: 0,
				examples: [],
				exact: false,
			};
		}

		if (!response.ok) {
			return {
				status: "unknown",
				details: `Error: ${response.status}`,
				count: 0,
				examples: [],
				exact: false,
			};
		}

		const data = await response.json();
		const items = Array.isArray(data.items) ? data.items : [];
		const totalCount =
			typeof data.total_count === "number" ? data.total_count : 0;
		const examples = items.slice(0, 3).map((item) => item.name);
		const exact = items.some(
			(item) => item.name?.toLowerCase() === name.toLowerCase(),
		);

		let status = "not_found";
		let details = "No repositories found";

		if (exact) {
			status = "taken";
			details = "Exact repo name exists";
		} else if (totalCount > 0) {
			status = "similar";
			details = `${totalCount} repos`;
		}

		return { status, details, count: totalCount, examples, exact };
	} catch (error) {
		return {
			status: "unknown",
			details: "Network error",
			count: 0,
			examples: [],
			exact: false,
		};
	}
}

async function checkHomebrew(name) {
	const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
		`brew ${name} in:name`,
	)}`;

	try {
		const response = await fetch(url);

		if (response.status === 403) {
			return {
				status: "unknown",
				details: "Rate limit exceeded",
				note: "best-effort",
			};
		}

		if (!response.ok) {
			return {
				status: "unknown",
				details: `Error: ${response.status}`,
				note: "best-effort",
			};
		}

		const data = await response.json();
		const totalCount =
			typeof data.total_count === "number" ? data.total_count : 0;

		if (totalCount === 0) {
			return {
				status: "not_found",
				details: "Not found (best-effort)",
				note: "best-effort",
			};
		}

		return {
			status: "similar",
			details: `${totalCount} results (best-effort)`,
			note: "best-effort",
		};
	} catch (error) {
		return {
			status: "unknown",
			details: "Network error",
			note: "best-effort",
		};
	}
}

async function checkNpm(name) {
	const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;

	try {
		const response = await fetch(url);

		if (response.status === 404) {
			const searchUrl = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(
				name,
			)}&size=3`;
			const searchResponse = await fetch(searchUrl);
			if (!searchResponse.ok) {
				return {
					status: "unknown",
					details: `Search error: ${searchResponse.status}`,
				};
			}
			const searchData = await searchResponse.json();
			const total = typeof searchData.total === "number" ? searchData.total : 0;
			const objects = Array.isArray(searchData.objects)
				? searchData.objects
				: [];
			const examples = objects
				.slice(0, 3)
				.map((item) => item?.package?.name)
				.filter(Boolean);
			if (total > 0) {
				const exampleText = formatExamples(examples);
				return {
					status: "similar",
					details: [`${total} results`, exampleText]
						.filter(Boolean)
						.join(" · "),
				};
			}
			return { status: "not_found", details: "No package found" };
		}

		if (!response.ok) {
			return { status: "unknown", details: `Error: ${response.status}` };
		}

		const data = await response.json();
		const latest = data?.["dist-tags"]?.latest;
		return {
			status: "taken",
			details: latest ? `${name}@${latest}` : `${name} exists`,
		};
	} catch (error) {
		return { status: "unknown", details: "Network error" };
	}
}

async function checkNuGet(name) {
	const url = `https://api.nuget.org/v3/registration5-semver1/${encodeURIComponent(
		name.toLowerCase(),
	)}/index.json`;

	try {
		const response = await fetch(url);

		if (response.status === 404) {
			const searchUrl = `https://azuresearch-usnc.nuget.org/query?q=${encodeURIComponent(
				name,
			)}&prerelease=false&take=3`;
			const searchResponse = await fetch(searchUrl);
			if (!searchResponse.ok) {
				return {
					status: "unknown",
					details: `Search error: ${searchResponse.status}`,
				};
			}
			const searchData = await searchResponse.json();
			const total =
				typeof searchData.totalHits === "number" ? searchData.totalHits : 0;
			const entries = Array.isArray(searchData.data) ? searchData.data : [];
			const examples = entries
				.slice(0, 3)
				.map((item) => item?.id)
				.filter(Boolean);
			if (total > 0) {
				const exampleText = formatExamples(examples);
				return {
					status: "similar",
					details: [`${total} results`, exampleText]
						.filter(Boolean)
						.join(" · "),
				};
			}
			return { status: "not_found", details: "No package found" };
		}

		if (!response.ok) {
			return { status: "unknown", details: `Error: ${response.status}` };
		}

		const data = await response.json();
		const count = data?.count || 0;
		return {
			status: count > 0 ? "taken" : "not_found",
			details: count > 0 ? "Package exists" : "No package found",
		};
	} catch (error) {
		return { status: "unknown", details: "Network error" };
	}
}

async function checkPowerShellGallery(name) {
	const url = `https://www.powershellgallery.com/api/v2/FindPackagesById()?id='${encodeURIComponent(
		name,
	)}'`;

	try {
		const result = await fetchTextWithCorsFallback(url, {
			preferProxy: true,
			proxyProviders: [buildJinaUrl, buildAllOriginsUrl],
		});
		if (!result.ok) {
			const status = result.response?.status;
			return {
				status: "unknown",
				details: status ? `Error: ${status}` : "Network error",
			};
		}

		const text = result.data;
		const hasEntry = text.includes("<entry>");
		const viaProxyNote = result.viaProxy ? " (via CORS proxy)" : "";
		if (hasEntry) {
			return {
				status: "taken",
				details: `Module exists${viaProxyNote}`,
			};
		}

		const searchUrl = `https://www.powershellgallery.com/api/v2/Search()?searchTerm='${encodeURIComponent(
			name,
		)}'&includePrerelease=false`;
		const searchResult = await fetchTextWithCorsFallback(searchUrl, {
			preferProxy: true,
			proxyProviders: [buildJinaUrl, buildAllOriginsUrl],
		});
		if (!searchResult.ok) {
			const status = searchResult.response?.status;
			return {
				status: "unknown",
				details: status ? `Search error: ${status}` : "Search error",
			};
		}
		const searchText = searchResult.data;
		const entryMatches = searchText.match(/<entry>/g) || [];
		const titles = [];
		const titleRegex = /<title[^>]*>([^<]+)<\/title>/g;
		let titleMatch = titleRegex.exec(searchText);
		while (titleMatch && titles.length < 3) {
			const title = titleMatch[1]?.trim();
			if (title && !title.toLowerCase().includes("search")) {
				titles.push(title);
			}
			titleMatch = titleRegex.exec(searchText);
		}
		const total = entryMatches.length;
		if (total > 0) {
			const exampleText = formatExamples(titles);
			const searchViaProxyNote = searchResult.viaProxy
				? " (via CORS proxy)"
				: "";
			return {
				status: "similar",
				details: [`${total} results${searchViaProxyNote}`, exampleText]
					.filter(Boolean)
					.join(" · "),
			};
		}
		return { status: "not_found", details: `No module found${viaProxyNote}` };
	} catch (error) {
		return { status: "unknown", details: "Network error" };
	}
}

async function checkPyPi(name) {
	const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;

	try {
		const response = await fetch(url);

		if (response.status === 404) {
			const searchUrl = `https://pypi.org/search/?q=${encodeURIComponent(name)}`;
			const searchResult = await fetchTextWithCorsFallback(searchUrl, {
				preferProxy: true,
			});
			if (!searchResult.ok) {
				const status = searchResult.response?.status;
				return {
					status: "unknown",
					details: status ? `Search error: ${status}` : "Search error",
				};
			}
			const searchText = searchResult.data;
			const matches = searchText.match(/class="package-snippet"/g) || [];
			const names = [];
			const nameRegex = /class="package-snippet__name">([^<]+)<\/span>/g;
			let nameMatch = nameRegex.exec(searchText);
			while (nameMatch && names.length < 3) {
				names.push(nameMatch[1]?.trim());
				nameMatch = nameRegex.exec(searchText);
			}
			const total = matches.length;
			if (total > 0) {
				const exampleText = formatExamples(names.filter(Boolean));
				const viaProxyNote = searchResult.viaProxy ? " (via CORS proxy)" : "";
				return {
					status: "similar",
					details: [`${total} results${viaProxyNote}`, exampleText]
						.filter(Boolean)
						.join(" · "),
				};
			}
			return { status: "not_found", details: "No package found" };
		}

		if (!response.ok) {
			return { status: "unknown", details: `Error: ${response.status}` };
		}

		const data = await response.json();
		const version = data?.info?.version;
		return {
			status: "taken",
			details: version ? `${name} ${version}` : `${name} exists`,
		};
	} catch (error) {
		return { status: "unknown", details: "Network error" };
	}
}

async function checkRubyGems(name) {
	const url = `https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`;

	try {
		const response = await fetch(url);

		if (response.status === 404) {
			const searchUrl = `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent(
				name,
			)}`;
			const searchResponse = await fetch(searchUrl);
			if (!searchResponse.ok) {
				return {
					status: "unknown",
					details: `Search error: ${searchResponse.status}`,
				};
			}
			const searchData = await searchResponse.json();
			const results = Array.isArray(searchData) ? searchData : [];
			const total = results.length;
			const examples = results
				.slice(0, 3)
				.map((item) => item?.name)
				.filter(Boolean);
			if (total > 0) {
				const exampleText = formatExamples(examples);
				return {
					status: "similar",
					details: [`${total} results`, exampleText]
						.filter(Boolean)
						.join(" · "),
				};
			}
			return { status: "not_found", details: "No gem found" };
		}

		if (!response.ok) {
			return { status: "unknown", details: `Error: ${response.status}` };
		}

		const data = await response.json();
		const version = data?.version;
		return {
			status: "taken",
			details: version ? `${name} ${version}` : `${name} exists`,
		};
	} catch (error) {
		return { status: "unknown", details: "Network error" };
	}
}

async function checkMavenCentral(name) {
	const url = `https://search.maven.org/solrsearch/select?q=${encodeURIComponent(
		`a:${name}`,
	)}&rows=1&wt=json`;

	try {
		const result = await fetchJsonWithCorsFallback(url, { preferProxy: true });
		if (!result.ok) {
			const status = result.response?.status;
			return {
				status: "unknown",
				details: status ? `Error: ${status}` : "Network error",
			};
		}

		const data = result.data;
		const found = data?.response?.numFound > 0;
		const viaProxyNote = result.viaProxy ? " (via CORS proxy)" : "";
		if (found) {
			return {
				status: "taken",
				details: `Artifact exists${viaProxyNote}`,
			};
		}

		const searchUrl = `https://search.maven.org/solrsearch/select?q=${encodeURIComponent(
			name,
		)}&rows=3&wt=json`;
		const searchResult = await fetchJsonWithCorsFallback(searchUrl, {
			preferProxy: true,
		});
		if (!searchResult.ok) {
			const status = searchResult.response?.status;
			return {
				status: "unknown",
				details: status ? `Search error: ${status}` : "Search error",
			};
		}
		const searchData = searchResult.data;
		const total = searchData?.response?.numFound || 0;
		const docs = Array.isArray(searchData?.response?.docs)
			? searchData.response.docs
			: [];
		const examples = docs
			.slice(0, 3)
			.map((doc) => doc?.a)
			.filter(Boolean);
		if (total > 0) {
			const exampleText = formatExamples(examples);
			const searchViaProxyNote = searchResult.viaProxy
				? " (via CORS proxy)"
				: "";
			return {
				status: "similar",
				details: [`${total} results${searchViaProxyNote}`, exampleText]
					.filter(Boolean)
					.join(" · "),
			};
		}
		return { status: "not_found", details: `No artifact found${viaProxyNote}` };
	} catch (error) {
		return { status: "unknown", details: "Network error" };
	}
}

function buildResult(
	name,
	cratesResult,
	githubResult,
	homebrewResult,
	npmResult,
	nugetResult,
	powershellResult,
	pypiResult,
	rubyGemsResult,
	mavenResult,
) {
	const riskLevel = calculateRiskLevel(cratesResult, githubResult);
	return {
		name,
		checks: {
			crates: cratesResult,
			github: githubResult,
			homebrew: homebrewResult,
			npm: npmResult,
			nuget: nugetResult,
			powershell: powershellResult,
			pypi: pypiResult,
			rubygems: rubyGemsResult,
			maven: mavenResult,
		},
		risk_level: riskLevel,
	};
}

function calculateRiskLevel(cratesResult, githubResult) {
	if (cratesResult.status === "taken" || githubResult.exact) {
		return "high";
	}

	if (githubResult.count > 5) {
		return "medium";
	}

	return "low";
}

function renderResults(result, enabledServices = SERVICES) {
	renderTable(result.checks, enabledServices);
	renderRisk(result);
	renderSuggestions(result);
}

function renderTable(checks, enabledServices = SERVICES) {
	const rows = enabledServices.map((service) => {
		const result = checks[service.key];
		if (!result) {
			return "";
		}
		const details = service.formatDetails
			? service.formatDetails(result)
			: result.details;
		return buildRow(service.label, result.status, details);
	});

	resultsBody.innerHTML = rows.filter(Boolean).join("");
}

function buildGitHubDetails(github) {
	if (github.status === "unknown") {
		return github.details;
	}

	const examples = github.examples.length
		? `Examples: ${github.examples.join(", ")}`
		: "";
	const count = github.count ? `${github.count} repos` : github.details;

	return [count, examples].filter(Boolean).join(" · ");
}

function buildRow(label, status, details) {
	return `
    <tr>
			<td data-label="Ecosystem">${label}</td>
			<td data-label="Status">${formatStatusBadge(status)}</td>
			<td data-label="Details" class="details-cell">${clampDetails(details)}</td>
    </tr>
  `;
}

function formatStatusBadge(status) {
	const map = {
		not_found: { text: "✅ Not found", className: "status-not-found" },
		taken: { text: "❌ Taken", className: "status-taken" },
		similar: { text: "⚠️ Similar", className: "status-similar" },
		unknown: { text: "❓ Unknown", className: "status-unknown" },
	};

	const item = map[status] || map.unknown;
	return `<span class="status-badge ${item.className}">${item.text}</span>`;
}

function renderRisk(result) {
	const reasons = [];

	if (result.checks.crates.status === "taken") {
		reasons.push("Exact crate name exists");
	}

	if (result.checks.github.exact) {
		reasons.push("Exact GitHub repo name exists");
	} else if (result.checks.github.count > 5) {
		reasons.push("Multiple GitHub repos with similar names");
	}

	if (reasons.length === 0) {
		reasons.push("No exact matches detected");
	}

	riskSummary.innerHTML = `
    <h3>
      Collision risk:
      <span class="risk-level ${result.risk_level}">
        ${result.risk_level.toUpperCase()}
      </span>
    </h3>
    <ul>
      ${reasons.map((reason) => `<li>${reason}</li>`).join("")}
    </ul>
  `;
}

async function renderSuggestions(result) {
	if (result.risk_level === "low") {
		suggestionsList.innerHTML = '<li class="muted">No suggestions needed.</li>';
		return;
	}

	const baseSuggestions = BASE_SUGGESTIONS.map((builder) =>
		builder(result.name),
	);
	const unique = Array.from(new Set(baseSuggestions));
	const availability = await Promise.all(
		unique.map((suggestion) => checkCrateAvailabilityOnly(suggestion)),
	);

	const filtered = unique.filter((_, index) => availability[index]).slice(0, 5);

	if (filtered.length === 0) {
		suggestionsList.innerHTML =
			'<li class="muted">No available suggestions found.</li>';
		return;
	}

	suggestionsList.innerHTML = filtered
		.map((suggestion) => `<li>${suggestion}</li>`)
		.join("");
}

async function checkCrateAvailabilityOnly(name) {
	const url = `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`;

	try {
		const response = await fetch(url);
		return response.status === 404;
	} catch (error) {
		return false;
	}
}

import { readFile, writeFile } from "node:fs/promises";

const outputPath =
  process.argv[2] ?? "profile-3d-contrib/profile-night-view.svg";
const owner = process.env.PROFILE_OWNER;
const token = process.env.PROFILE_STATS_TOKEN;

if (!owner || !token) {
  throw new Error("PROFILE_OWNER and PROFILE_STATS_TOKEN are required.");
}

const privateLabs = [
  { repository: "csharp-lab", language: "C#" },
  { repository: "dart-lab", language: "Dart" },
];

const colors = new Map([
  ["C#", "#178600"],
  ["Dart", "#00B4AB"],
  ["JavaScript", "#f1e05a"],
  ["Python", "#3572A5"],
  ["TypeScript", "#3178c6"],
  ["other", "#444444"],
]);

async function countRecentCommits(repository) {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  let total = 0;

  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(
      `https://api.github.com/repos/${owner}/${repository}/commits`,
    );
    url.searchParams.set("author", owner);
    url.searchParams.set("since", since);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MingoUwU-profile-language-chart",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Unable to read ${owner}/${repository}: ${response.status} ${response.statusText}`,
      );
    }

    const commits = await response.json();
    total += commits.length;
    if (commits.length < 100) break;
  }

  return total;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function point(radius, angle) {
  return {
    x: radius * Math.cos(angle),
    y: radius * Math.sin(angle),
  };
}

function createLanguageGroup(languages) {
  const height = 260;
  const rowCount = 8;
  const offset = (rowCount - languages.length) / 2 + 0.5;
  const fontSize = height / rowCount / 1.5;
  const rowHeight = height / rowCount;

  const markers = languages
    .map((entry, index) => {
      const y = (index + offset) * rowHeight - fontSize / 2;
      return `<rect x="0" y="${y}" width="${fontSize}" height="${fontSize}" fill="${entry.color}" stroke="#00000f" stroke-width="1px"></rect>`;
    })
    .join("");

  const labels = languages
    .map((entry, index) => {
      const y = (index + offset) * rowHeight;
      return `<text dominant-baseline="middle" x="${fontSize * 1.2}" y="${y}" fill="#eeeeff" font-size="${fontSize}px">${escapeXml(entry.language)}</text>`;
    })
    .join("");

  const total = languages.reduce((sum, entry) => sum + entry.contributions, 0);
  let startAngle = -Math.PI / 2;
  const paths = languages
    .map((entry, index) => {
      const endAngle =
        startAngle + (entry.contributions / total) * Math.PI * 2;
      const outerStart = point(117, startAngle);
      const outerEnd = point(117, endAngle);
      const innerEnd = point(65, endAngle);
      const innerStart = point(65, startAngle);
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
      const path = `M${outerStart.x},${outerStart.y}A117,117,0,${largeArc},1,${outerEnd.x},${outerEnd.y}L${innerEnd.x},${innerEnd.y}A65,65,0,${largeArc},0,${innerStart.x},${innerStart.y}Z`;
      startAngle = endAngle;
      return `<path d="${path}" style="fill: ${entry.color};" stroke="#00000f" stroke-width="2px"><title>${escapeXml(entry.language)} ${entry.contributions}</title></path>`;
    })
    .join("");

  return `<g transform="translate(40, 520)"><g transform="translate(273, 0)">${markers}${labels}</g><g transform="translate(130, 130)">${paths}</g></g>`;
}

const svg = await readFile(outputPath, "utf8");
const startMarker = '<g transform="translate(40, 520)">';
const endMarker =
  '<g><text style="font-size: 32px; font-weight: bold;" x="384"';
const start = svg.indexOf(startMarker);
const end = svg.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  throw new Error("Unable to locate the language chart in the generated SVG.");
}

const currentGroup = svg.slice(start, end);
const contributions = new Map();
const titlePattern = /<title>([^<]+) (\d+)<\/title>/g;

for (const match of currentGroup.matchAll(titlePattern)) {
  contributions.set(match[1], Number(match[2]));
}

for (const lab of privateLabs) {
  const privateCommitCount = await countRecentCommits(lab.repository);
  contributions.set(
    lab.language,
    (contributions.get(lab.language) ?? 0) + privateCommitCount,
  );
}

const existingOther = contributions.get("other") ?? 0;
contributions.delete("other");

const sorted = [...contributions.entries()]
  .map(([language, count]) => ({
    language,
    contributions: count,
    color: colors.get(language) ?? "#444444",
  }))
  .sort((left, right) => right.contributions - left.contributions);

const topLanguages = sorted.slice(0, 5);
const otherContributions =
  existingOther +
  sorted
    .slice(5)
    .reduce((sum, entry) => sum + entry.contributions, 0);

if (otherContributions > 0) {
  topLanguages.push({
    language: "other",
    contributions: otherContributions,
    color: colors.get("other"),
  });
}

const updatedSvg =
  svg.slice(0, start) +
  createLanguageGroup(topLanguages) +
  svg.slice(end);

await writeFile(outputPath, updatedSvg, "utf8");
console.log(
  `Language chart updated: ${topLanguages
    .map((entry) => `${entry.language}=${entry.contributions}`)
    .join(", ")}`,
);

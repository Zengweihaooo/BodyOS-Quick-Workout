// Public, versioned reference data. Personal history never enters this module.
const WGER_ID = /^wger_[0-9a-f]{32}$/;
const GROUPS = [
  ["dumbbell", /哑铃|dumbbells?/g], ["barbell", /杠铃|barbells?/g], ["machine", /器械|器材|machines?|leverage/g],
  ["cable", /绳索|拉力器|滑轮|cables?/g], ["kettlebell", /壶铃|kettlebells?/g],
  ["shoulderpress", /肩部推举|肩上推举|肩部推压|推肩|肩推|shoulder\s+press/g],
  ["chestpress", /胸部推举|胸部推压|推胸|胸推|卧推|bench\s+press|chest\s+press/g],
  ["kickback", /俯身臂屈伸|肱三头肌后踢|哑铃后踢|kickbacks?/g],
  ["triceps", /肱三头肌|三头肌|triceps?/g], ["biceps", /肱二头肌|二头肌|biceps?/g],
  ["curl", /弯举|curls?/g], ["extension", /臂屈伸|伸展|extensions?/g],
  ["row", /划船|rows?/g], ["pulldown", /高位下拉|下拉|pull\s*downs?/g],
  ["pullup", /引体向上|引体|pull\s*ups?/g], ["squat", /深蹲|squats?/g],
  ["deadlift", /硬拉|deadlifts?/g], ["lunge", /弓步|箭步蹲|lunges?/g],
  ["lateral", /侧平举|侧向|lateral/g], ["raise", /平举|raises?/g],
  ["fly", /飞鸟|夹胸|flyes?|flies/g], ["leg", /腿部|腿|legs?/g], ["calf", /小腿|提踵|calves|calf/g],
  ["incline", /上斜|incline/g], ["decline", /下斜|decline/g], ["seated", /坐姿|坐式|seated|sitting/g],
  ["standing", /站姿|站立|standing/g], ["lying", /仰卧|平躺|supine|lying/g],
  ["singlearm", /单臂|单手|单侧|single\s+arm|one\s+arm/g],
  ["neutral", /中立握|对握|neutral\s+grip/g], ["wide", /宽握|宽距|wide\s+grip/g],
  ["close", /窄握|窄距|close\s+grip|narrow\s+grip/g],
];
const SEARCH_GROUPS = GROUPS.map(([token, pattern]) => [token,
  new RegExp(pattern.source.split("|").map(part => /[a-z]/i.test(part) ? "\\b(?:" + part + ")\\b" : part).join("|"), "g")]);
function rawSearchText(value) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\u3400-\u9fff]+/g, " ").trim().replace(/\s+/g, " ");
}
export function normalizeWgerSearch(value) {
  let result = String(value || "").normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[-_]/g, " ");
  for (const [token, pattern] of SEARCH_GROUPS) result = result.replace(pattern, ` ${token} `);
  return result.replace(/[^a-z0-9\u3400-\u9fff]+/g, " ").trim().replace(/\s+/g, " ");
}
export function validateWgerCatalog(data) {
  if (data?.schemaVersion !== "body.os.wger-index.v1" || !Array.isArray(data.items) || data.items.length !== data.count || data.count > 10000) throw new Error("动作目录格式不正确，请稍后重试");
  const seen = new Set();
  for (const item of data.items) {
    if (!WGER_ID.test(item.id) || seen.has(item.id) || !Number.isInteger(item.wgerId) || !item.en || !item.zh || !/^[0-9a-f]{16}-\d{3}\.json$/.test(item.detailFile)) throw new Error("动作目录身份无效");
    seen.add(item.id);
  }
  return data;
}
const searchDocuments = new WeakMap();
function searchDocument(item) {
  if (!searchDocuments.has(item)) {
    const en = item.en || item.canonicalNameEn || "", zh = item.zh || item.name || "";
    const input = [en, zh, item.equipment, ...(item.aliases || [])].join(" ");
    const text = normalizeWgerSearch(input), raw = rawSearchText(input);
    searchDocuments.set(item, { text: text + " " + raw, tokens: (text + " " + raw).split(" "),
      name: normalizeWgerSearch(en + " " + zh), rawName: rawSearchText(en + " " + zh) });
  }
  return searchDocuments.get(item);
}
export function searchWgerCatalog(items, query, { category = "", offset = 0, limit = 24 } = {}) {
  const normalized = normalizeWgerSearch(query), words = normalized.split(" ").filter(Boolean);
  const matches = items.map((item, position) => {
    if (category && item.category !== category) return null;
    const { text, tokens, name, rawName } = searchDocument(item);
    if (!words.every(word => /^[a-z0-9]+$/.test(word) ? tokens.some(token => token.startsWith(word)) : text.includes(word))) return null;
    const score = !normalized ? 0 : name === normalized ? 3 : name.includes(normalized) || rawName.includes(rawSearchText(query)) ? 2 : 1;
    return { item, position, score };
  }).filter(Boolean).sort((a,b) => b.score - a.score || a.position - b.position);
  const start = Math.max(0, offset), size = Math.max(1, Math.min(48, limit));
  return { items: matches.slice(start, start + size).map(x => x.item), total: matches.length,
    nextOffset: start + size < matches.length ? start + size : null };
}
export function createWgerLibraryItem(item, detail) {
  if (!WGER_ID.test(item?.id) || detail?.id !== item.id || detail.wgerId !== item.wgerId) throw new Error("动作详情与目录不一致");
  const descriptionEn = detail.descriptionEn || "", descriptionZh = detail.descriptionZh || "";
  const source = { id: item.wgerId, pageUrl: `https://wger.de/en/exercise/${item.wgerId}`, descriptionEn, descriptionZh,
    author: detail.author || "", license: detail.license || {}, translationLicenseEn: detail.translationLicenseEn || {},
    translationLicenseZh: detail.translationLicenseZh || {}, matchType: "exact" };
  return { id: item.id, name: item.zh, canonicalNameEn: item.en, equipment: item.equipment, category: item.category,
    movementPattern: "external_reference", loadMode: "total", executionMode: "bilateral", sideCount: 1,
    isWger: true, wgerId: item.wgerId, provider: "wger", externalUuid: item.uuid, nameZhSource: item.zhSource,
    aliases: item.aliases || [], reference: { detailsProvider: "wger", detailsStatus: descriptionEn || descriptionZh ? "ready" : "pending",
      mediaStatus: "pending", wger: source, instructionsEn: descriptionEn ? [descriptionEn] : [], instructionsZh: descriptionZh ? [descriptionZh] : [] } };
}
export class WgerLibrary {
  constructor(fetcher = (...args) => fetch(...args)) { this.fetcher = fetcher; this.index = null; this.indexTask = null; this.chunks = new Map(); }
  async load() {
    if (this.index) return this.index;
    if (!this.indexTask) this.indexTask = this.fetcher("./catalog/index.json?v=1")
      .then(async response => { if (!response.ok) throw new Error("全库暂时无法读取；常用和自定义动作仍可用"); return validateWgerCatalog(await response.json()); })
      .then(data => this.index = data).finally(() => this.indexTask = null);
    return this.indexTask;
  }
  async select(id) {
    const index = await this.load(), item = index.items.find(x => x.id === id);
    if (!item) throw new Error("未找到该动作，请重新搜索");
    if (!this.chunks.has(item.detailFile)) {
      const task = this.fetcher(`./catalog/details/${item.detailFile}`).then(async response => {
        if (!response.ok) throw new Error("动作详情未下载成功，请重试");
        return response.json();
      }).catch(error => { this.chunks.delete(item.detailFile); throw error; });
      this.chunks.set(item.detailFile, task);
    }
    const chunk = await this.chunks.get(item.detailFile);
    return createWgerLibraryItem(item, chunk.items?.find(x => x.id === id));
  }
}

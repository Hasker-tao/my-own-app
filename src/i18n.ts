import rawCatalog from "./i18n/en.json";

export type Language = "zh-CN" | "en";
export function normalizeLanguage(value: unknown): Language { return value === "en" ? "en" : "zh-CN"; }

const catalog = rawCatalog as Record<string, string>;
const translatedText = new WeakMap<Text, { source: string; target: string }>();
const translatedAttributes = new WeakMap<Element, Map<string, { source: string; target: string }>>();
const attributes = ["aria-label", "title", "placeholder", "alt"];

function translate(value: string): string {
  const trimmed = value.trim();
  const translation = catalog[trimmed];
  if (translation) return value.replace(trimmed, translation);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekdays: Record<string, string> = { 一: "Mon", 二: "Tue", 三: "Wed", 四: "Thu", 五: "Fri", 六: "Sat", 日: "Sun", 天: "Sun" };
  return value
    .replace(/(\d+)\s*门本学期课程 · 考试前已复习 (\d+)\/(\d+) 个 Part/g,
      "$1 current-semester courses · $2/$3 Parts reviewed before exams")
    .replace(/(\d+)\s*门本学期课程 · 已授课中已复习 (\d+)\/(\d+) 个主题 · 今日 (\d+) 项可选复习建议/g,
      "$1 current-semester courses · $2/$3 taught topics reviewed · $4 optional review suggestions today")
    .replace(/(\d{4})年(\d{1,2})月/g, (_, year: string, month: string) => `${months[Number(month) - 1]} ${year}`)
    .replace(/(\d{1,2})月(\d{1,2})日(?:星期|周)([一二三四五六日天])/g, (_, month: string, day: string, weekday: string) => `${weekdays[weekday]}, ${months[Number(month) - 1]} ${day}`)
    .replace(/(\d{1,2})月(\d{1,2})日/g, (_, month: string, day: string) => `${months[Number(month) - 1]} ${day}`)
    .replace(/(\d+)\s*分钟/g, "$1 min")
    .replace(/(\d+)\s*小时/g, "$1 hr")
    .replace(/另外还有 (\d+) 项/g, "$1 more items")
    .replace(/来自 (首页总览|今日计划|自媒体|开发工作|学习|健身计划|饮食计划|游戏娱乐)/g,
      (_, module: string) => `From ${catalog[module] ?? module}`)
    .replace("备份于", "Backed up on")
    .replace(/(\d+)\s*条计划或记录/g, "$1 plans or records")
    .replace(/消息（(\d+)）/g, "Messages ($1)")
    .replace(/待确认\s*\/\s*(\d+)/g, "Pending verification / $1")
    .replace("从重点开始", "start with what matters");
}

function updateText(node: Text, language: Language) {
  const current = node.nodeValue ?? "";
  const previous = translatedText.get(node);
  if (language === "zh-CN") {
    if (previous && current === previous.target) node.nodeValue = previous.source;
    translatedText.delete(node);
    return;
  }
  if (previous?.target === current) return;
  const target = translate(current);
  if (target !== current) { translatedText.set(node, { source: current, target }); node.nodeValue = target; }
}

function updateElement(element: Element, language: Language) {
  const previous = translatedAttributes.get(element) ?? new Map();
  for (const name of attributes) {
    const current = element.getAttribute(name);
    if (current === null) continue;
    const old = previous.get(name);
    if (language === "zh-CN") {
      if (old && current === old.target) element.setAttribute(name, old.source);
      previous.delete(name);
    } else if (old?.target !== current) {
      const target = translate(current);
      if (target !== current) { previous.set(name, { source: current, target }); element.setAttribute(name, target); }
    }
  }
  if (previous.size) translatedAttributes.set(element, previous);
  else translatedAttributes.delete(element);
}

function updateTree(root: Node, language: Language) {
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { updateText(node as Text, language); return; }
    if (!(node instanceof Element)) return;
    if (node.matches("script, style, [contenteditable='true']")) return;
    updateElement(node, language);
    for (const child of node.childNodes) visit(child);
  };
  visit(root);
}

export function installLocalization(root: Element, language: Language): () => void {
  document.documentElement.lang = language;
  updateTree(root, language);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") updateTree(record.target, language);
      else if (record.type === "attributes") updateElement(record.target as Element, language);
      else for (const node of record.addedNodes) updateTree(node, language);
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: attributes });
  return () => observer.disconnect();
}

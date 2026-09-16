// researchmap の公開APIから業績情報を取得し，ページ本体に描画する．
// 依存ライブラリは使用せず，DOM APIのみで構築する（innerHTMLへの外部データ流し込みを避けるため）．

const API_BASE = "https://api.researchmap.jp";
const PAGE_LIMIT = 100;
const MAX_PAGES = 10; // 1種別あたり最大 1000 件まで取得する安全上限

const app = document.getElementById("app");

/** クエリパラメータ `permalink` を取得する．
 * @returns {string | null} permalink 文字列，未指定の場合は null
 */
function getPermalink() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("permalink");
  return value ? value.trim() : null;
}

/** ローカライズされたテキストフィールド（{ja, en, ...}）から表示用文字列を取り出す．
 * @param {Object|undefined} field - 言語コードをキーに持つオブジェクト
 * @returns {string} ja を優先し，なければ en，どちらも無ければ最初の値
 */
function localizedText(field) {
  if (!field || typeof field !== "object") return "";
  if (field.ja) return field.ja;
  if (field.en) return field.en;
  const values = Object.values(field);
  return typeof values[0] === "string" ? values[0] : "";
}

/** 人名リストのフィールド（{ja: [{name}], en: [{name}]}）から表示用の配列を取り出す．
 * @param {Object|undefined} field
 * @returns {string[]}
 */
function localizedNameList(field) {
  if (!field || typeof field !== "object") return [];
  const list = field.ja || field.en || Object.values(field)[0];
  if (!Array.isArray(list)) return [];
  return list.map((p) => p && p.name).filter(Boolean);
}

/** see_also 配列から指定ラベルのリンクURLを探す．
 * @param {Array|undefined} seeAlso
 * @param {string} label
 * @returns {string|null}
 */
function findLink(seeAlso, label) {
  if (!Array.isArray(seeAlso)) return null;
  const found = seeAlso.find((s) => s && s.label === label && s["@id"]);
  return found ? found["@id"] : null;
}

/** 期間表示用の文字列を組み立てる（終了日 "9999" は「現在」として扱う）．
 * @param {string|undefined} from
 * @param {string|undefined} to
 * @returns {string}
 */
function formatPeriod(from, to) {
  if (!from && !to) return "";
  const toLabel = !to || to === "9999" ? "現在" : to;
  if (from && to) return `${from} 〜 ${toLabel}`;
  return from || toLabel;
}

/** researchmap API のコレクションエンドポイントをページングしながら全件取得する．
 * @param {string} permalink
 * @param {string} endpoint - 例: "published_papers"
 * @returns {Promise<Object[]>} items の配列（取得失敗時は空配列）
 */
async function fetchCollection(permalink, endpoint) {
  const items = [];
  let start = 1;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${API_BASE}/${encodeURIComponent(permalink)}/${endpoint}?limit=${PAGE_LIMIT}&start=${start}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (items.length > 0) break; // 一部取得済みならそこまでの結果を使う
      throw new Error(`${endpoint}: HTTP ${res.status}`);
    }
    const data = await res.json();
    const pageItems = Array.isArray(data.items) ? data.items : [];
    items.push(...pageItems);
    const total = typeof data.total_items === "number" ? data.total_items : items.length;
    if (items.length >= total || pageItems.length === 0) break;
    start += PAGE_LIMIT;
  }
  return items;
}

/** 研究者のプロフィール本体（氏名・所属・学位）を取得する．
 * @param {string} permalink
 * @returns {Promise<Object>}
 */
async function fetchProfile(permalink) {
  const url = `${API_BASE}/${encodeURIComponent(permalink)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`profile: HTTP ${res.status}`);
  }
  return res.json();
}

/** タグ名・クラス名・子要素からDOM要素を組み立てる小さなヘルパー．
 * 子要素の文字列は必ず textContent として扱われるため，HTMLとして解釈されない．
 * @param {string} tag
 * @param {Object} [opts]
 * @param {string} [opts.className]
 * @param {(Node|string)[]} [opts.children]
 * @param {Object} [opts.attrs]
 * @returns {HTMLElement}
 */
function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.attrs) {
    for (const [key, value] of Object.entries(opts.attrs)) {
      node.setAttribute(key, value);
    }
  }
  for (const child of opts.children || []) {
    if (child === null || child === undefined || child === "") continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** 案内・エラーメッセージのみを表示する．
 * @param {string} message
 * @param {boolean} [isError]
 */
function renderMessage(message, isError = false) {
  app.replaceChildren(
    el("p", { className: isError ? "status-message error" : "status-message", children: [message] })
  );
}

/** プロフィールヘッダー（氏名・所属・学位・研究キーワード）を描画する．
 * @param {Object} profile
 * @param {Object[]} interests - research_interests の items
 * @returns {HTMLElement}
 */
function renderHeader(profile, interests) {
  const nameJa = `${localizedText(profile.family_name)} ${localizedText(profile.given_name)}`.trim();
  const nameEn = [profile.family_name?.en, profile.given_name?.en].filter(Boolean).join(" ");
  const kana = [profile.family_name?.["ja-Kana"], profile.given_name?.["ja-Kana"]].filter(Boolean).join(" ");

  const affiliation = Array.isArray(profile.affiliations) ? profile.affiliations[0] : null;
  const degree = Array.isArray(profile.degrees) ? profile.degrees[0] : null;

  const children = [];
  children.push(el("p", { className: "name-ja", children: [nameJa || localizedText(profile.family_name)] }));
  if (kana) children.push(el("p", { className: "name-kana", children: [kana] }));
  if (nameEn) children.push(el("p", { className: "name-en", children: [nameEn] }));

  if (affiliation) {
    const parts = [
      localizedText(affiliation.affiliation),
      localizedText(affiliation.section),
    ].filter(Boolean);
    const job = localizedText(affiliation.job);
    children.push(
      el("p", {
        className: "profile-affiliation",
        children: [parts.join(" ") + (job ? "　" : ""), job ? el("span", { className: "job", children: [job] }) : ""],
      })
    );
  }

  if (degree) {
    const degreeText = localizedText(degree.degree);
    if (degreeText) children.push(el("p", { className: "profile-degree", children: [degreeText] }));
  }

  if (interests.length > 0) {
    const list = el("ul", {
      className: "keyword-list",
      children: interests.map((i) => el("li", { children: [localizedText(i.keyword)] })),
    });
    children.push(list);
  }

  return el("header", { className: "profile-header", children });
}

/** 汎用の一覧セクションを描画する（該当データが0件の場合は null を返す）．
 * @param {string} heading
 * @param {Object[]} items
 * @param {(item: Object) => HTMLElement} renderItem
 * @returns {HTMLElement|null}
 */
function renderSection(heading, items, renderItem) {
  if (!items || items.length === 0) return null;
  const list = el("ul", { className: "item-list", children: items.map(renderItem) });
  return el("section", { className: "section", children: [el("h2", { children: [heading] }), list] });
}

/** 業績1件分の <li> を組み立てる共通ヘルパー．
 * @param {string} title
 * @param {string} meta - 著者・雑誌・日付などをまとめた1行
 * @param {string} [sub] - 補足行（招待講演の表示など）
 * @param {string} [link] - DOI等の外部リンク
 * @returns {HTMLElement}
 */
function itemLi(title, meta, sub, link) {
  const children = [el("p", { className: "item-title", children: [title || "(タイトル未登録)"] })];
  if (meta) {
    const metaChildren = [meta];
    if (link) {
      metaChildren.push(" ");
      metaChildren.push(el("a", { attrs: { href: link, target: "_blank", rel: "noopener noreferrer" }, children: ["リンク"] }));
    }
    children.push(el("p", { className: "item-meta", children: metaChildren }));
  }
  if (sub) children.push(el("p", { className: "item-sub", children: [sub] }));
  return el("li", { children });
}

function renderPaper(p) {
  const authors = localizedNameList(p.authors).join(", ");
  const venue = localizedText(p.publication_name);
  const pages =
    p.starting_page && p.ending_page
      ? `pp.${p.starting_page}-${p.ending_page}`
      : p.starting_page
        ? `p.${p.starting_page}`
        : "";
  const meta = [authors, venue, pages, p.publication_date].filter(Boolean).join("，");
  const link = findLink(p.see_also, "doi");
  return itemLi(localizedText(p.paper_title), meta, "", link);
}

function renderBook(b) {
  const authors = localizedNameList(b.authors).join(", ");
  const meta = [authors, localizedText(b.publisher), b.publication_date].filter(Boolean).join("，");
  return itemLi(localizedText(b.book_title), meta);
}

function renderPresentation(pr) {
  const presenters = localizedNameList(pr.presenters).join(", ");
  const event = localizedText(pr.event);
  const date = pr.publication_date || pr.from_event_date;
  const meta = [presenters, event, date].filter(Boolean).join("，");
  const sub = pr.invited === true ? "招待講演" : "";
  return itemLi(localizedText(pr.presentation_title), meta, sub);
}

function renderResearchProject(rp) {
  const investigators = localizedNameList(rp.investigators).join(", ");
  const org = [localizedText(rp.offer_organization), localizedText(rp.system_name), localizedText(rp.category)]
    .filter(Boolean)
    .join(" ");
  const period = formatPeriod(rp.from_date, rp.to_date);
  const meta = [investigators, org, period].filter(Boolean).join("，");
  return itemLi(localizedText(rp.research_project_title), meta);
}

function renderAssociation(m) {
  return itemLi(localizedText(m.academic_society_name), "");
}

function renderCommittee(c) {
  const meta = [localizedText(c.association), formatPeriod(c.from_date, c.to_date)].filter(Boolean).join("，");
  return itemLi(localizedText(c.committee_name), meta);
}

function renderExperience(e) {
  const parts = [localizedText(e.affiliation), localizedText(e.section)].filter(Boolean).join(" ");
  const job = localizedText(e.job);
  const meta = [formatPeriod(e.from_date, e.to_date)].filter(Boolean).join("，");
  return itemLi([parts, job].filter(Boolean).join("　"), meta);
}

function renderEducation(e) {
  const title = localizedText(e.affiliation);
  const meta = [localizedText(e.department), localizedText(e.course), formatPeriod(e.from_date, e.to_date)]
    .filter(Boolean)
    .join("，");
  return itemLi(title, meta);
}

function renderAward(a) {
  const winners = localizedNameList(a.winners).join(", ");
  const meta = [winners, localizedText(a.association), a.award_date].filter(Boolean).join("，");
  return itemLi(localizedText(a.award_name), meta);
}

function renderMisc(m) {
  const authors = localizedNameList(m.authors).join(", ");
  const meta = [authors, localizedText(m.publication_name), m.publication_date].filter(Boolean).join("，");
  return itemLi(localizedText(m.paper_title), meta);
}

/** iframe埋め込み時に本文の高さを親ウィンドウへ通知する． */
function setUpResizeNotifier() {
  if (window.self === window.top) return;
  const notify = () => {
    const height = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: "researchmap-profile-viewer:resize", height }, "*");
  };
  const observer = new ResizeObserver(notify);
  observer.observe(document.body);
  notify();
}

async function main() {
  setUpResizeNotifier();

  const permalink = getPermalink();
  if (!permalink) {
    renderMessage(
      "表示する研究者が指定されていません。埋め込み用URLの末尾に \"?permalink=researchmap のpermalink\" を付けてください（例: ?permalink=7000012026）。",
      true
    );
    return;
  }

  let profile;
  try {
    profile = await fetchProfile(permalink);
  } catch (err) {
    renderMessage(
      `researchmap から情報を取得できませんでした（permalink: ${permalink}）。permalinkが正しいか、researchmap側で情報が公開されているかをご確認ください。`,
      true
    );
    return;
  }

  const endpoints = [
    { key: "research_interests", label: "研究キーワード" },
    { key: "research_experience", label: "経歴" },
    { key: "education", label: "学歴" },
    { key: "association_memberships", label: "所属学会" },
    { key: "published_papers", label: "論文" },
    { key: "books_etc", label: "著書" },
    { key: "misc", label: "その他の業績" },
    { key: "presentations", label: "講演・発表" },
    { key: "research_projects", label: "競争的資金・研究課題" },
    { key: "committee_memberships", label: "委員歴" },
    { key: "awards", label: "受賞" },
  ];

  const results = await Promise.allSettled(
    endpoints.map(({ key }) => fetchCollection(permalink, key))
  );

  const data = {};
  endpoints.forEach(({ key }, i) => {
    data[key] = results[i].status === "fulfilled" ? results[i].value : [];
  });

  const sortByDateDesc = (items, dateField) =>
    [...items].sort((a, b) => String(b[dateField] || "").localeCompare(String(a[dateField] || "")));

  const sections = [
    renderSection("経歴", data.research_experience, renderExperience),
    renderSection("学歴", data.education, renderEducation),
    renderSection("所属学会", data.association_memberships, renderAssociation),
    renderSection("論文", sortByDateDesc(data.published_papers, "publication_date"), renderPaper),
    renderSection("著書", sortByDateDesc(data.books_etc, "publication_date"), renderBook),
    renderSection("その他の業績（MISC）", sortByDateDesc(data.misc, "publication_date"), renderMisc),
    renderSection("講演・発表", sortByDateDesc(data.presentations, "publication_date"), renderPresentation),
    renderSection("競争的資金・研究課題", data.research_projects, renderResearchProject),
    renderSection("委員歴", data.committee_memberships, renderCommittee),
    renderSection("受賞", data.awards, renderAward),
  ].filter(Boolean);

  const failedEndpoints = endpoints.filter((_, i) => results[i].status === "rejected");

  const container = document.createDocumentFragment();
  container.append(renderHeader(profile, data.research_interests));

  if (failedEndpoints.length > 0) {
    container.append(
      el("p", {
        className: "status-message error",
        children: [
          `一部の情報（${failedEndpoints.map((e) => e.label).join("、")}）を取得できませんでした。時間をおいて再度お試しください。`,
        ],
      })
    );
  }

  sections.forEach((section) => container.append(section));

  container.append(
    el("footer", {
      className: "attribution",
      children: [
        "出典：",
        el("a", {
          attrs: {
            href: `https://researchmap.jp/${encodeURIComponent(permalink)}`,
            target: "_blank",
            rel: "noopener noreferrer",
          },
          children: ["researchmap"],
        }),
      ],
    })
  );

  app.replaceChildren(container);
}

main();

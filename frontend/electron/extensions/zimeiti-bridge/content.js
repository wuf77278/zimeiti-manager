(() => {
  const PLATFORM_HOSTS = [
    { platform: "douyin", label: "抖音", host: "creator.douyin.com" },
    { platform: "xiaohongshu", label: "小红书", host: "creator.xiaohongshu.com" },
    { platform: "wechat_channels", label: "视频号", host: "channels.weixin.qq.com" },
  ];
  let bridgeContext = null;
  let lastSyncedKey = "";
  let lastCreatorDataSyncKey = "";
  let lastMessageCountKey = "";

  function parseBridgeContext() {
    const params = new URLSearchParams(`${window.location.search || ""}&${window.location.hash.replace(/^#/, "")}`);
    const accountId = params.get("zmt_account_id") || "";
    const apiBase = params.get("zmt_api_base") || "http://127.0.0.1:8002/api";
    if (!accountId) return null;
    return { accountId, apiBase };
  }

  function saveBridgeContext(context) {
    bridgeContext = context || bridgeContext;
    if (bridgeContext && globalThis.chrome?.storage?.local) {
      chrome.storage.local.set({ zmtBridgeContext: bridgeContext });
    }
  }

  function loadBridgeContext() {
    const parsed = parseBridgeContext();
    if (parsed) {
      saveBridgeContext(parsed);
      return;
    }
    if (globalThis.chrome?.storage?.local) {
      chrome.storage.local.get(["zmtBridgeContext"], (result) => {
        if (result?.zmtBridgeContext?.accountId) bridgeContext = result.zmtBridgeContext;
      });
    }
  }

  function detectPlatform() {
    const matched = PLATFORM_HOSTS.find((item) => window.location.hostname.includes(item.host));
    return matched || { platform: "unknown", label: "未知平台", host: window.location.hostname };
  }

  function loginHint() {
    const text = document.body?.innerText || "";
    if (/登录|扫码|验证码|sign in|login/i.test(text.slice(0, 4000))) return "maybe_login_required";
    return "unknown";
  }

  function cleanText(value, maxLength = 100) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function isGenericName(value) {
    const text = cleanText(value).toLowerCase();
    if (!text) return true;
    return [
      "创作者中心",
      "创作者服务平台",
      "创作服务平台",
      "视频号助手",
      "视频号 · 助手",
      "申请认证",
      "内容管理",
      "互动管理",
      "数据中心",
      "登录",
      "扫码",
      "creator",
      "platform",
      "首页",
      "工作台",
    ].some((item) => text.includes(item));
  }

  function textFromSelectors(selectors) {
    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector)).slice(0, 24);
      for (const element of elements) {
        const value = cleanText(element.getAttribute("alt") || element.getAttribute("title") || element.textContent);
        if (value && !isGenericName(value) && value.length >= 2) return value;
      }
    }
    return "";
  }

  function findHandle(text, platform) {
    const patterns = [
      /抖音号\s*[:：]?\s*([@a-zA-Z0-9_.-]{3,})/,
      /小红书号\s*[:：]?\s*([@a-zA-Z0-9_.-]{3,})/,
      /视频号\s*ID\s*[:：]?\s*([@a-zA-Z0-9_.-]{3,})/i,
      /视频号\s*[:：]?\s*([@a-zA-Z0-9_.-]{3,})/,
      /账号\s*ID\s*[:：]?\s*([@a-zA-Z0-9_.-]{3,})/i,
      /ID\s*[:：]?\s*([@a-zA-Z0-9_.-]{3,})/i,
    ];
    for (const pattern of patterns) {
      const matched = text.match(pattern);
      if (matched?.[1]) return cleanText(matched[1], 96);
    }
    return "";
  }

  function findIdentityFromText(text, rawText) {
    const patterns = [
      /([^|\n｜]{2,40})\s*[|｜]\s*抖音号\s*[:：]\s*([@a-zA-Z0-9_.-]{3,})/,
      /([^|\n｜]{2,40})\s*[|｜]\s*小红书号\s*[:：]\s*([@a-zA-Z0-9_.-]{3,})/,
      /([^|\n｜]{2,40})\s*[|｜]\s*视频号\s*[:：]\s*([@a-zA-Z0-9_.-]{3,})/,
      /([^|\n｜]{2,40})\s*申请认证\s*>?\s*视频号\s*ID\s*[:：]\s*([@a-zA-Z0-9_.-]{3,})/i,
    ];
    for (const pattern of patterns) {
      const matched = text.match(pattern);
      if (matched) {
        return {
          displayName: cleanText(matched[1], 80),
          handle: cleanText(matched[2], 96),
        };
      }
    }
    const handle = findHandle(text, "wechat_channels");
    if (handle) {
      const lines = String(rawText || "").split(/\n+/).map((line) => cleanText(line, 120)).filter(Boolean);
      const handleLineIndex = lines.findIndex((line) => /(?:抖音号|小红书号|视频号\s*ID|视频号|账号\s*ID|ID)\s*[:：]/i.test(line) && line.includes(handle));
      if (handleLineIndex >= 0) {
        for (let index = handleLineIndex - 1; index >= Math.max(0, handleLineIndex - 6); index -= 1) {
          const candidate = cleanText(lines[index], 80);
          if (candidate && candidate.length >= 2 && !isGenericName(candidate) && !/[:：>]|^\d+$/.test(candidate)) {
            return { displayName: candidate, handle };
          }
        }
      }
      return { displayName: "", handle };
    }
    return { displayName: "", handle: "" };
  }

  function findSignatureFromText(text) {
    const matched = text.match(/(?:抖音号|小红书号|视频号\s*ID|视频号)\s*[:：]\s*[@a-zA-Z0-9_.-]{3,}\s*[|｜]\s*([^|\n]{2,120})/);
    return matched?.[1] ? cleanText(matched[1], 120) : "";
  }

  function findMetric(text, labels) {
    for (const label of labels) {
      const pattern = new RegExp(`${label}\\s*[:：]?\\s*([0-9.,万wW]+)`);
      const matched = text.match(pattern);
      if (matched?.[1]) return cleanText(matched[1], 32);
    }
    return "";
  }

  function parseMetricNumber(value) {
    const text = String(value || "").replace(/,/g, "").trim();
    if (!text) return 0;
    const matched = text.match(/([0-9.]+)\s*([万wW]?)/);
    if (!matched) return 0;
    const base = Number(matched[1]);
    if (!Number.isFinite(base)) return 0;
    return Math.max(0, Math.round(base * (matched[2] ? 10000 : 1)));
  }

  function absoluteUrl(value) {
    try {
      return new URL(value, window.location.href).toString();
    } catch {
      return "";
    }
  }

  function platformIdFromUrl(url) {
    const text = String(url || "");
    const matched = text.match(/(?:item|video|note|content|works|aweme)[/=_-]([0-9A-Za-z_-]{6,})/i)
      || text.match(/([0-9]{8,})/);
    return matched?.[1] ? cleanText(matched[1], 120) : "";
  }

  function firstMeaningfulLine(text, skipPatterns = []) {
    const lines = String(text || "")
      .split(/\n+/)
      .map((line) => cleanText(line, 160))
      .filter(Boolean);
    for (const line of lines) {
      if (line.length < 2) continue;
      if (skipPatterns.some((pattern) => pattern.test(line))) continue;
      if (/^(播放|点赞|评论|分享|收藏|私信|回复|删除|编辑|置顶|数据|发布时间)$/.test(line)) continue;
      return line;
    }
    return "";
  }

  function metricFromBlock(text, labels) {
    const labeled = findMetric(text, labels);
    if (labeled) return parseMetricNumber(labeled);
    return 0;
  }

  function uniqueByKey(items, keyFn, limit) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
      const key = keyFn(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(item);
      if (result.length >= limit) break;
    }
    return result;
  }

  function isDouyinCreatorPage() {
    return detectPlatform().platform === "douyin";
  }

  function isDouyinWorksContext() {
    if (!isDouyinCreatorPage()) return false;
    const url = window.location.href;
    const text = cleanText(document.body?.innerText || "", 4000);
    return /content|manage|work|video|item|作品|内容管理|作品管理|数据中心|视频管理/i.test(`${url} ${text}`);
  }

  function douyinPostTitleFromBlock(block, rawText) {
    const titleFromAttribute = textFromElementSelectors(block, [
      "[title]",
      "[class*='title' i]",
      "[class*='name' i]",
      "[class*='desc' i]",
    ]);
    if (titleFromAttribute) return titleFromAttribute;
    return firstMeaningfulLine(rawText, [
      /^\d+$/,
      /播放|点赞|评论|分享|收藏|私信|作品数据|公开视频|仅自己可见|已发布|审核|发布时间/,
      /^(编辑|删除|置顶|更多|查看|数据|管理)$/,
    ]);
  }

  function textFromElementSelectors(root, selectors) {
    for (const selector of selectors) {
      const elements = Array.from(root.querySelectorAll(selector)).slice(0, 12);
      for (const element of elements) {
        const value = cleanText(element.getAttribute("title") || element.getAttribute("alt") || element.textContent, 180);
        if (value && !isGenericName(value) && !/播放|点赞|评论|分享|收藏|发布时间/.test(value)) return value;
      }
    }
    return "";
  }

  function douyinTimeFromText(text) {
    const patterns = [
      /((?:20\d{2}[-/.年])?\d{1,2}[-/.月]\d{1,2}(?:日)?\s*\d{0,2}:?\d{0,2})/,
      /(刚刚|今天\s*\d{1,2}:?\d{0,2}|昨天\s*\d{1,2}:?\d{0,2})/,
      /发布(?:时间)?\s*[:：]?\s*([^\s]+(?:\s+[0-9:]+)?)/,
    ];
    for (const pattern of patterns) {
      const matched = text.match(pattern);
      if (matched?.[1]) return cleanText(matched[1], 80);
    }
    return "";
  }

  function douyinPostUrlFromBlock(block) {
    const links = Array.from(block.querySelectorAll("a[href]"))
      .map((item) => absoluteUrl(item.getAttribute("href")))
      .filter(Boolean);
    return links.find((url) => /creator\.douyin\.com|douyin\.com/.test(url) && /content|video|item|aweme|manage|data/.test(url))
      || links.find((url) => /creator\.douyin\.com|douyin\.com/.test(url))
      || "";
  }

  function douyinMetricsFromText(text) {
    const compact = cleanText(text, 2000);
    return {
      plays: metricFromBlock(compact, ["播放", "播放量", "观看"]),
      likes: metricFromBlock(compact, ["点赞", "获赞"]),
      comments: metricFromBlock(compact, ["评论", "评论数"]),
      shares: metricFromBlock(compact, ["分享", "转发"]),
      saves: metricFromBlock(compact, ["收藏", "收藏数"]),
    };
  }

  function extractDouyinPostsFromVisiblePage() {
    if (!isDouyinWorksContext()) return [];
    const blocks = Array.from(
      document.querySelectorAll(
        [
          "tbody tr",
          "[role='row']",
          "[class*='table' i] [class*='row' i]",
          "[class*='content' i] [class*='item' i]",
          "[class*='work' i]",
          "[class*='video' i]",
          "[class*='card' i]",
        ].join(","),
      ),
    ).slice(0, 160);
    const candidates = [];
    for (const block of blocks) {
      const rawText = block.innerText || block.textContent || "";
      const text = cleanText(rawText, 2200);
      if (text.length < 8) continue;
      const hasMetric = /播放|播放量|点赞|评论|分享|转发|收藏/.test(text);
      const hasWorkSignal = /作品|视频|图文|发布|审核|公开视频|仅自己可见|数据/.test(text);
      if (!hasMetric && !hasWorkSignal) continue;
      const postUrl = douyinPostUrlFromBlock(block);
      const title = douyinPostTitleFromBlock(block, rawText);
      const platformPostId = platformIdFromUrl(postUrl) || cleanText(block.getAttribute("data-id") || block.id || "", 120);
      if (!title && !postUrl && !platformPostId) continue;
      candidates.push({
        platformPostId,
        title,
        postUrl,
        publishTime: douyinTimeFromText(text),
        metrics: douyinMetricsFromText(text),
        raw: {
          adapter: "douyin_works_v1",
          pageUrl: window.location.href,
          text,
        },
      });
    }
    return uniqueByKey(candidates, (item) => item.platformPostId || item.postUrl || item.title, 40);
  }

  function isDouyinCommentsContext() {
    if (!isDouyinCreatorPage()) return false;
    const url = window.location.href;
    const text = cleanText(document.body?.innerText || "", 5000);
    return /comment|reply|message|interaction|评论|回复|互动管理|评论管理|作品评论|全部评论/i.test(`${url} ${text}`);
  }

  function douyinCurrentPostId() {
    const url = new URL(window.location.href);
    for (const key of ["item_id", "itemId", "aweme_id", "awemeId", "video_id", "videoId", "post_id", "postId"]) {
      const value = url.searchParams.get(key);
      if (value) return cleanText(value, 120);
    }
    return platformIdFromUrl(window.location.href);
  }

  function douyinCommentTimeFromText(text) {
    const patterns = [
      /(刚刚|[0-9]{1,2}\s*分钟前|[0-9]{1,2}\s*小时前|昨天\s*[0-9:：]{0,5})/,
      /((?:20\d{2}[-/.年])?\d{1,2}[-/.月]\d{1,2}(?:日)?\s*[0-9:：]{0,5})/,
    ];
    for (const pattern of patterns) {
      const matched = text.match(pattern);
      if (matched?.[1]) return cleanText(matched[1], 80);
    }
    return "";
  }

  function douyinReplyStatusFromText(text) {
    if (/已回复|作者回复|我的回复/.test(text)) return "replied";
    if (/待回复|未回复|回复评论|去回复|回复$/.test(text)) return "unreplied";
    return "unknown";
  }

  function douyinCommentContentFromLines(lines, authorName) {
    const ignored = /^(回复|删除|置顶|展开|收起|点赞|评论|私信|查看|更多|已回复|未回复|待回复|作者回复|回复评论)$/;
    for (const line of lines) {
      if (!line || line === authorName) continue;
      if (ignored.test(line)) continue;
      if (/^\d+$/.test(line)) continue;
      if (/^[0-9]{1,2}\s*(分钟前|小时前)$/.test(line)) continue;
      if (/^20\d{2}[-/.年]\d{1,2}/.test(line)) continue;
      if (line.length >= 2 && line.length <= 500) return line;
    }
    return "";
  }

  function extractDouyinCommentsFromVisiblePage() {
    if (!isDouyinCommentsContext()) return [];
    const currentPostId = douyinCurrentPostId();
    const blocks = Array.from(
      document.querySelectorAll(
        [
          "[class*='comment' i]",
          "[class*='reply' i]",
          "[class*='interaction' i]",
          "[class*='message' i]",
          "[role='listitem']",
          "tbody tr",
          "li",
        ].join(","),
      ),
    ).slice(0, 200);
    const candidates = [];
    for (const block of blocks) {
      const rawText = block.innerText || block.textContent || "";
      const text = cleanText(rawText, 1600);
      if (text.length < 4) continue;
      const hasCommentSignal = /回复|评论|点赞|分钟前|小时前|刚刚|昨天|已回复|未回复|待回复|作者回复/.test(text)
        || /comment|reply/i.test(block.className || "");
      if (!hasCommentSignal) continue;
      const lines = String(rawText).split(/\n+/).map((line) => cleanText(line, 260)).filter(Boolean);
      const authorName = textFromElementSelectors(block, [
        "[class*='author' i]",
        "[class*='user' i]",
        "[class*='name' i]",
        "[class*='nick' i]",
      ]) || lines.find((line) => line.length >= 2 && !/回复|评论|点赞|删除|置顶|展开|收起|刚刚|分钟前|小时前/.test(line)) || "";
      const content = douyinCommentContentFromLines(lines, authorName);
      if (!content) continue;
      const link = Array.from(block.querySelectorAll("a[href]"))
        .map((item) => absoluteUrl(item.getAttribute("href")))
        .find(Boolean) || "";
      const platformCommentId = cleanText(block.getAttribute("data-id") || block.getAttribute("data-comment-id") || block.id || platformIdFromUrl(link), 120);
      const platformPostId = currentPostId || platformIdFromUrl(link);
      candidates.push({
        platformPostId,
        platformCommentId,
        authorName,
        content,
        likeCount: metricFromBlock(text, ["点赞", "赞"]),
        replyCount: metricFromBlock(text, ["回复"]),
        replyStatus: douyinReplyStatusFromText(text),
        postedAt: douyinCommentTimeFromText(text),
        raw: {
          adapter: "douyin_comments_v1",
          pageUrl: window.location.href,
          text,
        },
      });
    }
    return uniqueByKey(
      candidates,
      (item) => item.platformCommentId || `${item.platformPostId}|${item.authorName}|${item.content}`,
      80,
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function visibleText(element) {
    return cleanText(element?.innerText || element?.textContent || "", 1800);
  }

  function findReplyTargetBlock(data) {
    const platformCommentId = cleanText(data?.platformCommentId || "", 120);
    const authorName = cleanText(data?.authorName || "", 120);
    const content = cleanText(data?.content || "", 500);
    const blocks = Array.from(
      document.querySelectorAll(
        [
          "[class*='comment' i]",
          "[class*='reply' i]",
          "[class*='interaction' i]",
          "[role='listitem']",
          "tbody tr",
          "li",
        ].join(","),
      ),
    ).slice(0, 240);
    for (const block of blocks) {
      if (platformCommentId) {
        const blockId = cleanText(block.getAttribute("data-id") || block.getAttribute("data-comment-id") || block.id || "", 120);
        if (blockId && blockId === platformCommentId) return block;
      }
      const text = visibleText(block);
      if (content && text.includes(content) && (!authorName || text.includes(authorName))) return block;
    }
    return null;
  }

  function clickReplyButton(block) {
    const candidates = Array.from(block.querySelectorAll("button, [role='button'], a, span, div"))
      .filter((item) => /回复|回应/.test(cleanText(item.textContent, 40)))
      .slice(0, 12);
    const button = candidates.find((item) => {
      const text = cleanText(item.textContent, 40);
      return text === "回复" || text.includes("回复评论") || text.includes("去回复");
    }) || candidates[0];
    if (!button) return false;
    button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    button.click();
    return true;
  }

  function setEditableValue(element, value) {
    if (!element) return false;
    element.focus();
    if ("value" in element) {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (element.isContentEditable) {
      element.textContent = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      return true;
    }
    return false;
  }

  function findReplyEditor(block) {
    const local = Array.from(block.querySelectorAll("textarea, input, [contenteditable='true']")).find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 20 && rect.height > 10;
    });
    if (local) return local;
    return Array.from(document.querySelectorAll("textarea, input, [contenteditable='true']")).find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 20 && rect.height > 10;
    }) || null;
  }

  async function prepareCommentReply(data) {
    const replyText = cleanText(data?.replyText || data?.suggestedReply || "", 2000);
    if (!replyText) return { ok: false, message: "reply_text_required" };
    const block = findReplyTargetBlock(data || {});
    if (!block) return { ok: false, message: "comment_block_not_found" };
    const clicked = clickReplyButton(block);
    if (!clicked) return { ok: false, message: "reply_button_not_found" };
    await sleep(600);
    const editor = findReplyEditor(block);
    if (!editor) return { ok: false, message: "reply_editor_not_found" };
    const filled = setEditableValue(editor, replyText);
    if (!filled) return { ok: false, message: "reply_editor_fill_failed" };
    return {
      ok: true,
      message: "已填入回复草稿，请人工确认后发送",
      replyText,
    };
  }

  function extractPostsFromVisiblePage() {
    const platform = detectPlatform();
    if (platform.platform === "douyin") {
      const douyinPosts = extractDouyinPostsFromVisiblePage();
      if (douyinPosts.length) return douyinPosts;
    }
    const blocks = Array.from(
      document.querySelectorAll(
        [
          "tr",
          "article",
          "[class*='work' i]",
          "[class*='video' i]",
          "[class*='content' i]",
          "[class*='item' i]",
          "[class*='card' i]",
        ].join(","),
      ),
    ).slice(0, 120);
    const seen = new Set();
    const posts = [];
    for (const block of blocks) {
      const rawText = block.innerText || block.textContent || "";
      const text = cleanText(rawText, 1600);
      if (text.length < 10) continue;
      const hasPostSignal = /播放|点赞|评论|分享|收藏|作品|视频|图文|发布时间|已发布/.test(text);
      if (!hasPostSignal) continue;
      const link = Array.from(block.querySelectorAll("a[href]"))
        .map((item) => absoluteUrl(item.getAttribute("href")))
        .find((url) => /douyin|xiaohongshu|channels|creator/.test(url)) || "";
      const title = firstMeaningfulLine(rawText, [/^\d+$/, /播放|点赞|评论|分享|收藏|私信/]);
      const platformPostId = platformIdFromUrl(link) || cleanText(block.getAttribute("data-id") || block.id || "", 120);
      const key = platformPostId || link || title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      posts.push({
        platformPostId,
        title,
        postUrl: link,
        publishTime: findMetric(text, ["发布时间", "发布于", "时间"]),
        metrics: {
          plays: metricFromBlock(text, ["播放", "播放量", "观看"]),
          likes: metricFromBlock(text, ["点赞", "获赞"]),
          comments: metricFromBlock(text, ["评论"]),
          shares: metricFromBlock(text, ["分享", "转发"]),
          saves: metricFromBlock(text, ["收藏"]),
        },
        raw: {
          adapter: "generic_posts_v1",
          pageUrl: window.location.href,
          text,
        },
      });
      if (posts.length >= 30) break;
    }
    return posts;
  }

  function extractCommentsFromVisiblePage() {
    const platform = detectPlatform();
    if (platform.platform === "douyin") {
      const douyinComments = extractDouyinCommentsFromVisiblePage();
      if (douyinComments.length) return douyinComments;
    }
    const blocks = Array.from(
      document.querySelectorAll(
        [
          "[class*='comment' i]",
          "[class*='reply' i]",
          "tr",
          "li",
          "[class*='message' i]",
        ].join(","),
      ),
    ).slice(0, 160);
    const seen = new Set();
    const comments = [];
    for (const block of blocks) {
      const rawText = block.innerText || block.textContent || "";
      const text = cleanText(rawText, 1200);
      if (text.length < 4) continue;
      const isLikelyComment = /回复|评论|点赞|小时前|分钟前|刚刚|私信|咨询|预算|价格|怎么/.test(text)
        || /comment|reply/i.test(block.className || "");
      if (!isLikelyComment) continue;
      const lines = String(rawText).split(/\n+/).map((line) => cleanText(line, 240)).filter(Boolean);
      const authorName = lines.find((line) => line.length >= 2 && !/回复|评论|点赞|删除|置顶|展开/.test(line)) || "";
      const content = lines.find((line) => line !== authorName && line.length >= 2 && !/^\d+$/.test(line) && !/回复|删除|置顶|展开/.test(line)) || "";
      if (!content || content.length > 500) continue;
      const platformCommentId = cleanText(block.getAttribute("data-id") || block.id || "", 120);
      const key = platformCommentId || `${authorName}|${content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      comments.push({
        platformCommentId,
        authorName,
        content,
        likeCount: metricFromBlock(text, ["点赞", "赞"]),
        replyCount: metricFromBlock(text, ["回复"]),
        raw: {
          adapter: "generic_comments_v1",
          pageUrl: window.location.href,
          text,
        },
      });
      if (comments.length >= 50) break;
    }
    return comments;
  }

  function extractCreatorData() {
    return {
      posts: extractPostsFromVisiblePage(),
      comments: extractCommentsFromVisiblePage(),
      capturedAt: new Date().toISOString(),
    };
  }

  function extractProfile() {
    const platform = detectPlatform();
    const rawBodyText = document.body?.innerText || "";
    const bodyText = cleanText(rawBodyText, 12000);
    const login = loginHint();
    const identity = findIdentityFromText(bodyText, rawBodyText);
    const displayName = identity.displayName || textFromSelectors([
      '[class*="avatar" i] img[alt]',
      '[class*="user" i] img[alt]',
      '[class*="account" i] img[alt]',
      '[class*="nickname" i]',
      '[class*="user-name" i]',
      '[class*="username" i]',
      '[class*="account-name" i]',
      '[class*="author-name" i]',
      '[data-testid*="user" i]',
      '[data-testid*="account" i]',
    ]);
    const handle = identity.handle || findHandle(bodyText, platform.platform);
    const loggedIn = Boolean(displayName || handle) || login !== "maybe_login_required";

    return {
      platform: platform.platform,
      platformLabel: platform.label,
      loggedIn,
      displayName,
      handle,
      profile: findSignatureFromText(bodyText) || textFromSelectors([
        '[class*="bio" i]',
        '[class*="intro" i]',
        '[class*="signature" i]',
        '[class*="description" i]',
      ]),
      metrics: {
        followers: findMetric(bodyText, ["粉丝", "关注者"]),
        likes: findMetric(bodyText, ["获赞", "点赞"]),
        plays: findMetric(bodyText, ["播放", "播放量", "观看"]),
        comments: findMetric(bodyText, ["评论"]),
        messages: findMetric(bodyText, ["私信", "消息"]),
      },
      url: window.location.href,
      title: document.title,
      loginHint: login,
      capturedAt: new Date().toISOString(),
    };
  }

  function postProfile(reason) {
    const profile = extractProfile();
    syncProfileToLocalApi(profile).catch(() => {});
    syncCreatorDataToLocalApi(false).catch(() => {});
    syncDirectMessageMetricToLocalApi(profile).catch(() => {});
    window.postMessage(
      {
        type: "ZMT_ACCOUNT_PROFILE",
        source: "zimeiti-bridge-extension",
        reason,
        platform: profile.platform,
        platformLabel: profile.platformLabel,
        profile,
        url: window.location.href,
        title: document.title,
        at: new Date().toISOString(),
      },
      "*",
    );
  }

  async function syncProfileToLocalApi(profile) {
    if (!bridgeContext?.accountId || !profile?.loggedIn) return;
    if (!profile.displayName && !profile.handle) return;
    if (profile.platform === "unknown") return;

    const syncKey = [bridgeContext.accountId, profile.displayName, profile.handle, profile.url].join("|");
    if (syncKey === lastSyncedKey) return;

    const response = await fetch(`${bridgeContext.apiBase}/ops/accounts/${bridgeContext.accountId}/sync-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "browser_bridge",
        displayName: profile.displayName,
        handle: profile.handle,
        profile: profile.profile,
        workspaceUrl: profile.url,
        pageTitle: profile.title,
        raw: profile,
      }),
    });
    if (response.ok) {
      lastSyncedKey = syncKey;
      window.postMessage(
        {
          type: "ZMT_ACCOUNT_PROFILE_SYNCED",
          source: "zimeiti-bridge-extension",
          accountId: bridgeContext.accountId,
          platform: profile.platform,
          displayName: profile.displayName,
          handle: profile.handle,
          at: new Date().toISOString(),
        },
        "*",
      );
    }
  }

  async function syncCreatorDataToLocalApi(force) {
    if (!bridgeContext?.accountId) return { ok: false, posts: 0, comments: 0, message: "account_context_missing" };
    const data = extractCreatorData();
    if (!data.posts.length && !data.comments.length) return { ok: false, posts: 0, comments: 0, message: "no_visible_creator_data" };
    const syncKey = [
      bridgeContext.accountId,
      window.location.href,
      data.posts.map((item) => item.platformPostId || item.postUrl || item.title).join(",").slice(0, 500),
      data.comments.map((item) => item.platformCommentId || item.content).join(",").slice(0, 500),
    ].join("|");
    if (!force && syncKey === lastCreatorDataSyncKey) {
      return { ok: true, posts: data.posts.length, comments: data.comments.length, message: "creator_data_already_synced" };
    }

    const response = await fetch(`${bridgeContext.apiBase}/ops/creator-data/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: bridgeContext.accountId,
        source: "browser_bridge",
        capturedAt: data.capturedAt,
        posts: data.posts,
        comments: data.comments,
      }),
    });
    if (response.ok) {
      lastCreatorDataSyncKey = syncKey;
      window.postMessage(
        {
          type: "ZMT_CREATOR_DATA_SYNCED",
          source: "zimeiti-bridge-extension",
          accountId: bridgeContext.accountId,
          posts: data.posts.length,
          comments: data.comments.length,
          at: new Date().toISOString(),
        },
        "*",
      );
      return { ok: true, posts: data.posts.length, comments: data.comments.length, message: "creator_data_synced" };
    }
    return { ok: false, posts: data.posts.length, comments: data.comments.length, message: `sync_failed_${response.status}` };
  }

  async function syncDirectMessageMetricToLocalApi(profile) {
    if (!bridgeContext?.accountId || !profile?.loggedIn) return;
    const unreadCount = parseMetricNumber(profile.metrics?.messages);
    if (unreadCount <= 0) return;
    const syncKey = `${bridgeContext.accountId}:${unreadCount}`;
    if (syncKey === lastMessageCountKey) return;
    const response = await fetch(`${bridgeContext.apiBase}/ops/direct-messages/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: bridgeContext.accountId,
        unreadCount,
        source: "browser_session",
      }),
    });
    if (response.ok) lastMessageCountKey = syncKey;
  }

  function postStatus(reason) {
    const platform = detectPlatform();
    window.postMessage(
      {
        type: "ZMT_EXTENSION_STATUS",
        source: "zimeiti-bridge-extension",
        reason,
        platform: platform.platform,
        platformLabel: platform.label,
        url: window.location.href,
        title: document.title,
        loginHint: loginHint(),
        at: new Date().toISOString(),
      },
      "*",
    );
  }

  function ensureBadge() {
    if (document.getElementById("zmt-extension-badge")) return;
    const badge = document.createElement("div");
    badge.id = "zmt-extension-badge";
    badge.textContent = "自媒体管家";
    badge.style.cssText = [
      "position:fixed",
      "right:12px",
      "bottom:12px",
      "z-index:2147483647",
      "padding:6px 9px",
      "border-radius:8px",
      "background:#0f172a",
      "color:#fff",
      "font:600 12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "box-shadow:0 8px 22px rgba(15,23,42,.22)",
      "opacity:.72",
      "pointer-events:none",
    ].join(";");
    document.documentElement.appendChild(badge);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "ZMT_ACCOUNT_COMMAND") return;
    const command = event.data.command || {};
    if (command.kind === "ping") {
      postStatus("command_ping");
      return;
    }
    if (command.kind === "extract_profile") {
      postProfile("command_extract_profile");
      return;
    }
    if (command.kind === "extract_creator_data") {
      syncCreatorDataToLocalApi(true)
        .then((result) => {
          window.postMessage(
            {
              type: "ZMT_EXTENSION_COMMAND_RESULT",
              source: "zimeiti-bridge-extension",
              commandId: command.id || "",
              ok: Boolean(result?.ok),
              message: result?.message || "creator_data_sync_finished",
              result,
              at: new Date().toISOString(),
            },
            "*",
          );
        })
        .catch((error) => {
          window.postMessage(
            {
              type: "ZMT_EXTENSION_COMMAND_RESULT",
              source: "zimeiti-bridge-extension",
              commandId: command.id || "",
              ok: false,
              message: error instanceof Error ? error.message : "creator_data_sync_failed",
              at: new Date().toISOString(),
            },
            "*",
          );
        });
      return;
    }
    if (command.kind === "reply_comment") {
      prepareCommentReply(command.data || {})
        .then((result) => {
          window.postMessage(
            {
              type: "ZMT_EXTENSION_COMMAND_RESULT",
              source: "zimeiti-bridge-extension",
              commandId: command.id || "",
              ok: Boolean(result?.ok),
              message: result?.message || "reply_comment_finished",
              result,
              at: new Date().toISOString(),
            },
            "*",
          );
        })
        .catch((error) => {
          window.postMessage(
            {
              type: "ZMT_EXTENSION_COMMAND_RESULT",
              source: "zimeiti-bridge-extension",
              commandId: command.id || "",
              ok: false,
              message: error instanceof Error ? error.message : "reply_comment_failed",
              at: new Date().toISOString(),
            },
            "*",
          );
        });
      return;
    }
    window.postMessage(
      {
        type: "ZMT_EXTENSION_COMMAND_RESULT",
        source: "zimeiti-bridge-extension",
        commandId: command.id || "",
        ok: false,
        message: "当前桥接扩展只负责连接和状态上报，平台填表适配器尚未启用。",
        at: new Date().toISOString(),
      },
      "*",
    );
  });

  loadBridgeContext();
  ensureBadge();
  postStatus("content_script_loaded");
  postProfile("content_script_loaded");
  window.addEventListener("focus", () => {
    postStatus("window_focus");
    postProfile("window_focus");
  });
  window.setInterval(() => {
    postStatus("heartbeat");
    postProfile("heartbeat");
  }, 10000);
})();

/**
 * 零宽、软连字符、方向控制等不可见字符：渲染时不占位，却常被反爬插在验证码中间，
 * 换成空格会把码切成两段（`913472` → `91347 2`，提码只剩 5 位），只能直接去掉。
 */
const ZERO_WIDTH = new RegExp(
  "[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF\\u00AD\\u034F]",
  "g",
);

/** 不间断空格 / 全角空格渲染时真的占位，折叠为普通空格 */
const WIDE_SPACE = new RegExp("[\\u00A0\\u3000]", "g");

/**
 * 去掉不可见字符。text/plain 正文不经过 {@link htmlToText}，提码前要自己归一化，
 * 否则 6 位码被零宽空格分开后只会命中前 5 位。
 */
export function stripInvisible(text: string): string {
  return text.replace(ZERO_WIDTH, '');
}

/**
 * 行内文字格式标签不产生空白：验证码常被它们从中间切开
 * （`<b>913</b>472`、`9134<font>72</font>`、`<wbr>`），按空格剥离同样只剩一截。
 * 其余标签（含 td/table 这类结构标签）仍按空格处理，避免把相邻单元格粘成一个词。
 */
const INLINE_TAG =
  /<\/?(?:b|bdi|bdo|big|code|del|em|font|i|ins|kbd|mark|nobr|s|samp|small|span|strike|strong|sub|sup|tt|u|var|wbr)(?:\s[^>]*)?\/?>/gi;

/** 数字 / 十六进制实体：反爬常用 `&#8203;`（零宽空格）之类把验证码拆开 */
const NUMERIC_ENTITY = /&#x([0-9a-f]+);|&#(\d+);/gi;

/** 解码成字母数字的零宽命名实体，与 {@link ZERO_WIDTH} 同样直接去掉 */
const ZERO_WIDTH_ENTITY = /&(?:zwnj|zwj|shy|lrm|rlm);/gi;

function safeChar(code: number): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

/** 无依赖的 HTML → 纯文本（收件解析与摘要用，禁止引入 linkedom 等重依赖） */
export function htmlToText(html: string | undefined | null): string {
  return String(html || '')
    .replace(/<(script|style|head|template)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(INLINE_TAG, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(ZERO_WIDTH_ENTITY, '')
    // 数字实体先于 &amp; 解码，避免把 `&amp;#8203;` 这种字面量当成零宽空格
    .replace(NUMERIC_ENTITY, (_m, hex: string | undefined, dec: string | undefined) =>
      safeChar(hex === undefined ? Number.parseInt(dec ?? '', 10) : Number.parseInt(hex, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(ZERO_WIDTH, '')
    .replace(WIDE_SPACE, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function previewOf(source: string, limit: number): string {
  // 纯文本正文里的零宽字符同样会切断验证码：摘要是列表接口重新校验提码的输入
  return source.replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

/**
 * 摘要默认长度。列表接口拿摘要重新校验提码，取到这个长度就说明正文被截断过，
 * 末尾的候选可能已经少了几位，见 code-extract 的 bodyTruncated。
 */
export const PREVIEW_LIMIT = 160;

/** 正文纯文本摘要：优先纯文本，回落 html→text，截断到 limit 字符 */
export function makePreview(
  text: string | undefined | null,
  html: string | undefined | null,
  limit = PREVIEW_LIMIT,
): string {
  return previewOf((text && text.trim()) || htmlToText(html), limit);
}

/** 同一封信的正文文本视图，见 {@link mailText} */
export interface MailText {
  /** 纯文本优先、缺失时回落 HTML 转换结果（提码、AI 兜底、通知与转发正文的口径） */
  readonly plain: string;
  /** 与 makePreview 相同的摘要 */
  preview(limit?: number): string;
}

/**
 * HTML → 纯文本惰性转换且最多一次：大 HTML 整段转换是收件链路最重的 CPU，
 * 提码、预览、AI 兜底、通知与中转转发共用这一份结果。
 */
export function mailText(text: string, html: string): MailText {
  let converted: string | undefined;
  const htmlText = () => (converted ??= htmlToText(html));
  return {
    get plain() { return text || htmlText(); },
    preview: (limit = PREVIEW_LIMIT) => previewOf((text && text.trim()) || htmlText(), limit),
  };
}

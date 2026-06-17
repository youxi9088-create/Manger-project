/**
 * 消息内容解析与清理工具
 *
 * 99U 消息 content 中可能残留协议头部信息（如 Content-Type: rich/xml、Content-At: 986916 等）。
 * 此模块提供前端兜底清理逻辑，确保显示给用户的内容是干净的。
 */

/**
 * 清理消息内容：去除协议头部（Content-Type / Content-At 等），只保留正文
 *
 * 示例输入:
 *   "Content-Type: rich/xml Content-At: 986916 @游浠 这个麻烦你内部沟通一下吧"
 *   "Content-Type: text/plain Content-At: 986916 ios的做了，@游浠 最新版有发给审核吗"
 *
 * 示例输出:
 *   "@游浠 这个麻烦你内部沟通一下吧"
 *   "ios的做了，@游浠 最新版有发给审核吗"
 */
export function cleanMessageContent(content: string): string {
  if (!content) return '';

  // 情况1: 标准多行头部格式（Content-Type: ...\r\nContent-At: ...\r\n\r\n正文）
  const multiLineMatch = content.match(/^Content-Type:\s*\S+\s*[\r\n]+((?:[A-Za-z\-]+:\s*[^\r\n]*[\r\n]+)*)[\r\n]*([\s\S]*)$/);
  if (multiLineMatch) {
    return stripHtmlTags(multiLineMatch[2].trim());
  }

  // 情况2: 单行格式（头部被空格连接而非换行），如:
  //   "Content-Type: rich/xml Content-At: 986916 @游浠 这个麻烦你..."
  //   "Content-Type: text/plain Content-At: 986916 ios的做了..."
  if (content.startsWith('Content-Type:')) {
    // 去除 Content-Type: xxx
    let cleaned = content.replace(/^Content-Type:\s*\S+\s*/, '');
    // 去除 Content-At: xxx（可能有多个类似头部）
    cleaned = cleaned.replace(/^Content-At:\s*\S+\s*/i, '');
    // 去除其他可能的 Content-* 头部
    cleaned = cleaned.replace(/^Content-[A-Za-z\-]+:\s*\S+\s*/gi, '');
    return stripHtmlTags(cleaned.trim());
  }

  // 情况3: 内容本身可能包含 HTML 标签（富文本消息）
  return stripHtmlTags(content);
}

/**
 * 去除 HTML 标签，提取纯文本内容
 *
 * 示例输入:
 *   '<div style="font-size:12pt; color:#800040;"><span>@游浠 这个麻烦你内部沟通一下吧</span></div>'
 * 示例输出:
 *   '@游浠 这个麻烦你内部沟通一下吧'
 */
function stripHtmlTags(text: string): string {
  if (!text) return '';
  // 如果不包含 HTML 标签，直接返回
  if (!/<[a-zA-Z][^>]*>/.test(text)) return text;

  // 将 <br> / <br/> / <p> / <div> 等块级标签转为换行
  let cleaned = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n');

  // 去除所有 HTML 标签
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // 解码常见 HTML 实体
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x20;/g, ' ');

  // 合并多余空白行，去除首尾空白
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

/**
 * 从 content 中提取消息类型（如果后端 message_type 为空时的兜底逻辑）
 */
export function extractContentType(content: string): 'text' | 'rich' {
  if (!content) return 'text';
  const match = content.match(/^Content-Type:\s*(\S+)/);
  if (match) {
    return match[1] === 'rich/xml' ? 'rich' : 'text';
  }
  return 'text';
}

import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'

// 按需注册语言：完整版 highlight.js 约 1MB+，这里只留 8 种常用语言
for (const [name, lang] of Object.entries({
  javascript,
  typescript,
  xml,
  css,
  json,
  bash,
  python,
  sql
})) {
  hljs.registerLanguage(name, lang)
}
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerAliases(['html', 'vue'], { languageName: 'xml' })
hljs.registerAliases(['sh', 'shell'], { languageName: 'bash' })
hljs.registerAliases(['py'], { languageName: 'python' })

const md: MarkdownIt = new MarkdownIt({
  // 关掉原生 HTML，避免 Markdown 内容注入脚本
  html: false,
  linkify: true,
  breaks: true
})

/**
 * 自定义代码块渲染。
 *
 * 为什么不用 markdown-it 自带的 `highlight` 选项：它只在返回值以 `<pre` 开头时才原样输出，
 * 否则会把内容塞进 `<pre><code>` 里。我们要在代码块外面套一层 `.code-wrap` 放语言标签，
 * 返回值必然以 `<div` 开头，结果就是 `<pre><code><div><pre>` 这种非法嵌套
 * （div 不能出现在 code 里，浏览器会自行纠错，样式随之错位）。
 * 直接接管 fence 规则，输出什么就是什么。
 */
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const info = token.info.trim().split(/\s+/)[0] ?? ''
  const language = info && hljs.getLanguage(info) ? info : ''

  const body = language
    ? hljs.highlight(token.content, { language, ignoreIllegals: true }).value
    : md.utils.escapeHtml(token.content)

  // 语言名来自用户输入，必须转义
  const tag = language ? `<span class="code-lang">${md.utils.escapeHtml(language)}</span>` : ''
  return `<div class="code-wrap">${tag}<pre class="hljs"><code>${body}</code></pre></div>\n`
}

/** 流式渲染时，末尾未闭合的代码围栏也能被 markdown-it 正确处理（当作代码块渲染） */
export function renderMarkdown(src: string): string {
  if (!src) return ''
  return md.render(src)
}

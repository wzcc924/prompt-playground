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
  breaks: true,
  highlight(code: string, lang: string): string {
    const language = lang && hljs.getLanguage(lang) ? lang : ''
    const body = language
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : md.utils.escapeHtml(code)
    const tag = language ? `<span class="code-lang">${language}</span>` : ''
    return `<div class="code-wrap">${tag}<pre class="hljs"><code>${body}</code></pre></div>`
  }
})

/** 流式渲染时，末尾未闭合的代码围栏也能被 markdown-it 正确处理（当作代码块渲染） */
export function renderMarkdown(src: string): string {
  if (!src) return ''
  return md.render(src)
}

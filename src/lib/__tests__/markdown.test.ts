import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@/lib/markdown'

describe('renderMarkdown', () => {
  it('空内容返回空字符串', () => {
    expect(renderMarkdown('')).toBe('')
  })

  it('普通段落渲染成 <p>', () => {
    expect(renderMarkdown('一段文字')).toContain('<p>一段文字</p>')
  })

  it('单换行渲染成 <br>（breaks: true，符合聊天场景）', () => {
    expect(renderMarkdown('第一行\n第二行')).toContain('<br>')
  })

  it('原始 HTML 被转义，不会注入脚本（html: false）', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('行内 HTML 里的 img onerror 不会被当成标签渲染', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">')
    // 整体被转义成文本，不会产生真实的 img 元素（onerror= 作为可见文字存在是安全的）
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('已知语言的代码块会被高亮并带上语言标签', () => {
    const html = renderMarkdown(['```ts', 'const a: number = 1', '```'].join('\n'))
    expect(html).toContain('class="code-wrap"')
    expect(html).toContain('code-lang')
    expect(html).toContain('hljs')
    // 高亮后关键字会被包成 span，说明真的走了 highlight.js 而不是纯转义
    expect(html).toContain('<span class="hljs-keyword">const</span>')
  })

  it('语言别名能正确映射（py → python 的高亮规则）', () => {
    const html = renderMarkdown(['```py', 'def f():', '    return 1', '```'].join('\n'))
    // 标签沿用用户写的 py，但高亮用的是 python 的语法规则
    expect(html).toContain('code-lang">py<')
    expect(html).toContain('hljs-keyword')
  })

  it('代码块输出是合法的嵌套结构（div 不会套在 pre/code 里）', () => {
    const html = renderMarkdown(['```ts', 'const a = 1', '```'].join('\n'))
    // 曾经因为用 highlight 选项而渲染成 <pre><code><div class="code-wrap">
    expect(html).not.toMatch(/<pre[^>]*><code[^>]*><div/)
    expect(html.trim().startsWith('<div class="code-wrap">')).toBe(true)
  })

  it('未知语言回退为纯转义，不抛异常', () => {
    const html = renderMarkdown(['```unknownlang', 'a < b && c > d', '```'].join('\n'))
    expect(html).toContain('&lt; b')
    expect(html).not.toContain('code-lang')
  })

  it('未闭合的代码围栏（流式输出中间态）也能渲染成代码块', () => {
    const html = renderMarkdown(['```js', 'const x = 1'].join('\n'))
    expect(html).toContain('<pre')
    expect(html).toContain('const')
  })

  it('表格与列表正常渲染', () => {
    const html = renderMarkdown(['- a', '- b'].join('\n'))
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>a</li>')
  })
})

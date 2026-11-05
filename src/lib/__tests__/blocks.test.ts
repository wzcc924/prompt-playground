import { describe, expect, it } from 'vitest'
import { splitMarkdownBlocks } from '@/lib/blocks'

describe('splitMarkdownBlocks', () => {
  it('空内容返回空数组', () => {
    expect(splitMarkdownBlocks('')).toEqual([])
    expect(splitMarkdownBlocks('   \n\n \t\n')).toEqual([])
  })

  it('按空行切分顶层块', () => {
    const blocks = splitMarkdownBlocks('第一段\n\n第二段\n\n第三段')
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toBe('第一段')
    expect(blocks[2]).toBe('第三段')
  })

  it('单换行不切块（软换行属于同一段）', () => {
    expect(splitMarkdownBlocks('第一行\n第二行')).toEqual(['第一行\n第二行'])
  })

  it('代码围栏内的空行不会把代码块切开', () => {
    const source = ['```ts', 'const a = 1', '', 'const b = 2', '```'].join('\n')
    const blocks = splitMarkdownBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('const b = 2')
  })

  it('未闭合的代码围栏（流式输出中间态）整体算一块', () => {
    // 流式输出时经常先到 ``` 和几行代码，结尾的 ``` 还没来
    const source = ['```js', 'function f() {', '', '  return 1', ''].join('\n')
    const blocks = splitMarkdownBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('return 1')
  })

  it('~~ 围栏同样被识别', () => {
    const source = ['~~~', 'a', '', 'b', '~~~', '', '后文'].join('\n')
    const blocks = splitMarkdownBlocks(source)
    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toBe('后文')
  })

  it('代码块前后的段落各自成块', () => {
    const source = ['前面的话', '', '```py', 'print(1)', '```', '', '后面的话'].join('\n')
    const blocks = splitMarkdownBlocks(source)
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toBe('前面的话')
    expect(blocks[1]).toContain('print(1)')
    expect(blocks[2]).toBe('后面的话')
  })

  it('被空行拆散的有序列表合并回一块（否则会渲染成两个都从 1 开始）', () => {
    const source = ['1. 第一步', '', '2. 第二步', '', '3. 第三步'].join('\n')
    const blocks = splitMarkdownBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].split('\n').filter((l) => l.trim())).toHaveLength(3)
  })

  it('无序列表的 - * + 三种符号都参与合并', () => {
    const blocks = splitMarkdownBlocks(['- a', '', '* b', '', '+ c'].join('\n'))
    expect(blocks).toHaveLength(1)
  })

  it('引用块被空行拆散也合并', () => {
    const blocks = splitMarkdownBlocks(['> 第一行', '', '> 第二行'].join('\n'))
    expect(blocks).toHaveLength(1)
  })

  it('列表后面接普通段落不合并（避免把正文吞进列表）', () => {
    const source = ['- 列表项', '', '这是一段普通说明。'].join('\n')
    const blocks = splitMarkdownBlocks(source)
    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toBe('这是一段普通说明。')
  })

  it('普通段落之间不合并', () => {
    expect(splitMarkdownBlocks('段落 A\n\n段落 B')).toHaveLength(2)
  })

  it('切出来的块拼回去能覆盖全部非空行（不丢内容）', () => {
    const source = [
      '# 标题',
      '',
      '正文一',
      '',
      '```ts',
      'const x = 1',
      '',
      'const y = 2',
      '```',
      '',
      '- 列表 a',
      '',
      '- 列表 b',
      '',
      '> 引用一',
      '',
      '> 引用二',
      '',
      '收尾段落'
    ].join('\n')

    const blocks = splitMarkdownBlocks(source)
    const restoredLines = blocks
      .join('\n\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const sourceLines = source
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    expect(restoredLines).toEqual(sourceLines)
  })

  it('缩进列表（嵌套）也能识别出列表项', () => {
    const blocks = splitMarkdownBlocks(['  - 子项一', '', '  - 子项二'].join('\n'))
    expect(blocks).toHaveLength(1)
  })
})

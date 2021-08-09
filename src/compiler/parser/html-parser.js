/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
// 匹配标签中的属性 指令
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`

const qnameCapture = `((?:${ncname}\\:)?${ncname})`

// 匹配开始标签
const startTagOpen = new RegExp(`^<${qnameCapture}`)

// 匹配开始标签的闭合标签
const startTagClose = /^\s*(\/?)>/
// 匹配结束标签
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
// 如果是 pre 或者 textarea 且 html 字符串的第一个字符是 '\n'，则返回 true，否则返回 false
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

// TODO options
export function parseHTML (html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  // 初始化当前索引位置
  let index = 0
  // last 上一次的 html 文本，lastTag 上一次解析的标签
  let last, lastTag
  // 循环  html 字符串
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // 第一次查找， lastTag 为 false；且不是 script, style, textarea 标签
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // 寻找 < 的索引位置
      let textEnd = html.indexOf('<')
      // 如果是 0, 则表示标签刚开始
      if (textEnd === 0) {
        // Comment:
        // 判断是否为一个注释节点
        if (comment.test(html)) {
          // 获取注释节点的结束位置
          const commentEnd = html.indexOf('-->')
          if (commentEnd >= 0) {
            // 是否保留注释节点
            if (options.shouldKeepComment) {
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 条件注释
        /**
         * <!--[if IE]>
         * <![endif]-->
         */
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        // 匹配结束标签
        const endTagMatch = html.match(endTag)
        // 如果匹配到 结束标签
        if (endTagMatch) {
          const curIndex = index
          // 前进 匹配到到标签到长度
          advance(endTagMatch[0].length)
          // 调用 parseEndTag 函数处理
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        // 匹配开始标签
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          // 如果是 pre 或者 textarea 且第一个字符是 '\n'，则前进 1
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      // 如果不是开始 <
      if (textEnd >= 0) {
        // 从 textEnd 位置开始截取 html 字符串并缓存到 rest
        rest = html.slice(textEnd)
        // rest 字符串不是结束标签，也不是开始标签，不是注释标签，也不是条件注释标签
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          // 给 next 赋值为 rest 字符串中下一个开始标签的索引，从 索引为1 开始查找
          next = rest.indexOf('<', 1)
          // 如果 next 不存在，直接跳出
          if (next < 0) break
          // 更新 textEnd 为 textEnd + next
          textEnd += next
          // 重新从 textEnd 位置开始截取 html 字符串，并将值赋值给 rest
          rest = html.slice(textEnd)
        }
        // 从 0 开始截取 到 textEnd 位置的 html 字符串，这部分字符串为文本
        text = html.substring(0, textEnd)
      }
      // 如果 textEnd < 0，html 字符串就全部都是 文本
      if (textEnd < 0) {
        text = html
      }
      // 如果 文本存在
      if (text) {
        // 前进文本的长度
        advance(text.length)
      }

      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      // 如果 lastTag 存在，或者是 script, style, textarea
      let endTagLength = 0
      // 声明变量 stackedTag，赋值为 lastTag 小写
      const stackedTag = lastTag.toLowerCase()
      // 获取 stackedTag 的缓存正则
      // 如果不存在，则赋值 为前面匹配 空白和非空白字符，以 lastTag 为结束闭合标签
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      // 调用 字符串的 replace 方法
      // abcdefghijk</div>
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        // all: abcdefghijk</div>
        // text: abcdefghijk
        // endTag: </div>
        // 给 endTagLength 赋值为 endTag 的 length
        endTagLength = endTag.length

        // 不是 script, style, textarea 标签，也不是 noscript
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          //
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        // 如果 stackedTag 是 pre 或者 textarea 且 text 第一个字符是 '\n'
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          // 从所用为 1 开始截取 text，并将截取后的字符赋值给 text
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      // 给  index 赋值
      index += html.length - rest.length
      // 将 html 重置为 ''
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }
    // 如果 html 和 最后剩余的 html 字符串相等
    if (html === last) {
      options.chars && options.chars(html)
      // 抛出警告，有标签未全部匹配结束，即存在开始标签没有结束的闭合标签
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // 修改 index 的位置，更新后的 index = index + n，更新 html 的值，将原 html 从索引为 n 的位置开始截取
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  function parseStartTag () {
    // 匹配开始标签 <xx
    // <div>这是一个div</div>
    // start: ['<div', 'div', index: 0, input: xxx]
    const start = html.match(startTagOpen)
    // 如果 start 存在
    if (start) {
      // 声明 变量 match，存储 tagName：匹配到到标签名， attrs 初始值为 []，start 初始值为 index
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      // 前进 start
      advance(start[0].length)
      let end, attr
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      if (end) {
        match.unarySlash = end[1]
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    // 如果标签名存在
    if (tagName) {
      // 将标签名转小写，并赋值给 lowerCasedTagName 变量
      lowerCasedTagName = tagName.toLowerCase()
      // 从 后向前 遍历 stack
      for (pos = stack.length - 1; pos >= 0; pos--) {
        // 如果 stack 中到位置和 lowerCasedTagName 相等，跳出循环；缓存 pos 的值
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    // 如果 pos 的值大于等于 0
    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 从 后向前遍历 stack；直至 i >= pos
      for (let i = stack.length - 1; i >= pos; i--) {
        // 在开发环境中，i > pos 或者 tagName 不存在，且开启了警告
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          // 控制台输出警告 tag 对应的标签没有匹配到对应的 闭合标签
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }
        // TODO
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 修改  stack 的长度
      stack.length = pos
      // 如果 pos > 0 ,则给 lastTag 赋值为 stack 中的最后一个标签
      lastTag = pos && stack[pos - 1].tag
      // TODO 如果是 br 标签
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
      // TODO 如果是 p 标签
      // 由于 p 标签 html 渲染的特殊性，做额外的处理
      // p 标签 嵌套，或者 <p> 标签后面跟随
      // <address>, <article>, <aside>, <blockquote>, <div>, <dl>, <fieldset>, <footer>,
      // <form>, <h1> (en-US), <h2> (en-US), <h3> (en-US), <h4> (en-US), <h5> (en-US), <h6> (en-US), <header>,
      // <hr>, <menu>, <nav>, <ol>, <pre>, <section>, <table>, <ul>
      // 可以省去结束标签，但最终但渲染结果会将上述标签抽离出
      // <p><div>1111</div></p>
      // <p></p><div>1111</div><p></p>
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}

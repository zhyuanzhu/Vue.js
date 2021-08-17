/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}

/**
 * 解析文本内容
 * @param text
 * @param delimiters 分隔符  delimiters: ['${', '}']
 * @returns {{expression: string, tokens: []}}
 */
export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  // 如果传入的字符串不匹配正则，return
  if (!tagRE.test(text)) {
    return
  }
  const tokens = []
  const rawTokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  // text: {{ abc }}
  // 第一次 while 循环完之后 lastIndex = 9，与字符串 text 的长度相等
  // 如果 lastIndex 大于字符串的长度，则 regexp.test 和 regexp.exec 将会匹配失败，然后 lastIndex 被设置为 0
  // 如果 lastIndex 等于字符串的长度，且该正则表达式匹配空字符串，则该正则表达式匹配从 lastIndex 开始的字符串
  // 如果 lastIndex 等于字符串的长度，且该正则表达式不匹配空字符串，则该正则表达式不匹配字符串，lastIndex 被设置为 0
  // 否则，lastIndex 被设置为紧随最近一次成功匹配的下一个位置

  // 如果 text: {{ msg }}     ===> <div> {{ msg }} </div>

  // 如果 text: {{ msg.length > 1 ? 'a' : 'b' }}
  while ((match = tagRE.exec(text))) {
    // 0
    index = match.index
    // push text token
    // msg 情况， index = 1
    if (index > lastIndex) {
      // tokenValue 是一个空字符串 ' '
      rawTokens.push(tokenValue = text.slice(lastIndex, index))
      // JSON.stringify(tokenValue) "\" \""
      tokens.push(JSON.stringify(tokenValue))

      // rawTokens = [' ']
      // tokens = ["\" \""]
    }
    // tag token
    // abc
    const exp = parseFilters(match[1].trim())
    // exp msg
    // 此时的 tokens = ["\" \"", '_s(msg)']
    // rawTokens = [' ', { '@binding': 'msg' }]
    /** -------------------- */
    // 三目运算符
    // 此时的 tokens = ['_s(msg.length > 1 ? 'a' : 'b')']
    // rawTokens = [{ '@binding': 'msg.length > 1 ? 'a' : 'b'' }]
    tokens.push(`_s(${exp})`)
    rawTokens.push({ '@binding': exp })
    // 0 + {{ abc }}.length  ===> 9
    // msg 时候的 lastIndex: 1 + 9  ===> 10
    lastIndex = index + match[0].length
  }
  // 9 < 9  false
  // 10 < ' {{ msg }} '.length 是 11
  if (lastIndex < text.length) {
    // rawTokens = [' ', { '@binding': 'msg' }, ' ']
    // tokens = ["\" \"", '_s(msg)', "\" \""]
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }

  // tokens: ['_s(abc)']
  // rawTokens: [{'@binding': 'abc'}]
  // msg 时 tokens.join('+') ==> "\" \"+_s(msg)+\" \""
  return {
    expression: tokens.join('+'),
    tokens: rawTokens
  }
}

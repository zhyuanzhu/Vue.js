/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize, hyphenate } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex
} from '../helpers'

export const onRE = /^@|^v-on:/
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/
  : /^v-|^@|^:|^#/
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
const stripParensRE = /^\(|\)$/g
const dynamicArgRE = /^\[.*\]$/

const argRE = /:(.*)$/
export const bindRE = /^:|^\.|^v-bind:/
const propBindRE = /^\./
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g

const slotRE = /^v-slot(:|$)|^#/

const lineBreakRE = /[\r\n]/
const whitespaceRE = /[ \f\t\r\n]+/g

const invalidAttributeRE = /[\s"'<>\/=]/

const decodeHTMLCached = cached(he.decode)

export const emptySlotScopeToken = `_empty_`

// configurable state
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
let maybeComponent

// 创建一个 元素节点的 AST
export function createASTElement (
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    rawAttrsMap: {},
    parent,
    children: []
  }
}

/**
 * Convert HTML string to AST.
 */
// 将 template 模版字符串编译为 ast
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no
  const isReservedTag = options.isReservedTag || no
  maybeComponent = (el: ASTElement) => !!(
    el.component ||
    el.attrsMap[':is'] ||
    el.attrsMap['v-bind:is'] ||
    !(el.attrsMap.is ? isReservedTag(el.attrsMap.is) : isReservedTag(el.tag))
  )

  // pluckModuleFunction 返回 符合条件的数组，每一项都是函数
  // options 定义在  src/platforms/web/compiler/options.js
  // modules 定义在  src/platforms/web/compiler/modules/index.js

  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false
  const whitespaceOption = options.whitespace
  let root
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  function warnOnce (msg, range) {
    if (!warned) {
      warned = true
      warn(msg, range)
    }
  }

  /**
   * 删除空白子节点，移除 slotScope 节点；校验 element 的一些规则
   * @param element
   */
  function closeElement (element) {
    // 移除 element 中的空白节点，从 children 中移除
    trimEndingWhitespace(element)
    if (!inVPre && !element.processed) {
      element = processElement(element, options)
    }
    // tree management
    // stack.length > 0 说明 element 还有父元素
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(element)
        }
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        })
      } else if (process.env.NODE_ENV !== 'production') {
        warnOnce(
          `Component template should contain exactly one root element. ` +
          `If you are using v-if on multiple elements, ` +
          `use v-else-if to chain them instead.`,
          { start: element.start }
        )
      }
    }
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent)
      } else {
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        }
        currentParent.children.push(element)
        element.parent = currentParent
      }
    }

    // final children cleanup
    // filter out scoped slots
    // 将 element.children 中 子项是 slotScope 的过滤掉
    element.children = element.children.filter(c => !(c: any).slotScope)
    // remove trailing whitespace node again
    trimEndingWhitespace(element)

    // check pre state
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    // web 平台 postTransforms = []
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  /**
   * 将元素的空白节点取出，并从 children 列表中移除
   * @param el ASTElement
   */
  function trimEndingWhitespace (el) {
    // remove trailing whitespace node
    if (!inPre) {
      let lastNode
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === ' '
      ) {
        el.children.pop()
      }
    }
  }

  function checkRootConstraints (el) {
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
        'contain multiple nodes.',
        { start: el.start }
      )
    }
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
        'it renders multiple elements.',
        el.rawAttrsMap['v-for']
      )
    }
  }

  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,

    // 创建 ast 树并做一些管理
    start (tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      //  currentParent 第一次为 undefined
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }
      // 创建一个 元素的 AST 树
      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      // 给 创建的 节点添加属性
      if (ns) {
        element.ns = ns
      }

      if (process.env.NODE_ENV !== 'production') {
        // 如果传入了  outputSourceRange
        if (options.outputSourceRange) {
          element.start = start
          element.end = end
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr
            return cumulated
          }, {})
        }
        attrs.forEach(attr => {
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
              `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length
              }
            )
          }
        })
      }

      // 传入 style || script 标签 且 不是服务端渲染
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.',
          { start: element.start }
        )
      }

      // apply pre-transforms
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }

      // v-pre 指令相关
      if (!inVPre) {
        processPre(element)
        if (element.pre) {
          inVPre = true
        }
      }
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives
        // 解析 v-for 属性
        processFor(element)

        // 解析 v-if 属性
        processIf(element)
        processOnce(element)
      }

      // 如果是第一次，root 不存在
      if (!root) {
        // 将创建的  ast 赋值给 root
        root = element
        if (process.env.NODE_ENV !== 'production') {
          // 如果是开发环境，对 root 节点元素 tag 做类判断
          checkRootConstraints(root)
        }
      }

      if (!unary) {
        // 如果是 双标签
        // 将当前 创建的 ASTElement 赋值给 currentParent，做一个单项的父子节点关系映射
        currentParent = element
        // 将 element push 进栈
        stack.push(element)
      } else {
        closeElement(element)
      }
    },

    // 管理 ast 树，并做结束标签的处理
    end (tag, start, end) {
      // 解析结束标签，从栈顶获取最当前结束标签对应的元素
      const element = stack[stack.length - 1]
      // pop stack
      // 出栈
      stack.length -= 1
      // 获取当前元素的父元素
      currentParent = stack[stack.length - 1]
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        element.end = end
      }
      closeElement(element)
    },

    // 文本处理，创建文本的 ast 节点
    chars (text: string, start: number, end: number) {
      // 如果当前节点是根节点
      // 对 没有 template tag 标签，及 template 标签里面没有 dom 元素包裹，直接是 文本对情况抛出警告
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          // 组件就是纯文本
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start }
            )
          // 文本写在了组件之外
          } else if ((text = text.trim())) {
            warnOnce(
              `text "${text}" outside root element will be ignored.`,
              { start }
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */

      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }

      const children = currentParent.children
      if (inPre || text.trim()) {
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
      // 文本长度 = 0
      } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        text = ''
      } else if (whitespaceOption) {
        // TODO  condense ???
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' '
        } else {
          text = ' '
        }
      } else {
        text = preserveWhitespace ? ' ' : ''
      }
      // 格式化文本之后，如果 text 文本存在
      if (text) {
        if (!inPre && whitespaceOption === 'condense') {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, ' ')
        }
        let res
        let child: ?ASTNode
        // 不是 v-pre 且 text 不是 ' '
        // res = { expression: string, tokens: [] }
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          }
        // 当前 文本 不是 ' ' || 当前 children 的 length = 0 || 当前 children 的 最后一项（栈顶）的 文本值 不是 ' '
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          child = {
            type: 3,
            text
          }
        }
        if (child) {
          if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
            child.start = start
            child.end = end
          }
          // 将 当前文本 AST push 添加到 当前文本元素的父元素的 children 中
          children.push(child)
        }
      }
    },

    // 处理 注释，创建 注释节点
    comment (text: string, start, end) {
      // adding anything as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      // 如果 当前元素的 父元素存在，currentParent 已经在 start 的时候做了初始化
      if (currentParent) {
        // 初始化创建一个注释 AST
        const child: ASTText = {
          type: 3,
          text,
          isComment: true
        }
        // 非生产环境且 options 的 outputSourceRange 属性值 存在
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          child.start = start
          child.end = end
        }
        // 将该注释节点添加进去
        currentParent.children.push(child)
      }
    }
  })
  return root
}

/**
 * 如果 v-pre 属性存在，给该 el 元素 AST 添加 pre 属性，赋值为 true
 * @param el ASTElement
 */
function processPre (el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

/**
 * 处理 el 的 attrsList 属性列表
 * @param el ASTElement
 */
function processRawAttrs (el) {
  const list = el.attrsList
  const len = list.length
  // 如果 el 的 attrsList 存在
  if (len) {
    const attrs: Array<ASTAttr> = el.attrs = new Array(len)
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value)
      }
      if (list[i].start != null) {
        attrs[i].start = list[i].start
        attrs[i].end = list[i].end
      }
    }
  // attrs = [
    // {
    //  name: 'name',
    //  value: 'value',
    //  start?: 'start',
    //  end?: 'end'
    // }, ...
    // ]
  // 如果 el.pre 不存在，给 el 上挂载 plain 属性，设置为 true
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true
  }
}

// 解析 元素 AST
export function processElement (
  element: ASTElement,
  options: CompilerOptions
) {
  // 给 element 设置 key 属性
  processKey(element)

  // element.key = key

  // determine whether this is a plain element after
  // removing structural attributes
  // 如果不存在 key ,没有 slot-scope v-slot ,也没有属性
  // 则给 element 挂载 属性 plain，赋值为 true，否则是 false
  element.plain = (
    !element.key &&
    !element.scopedSlots &&
    !element.attrsList.length
  )

  processRef(element)
  // element.ref = ref
  // element.refInFor = boolean

  processSlotContent(element)
  // element.slotTarget
  // element.slotTargetDynamic
  // 如果 element.tag 不是 template 标签上，且 element.slotScope 不存在, 则 element.plain = false

  processSlotOutlet(element)
  // 如果是 slot 标签
  // element.slotName = xxx

  processComponent(element)
  // el.component  如果 el.is 存在
  // el.inlineTemplate  如果 el.attrsMap['inline-template'] 存在

  // 遍历 options.modules 中每一项的 transformNode 对应的值
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }

  processAttrs(element)
  return element
}

// 获取 key
// 如果 key 存在，给 el 挂载属性 key，并赋值为 获取到的值
function processKey (el) {
  // 获取元素的 key 属性值
  const exp = getBindingAttr(el, 'key')
  // 如果 key 存在
  if (exp) {
    // 非生产环境，将 key 设置在 template 上，会抛出警告
    if (process.env.NODE_ENV !== 'production') {
      if (el.tag === 'template') {
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, 'key')
        )
      }
      // 如果 el 有 for 属性
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1
        const parent = el.parent
        if (iterator && iterator === exp && parent && parent.tag === 'transition-group') {
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
            `this is the same as not using keys.`,
            getRawBindingAttr(el, 'key'),
            true /* tip */
          )
        }
      }
    }
    el.key = exp
  }
}

// 处理 ref
function processRef (el) {
  // 获取 el 的 ref 属性
  const ref = getBindingAttr(el, 'ref')
  // 如果 ref 存在
  if (ref) {
    // 给 el 挂载 ref 属性，值为 ref
    el.ref = ref
    // 给 el 挂载 refInFor 属性，值为 checkInFor 的返回值
    // 如果 el 及其 parent 都没有 for 属性，则返回 false，否则返回 true
    el.refInFor = checkInFor(el)
  }
}

export function processFor (el: ASTElement) {
  let exp
  // 获取 v-for 的属性值，并从 el 的 attrsList 中删除 该项
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    // res = null 或 { for: '需要遍历的对象', alias: '每一项的值', iterator1: '数组的话是索引，对象是 key 值', iterator2: '数组没有这个属性，对象是索引'}
    const res = parseFor(exp)
    if (res) {
      // 如果 存在，将 res 对象扩展到 el 上
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`,
        el.rawAttrsMap['v-for']
      )
    }
  }
}

type ForParseResult = {
  for: string;
  alias: string;
  iterator1?: string;
  iterator2?: string;
};

/**
 * 解析 v-for 的属性值，并返回解析后的对象
 * @param exp
 * @returns {{}}
 */
export function parseFor (exp: string): ?ForParseResult {
  // 查看传入的 exp 字符串是否满足 v-for 的书写规则要求
  const inMatch = exp.match(forAliasRE)
  if (!inMatch) return
  const res = {}
  // 如果满足
  // 例如 exp = '(item, index) in list'
  // inMatch = ["(item, index) in list", "(item, index)", "list"]

  // exp = 'item in list'
  // inMatch = ["item in list", "item", "list"]

  res.for = inMatch[2].trim()
  // res = { for: 'list' }

  // 去掉 inMatch[1] 两头的 空白 并将 括号替换为 ''
  // 'item, index'
  // item
  const alias = inMatch[1].trim().replace(stripParensRE, '')

  // 如果不是单个 的 item 这样，则 iteratorMatch 有值，否则为 null
  // [", index", " index",]
  const iteratorMatch = alias.match(forIteratorRE)
  if (iteratorMatch) {
    // 将 'item, index' 中的 ', index' 替换掉
    res.alias = alias.replace(forIteratorRE, '').trim()
    // iterator1 = index
    res.iterator1 = iteratorMatch[1].trim()
    // 如果第三行存在 'key, value, index' 遍历对象的时候处理
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim()
    }
    // res = {
    //    for: 'list',
    //    alias: 'item',
    //    iterator1: 'index',
    //    iterator2?: 'v'
    // }
  } else {
    res.alias = alias
  }
  // res 对象至少保证了存在 需要遍历的对象 for 和 每一项 alias
  return res
}

/**
 * 解析 v-if 属性，并给 el 挂载属性
 * @param el ASTElement
 */
function processIf (el) {
  // v-if="isShow"
  const exp = getAndRemoveAttr(el, 'v-if')
  // 如果获取到 v-if 属性
  if (exp) {
    // 给元素挂载 if 属性，其值为 获取到的 v-if 的属性值      eg: ---> isShow
    el.if = exp
    // TODO  这样处理的原因是什么？？？？
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  // 如果没获取到 v-if 的属性值
  } else {
    // 尝试获取标签的 v-else 属性
    if (getAndRemoveAttr(el, 'v-else') != null) {
      // 如果 获取到了 v-else 属性的值
      // 给元素 el 挂载 else 属性，并设置为 true
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      // 如果 获取到了 v-else-if 属性的值
      // 给元素挂载 elseif 属性，并给其赋值为 获取到的 v-else-if 的属性值
      el.elseif = elseif
    }
  }
}

function processIfConditions (el, parent) {
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    )
  }
}

function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`,
          children[i]
        )
      }
      children.pop()
    }
  }
}

export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  // 查看传入的元素是否有 ifConditions 属性，如果没有，给元素挂载该属性，并初始化为一个空数组
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  // 向元素的 ifConditions 中 push condition 值
  // v-if 的时候 是 { exp: v-if 的属性值， block: 当前的 ASTElement }
  el.ifConditions.push(condition)
}

function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
/**
 * 获取 slot 属性绑定的值
 * @param el
 */
function processSlotContent (el) {
  let slotScope
  if (el.tag === 'template') {
    // 如果 是 template, 且有 scope 属性
    slotScope = getAndRemoveAttr(el, 'scope')
    /* istanbul ignore if */
    // 非生产环境，且 slotScope 存在，抛出警告信息
    if (process.env.NODE_ENV !== 'production' && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
        `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
        `can also be used on plain elements in addition to <template> to ` +
        `denote scoped slots.`,
        el.rawAttrsMap['scope'],
        true
      )
    }
  // 给 el 挂载 slotScope 属性，值为 scope 或者 slot-scope 的属性值
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')

  // 如果 getAndRemoveAttr(el, 'slot-scope') 的返回值存在，则将返回值赋值给 slotScope
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
        `(v-for takes higher priority). Use a wrapper <template> for the ` +
        `scoped slot to make it clearer.`,
        el.rawAttrsMap['slot-scope'],
        true
      )
    }
    el.slotScope = slotScope
  }

  // slot="xxx"
  // 获取 slot 的动态绑定值 v-slot :slot
  const slotTarget = getBindingAttr(el, 'slot')
  // slotTarget 存在
  if (slotTarget) {
    // 查看是否是 ""，如果是 赋值为 ""，否则赋值为 它自身
    // 给 el 挂载 slotTarget 属性，值为 "default" 或 slotTarget
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
    // 给 el 挂载 slotTargetDynamic 属性
    // 如果 存在 :slot 或者 v-bind:slot 属性，则赋值为 true，否则是 false
    el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot'])
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    // 如果 不是 template 标签上，且 el.slotScope 不存在
    if (el.tag !== 'template' && !el.slotScope) {
      // 给 el 添加 slot 属性，值为 slotTarget
      // 添加的属性值为
      // { start, end } = getRawBindingAttr(el, 'slot') 如果返回值里面有 start 和 end，且 != null
      // { name: 'slot', value: slotTarget, dynamic: false, start, end }
      // el.attrs.push 上面的 属性值
      // el.plain = false
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'))
    }
  }

  // 2.6 v-slot syntax
  // TODO
  if (process.env.NEW_SLOT_SYNTAX) {
    if (el.tag === 'template') {
      // v-slot on <template>
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (el.slotTarget || el.slotScope) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              `<template v-slot> can only appear at the root level inside ` +
              `the receiving component`,
              el
            )
          }
        }
        const { name, dynamic } = getSlotName(slotBinding)
        el.slotTarget = name
        el.slotTargetDynamic = dynamic
        el.slotScope = slotBinding.value || emptySlotScopeToken // force it into a scoped slot for perf
      }
    } else {
      // v-slot on component, denotes default slot
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (!maybeComponent(el)) {
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            )
          }
          if (el.slotScope || el.slotTarget) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
              `<template> syntax when there are other named slots.`,
              slotBinding
            )
          }
        }
        // add the component's children to its default slot
        const slots = el.scopedSlots || (el.scopedSlots = {})
        const { name, dynamic } = getSlotName(slotBinding)
        const slotContainer = slots[name] = createASTElement('template', [], el)
        slotContainer.slotTarget = name
        slotContainer.slotTargetDynamic = dynamic
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer
            return true
          }
        })
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken
        // remove children as they are returned from scopedSlots now
        el.children = []
        // mark el non-plain so data gets generated
        el.plain = false
      }
    }
  }
}

function getSlotName (binding) {
  let name = binding.name.replace(slotRE, '')
  if (!name) {
    if (binding.name[0] !== '#') {
      name = 'default'
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `v-slot shorthand syntax requires a slot name.`,
        binding
      )
    }
  }
  return dynamicArgRE.test(name)
    // dynamic [name]
    ? { name: name.slice(1, -1), dynamic: true }
    // static name
    : { name: `"${name}"`, dynamic: false }
}

// handle <slot/> outlets
/**
 * 获取 slot 插槽内容
 * @param el
 */
function processSlotOutlet (el) {
  // 如果 el.tag 是 slot, 否则直接返回 undefined
  if (el.tag === 'slot') {
    // 获取动态绑定的属性值 name, 并将值作为 slotName 的属性值挂载到 el 上
    el.slotName = getBindingAttr(el, 'name')
    // 如果 slot 标签上有 key，在非生产环境抛出警告
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, 'key')
      )
    }
  }
}

/**
 * 处理 component
 * @param el
 */
function processComponent (el) {
  let binding
  // 查看标签是否有 is 属性，如果有 is 属性，则给 el 挂载属性 component，值为 is 的属性值
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }

  // 如果 el 有 inline-template 属性
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    // 则给 el 挂载 inlineTemplate 属性，值为 true
    el.inlineTemplate = true
  }
}

function processAttrs (el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic
  // 遍历 传入的 ASTElement 的 attrsList
  for (i = 0, l = list.length; i < l; i++) {
    // 缓存每一项的 name 与 value
    name = rawName = list[i].name
    value = list[i].value
    // 如果 name 是动态绑定的
    // 例如 v-bind @click :class
    if (dirRE.test(name)) {
      // mark element as dynamic
      el.hasBindings = true
      // modifiers
      // name.replace(dirRE, ''） @click ---> click
      // TODO  =============
      modifiers = parseModifiers(name.replace(dirRE, ''))
      // support .foo shorthand syntax for the .prop modifier
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        (modifiers || (modifiers = {})).prop = true
        name = `.` + name.slice(1).replace(modifierRE, '')
      } else if (modifiers) {
        name = name.replace(modifierRE, '')
      }
      if (bindRE.test(name)) { // v-bind
        name = name.replace(bindRE, '')
        value = parseFilters(value)
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        if (
          process.env.NODE_ENV !== 'production' &&
          value.trim().length === 0
        ) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          )
        }
        if (modifiers) {
          if (modifiers.prop && !isDynamic) {
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          if (modifiers.camel && !isDynamic) {
            name = camelize(name)
          }
          if (modifiers.sync) {
            syncGen = genAssignmentCode(value, `$event`)
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              )
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                )
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              )
            }
          }
        }
        if ((modifiers && modifiers.prop) || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value, list[i], isDynamic)
        } else {
          addAttr(el, name, value, list[i], isDynamic)
        }
      } else if (onRE.test(name)) { // v-on
        name = name.replace(onRE, '')
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic)
      } else { // normal directives
        name = name.replace(dirRE, '')
        // parse arg
        const argMatch = name.match(argRE)
        let arg = argMatch && argMatch[1]
        isDynamic = false
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1)
            isDynamic = true
          }
        }
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i])
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          )
        }
      }
      addAttr(el, name, JSON.stringify(value), list[i])
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true', list[i])
      }
    }
  }
}

/**
 * 查看 传入的 ASTElement 及其 parent 是否存在 for 属性，如果有一个存在，则返回 true ,否则 返回 false
 * @param el ASTElement
 * @returns {boolean}
 */
function checkInFor (el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE)
  if (match) {
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}

// 创建一个 attr 的 map
function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  // 如果 attrs 的长度大于 0
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name, attrs[i])
    }
    // 将每一项属性的 name 作为 key
    // 其对应的 value 作为值
    map[attrs[i].name] = attrs[i].value
  }
  // 返回这个属性 和 属性值的 k: v 对象
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
// 查看 ASTElement 是否是 script 后者 style 标签
function isTextTag (el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}

/**
 * 判断标签是否被允许  不允许 style 标签， script 标签
 * @param el ASTElement
 * @returns {boolean|boolean}
 */
function isForbiddenTag (el): boolean {
  // 如果传入的 el 的 tag 是 style 或者
  // 是 script, 且 标签的 的属性不存在 type 或者 type 的值是 text/javascript, 都返回 true
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug (attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap['v-model']
      )
    }
    _el = _el.parent
  }
}

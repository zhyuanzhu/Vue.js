/* @flow */

import { emptyObject } from 'shared/util'
import { parseFilters } from './parser/filter-parser'

type Range = { start?: number, end?: number };

/* eslint-disable no-unused-vars */
export function baseWarn (msg: string, range?: Range) {
  console.error(`[Vue compiler]: ${msg}`)
}
/* eslint-enable no-unused-vars */

/**
 * 返回一个数组，modules 中 每一项 key 对应的属性值，并过滤掉 false 的， modules 不存在返回 []
 * @param modules
 * @param key
 * @returns {*}
 */
export function pluckModuleFunction<F: Function> (
  modules: ?Array<Object>,
  key: string
): Array<F> {
  // 如果 modules 存在，返回 modules 中每一项 m 的 m[key] 生成的新数组， filter 过滤掉 m[key] 不存在的项
  return modules
    ? modules.map(m => m[key]).filter(_ => _)
    : []
}

export function addProp (el: ASTElement, name: string, value: string, range?: Range, dynamic?: boolean) {
  (el.props || (el.props = [])).push(rangeSetItem({ name, value, dynamic }, range))
  el.plain = false
}

// 给 el 添加属性
export function addAttr (el: ASTElement, name: string, value: any, range?: Range, dynamic?: boolean) {
  const attrs = dynamic
    ? (el.dynamicAttrs || (el.dynamicAttrs = []))
    : (el.attrs || (el.attrs = []))
  // rangeSetItem({ name, value, dynamic }, range) => {name, value, dynamic, start?: range.start, end?: range.end}
  attrs.push(rangeSetItem({ name, value, dynamic }, range))
  el.plain = false
}

// add a raw attr (use this in preTransforms)
export function addRawAttr (el: ASTElement, name: string, value: any, range?: Range) {
  el.attrsMap[name] = value
  el.attrsList.push(rangeSetItem({ name, value }, range))
}

export function addDirective (
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  isDynamicArg: boolean,
  modifiers: ?ASTModifiers,
  range?: Range
) {
  (el.directives || (el.directives = [])).push(rangeSetItem({
    name,
    rawName,
    value,
    arg,
    isDynamicArg,
    modifiers
  }, range))
  el.plain = false
}

/**
 * 对事件名和修饰符进行字符串拼接
 * @param symbol 自定义标识
 * @param name 事件名称
 * @param dynamic
 * @returns {string}
 */
function prependModifierMarker (symbol: string, name: string, dynamic?: boolean): string {
  // 如果 dynamic 为 true, 拼接为 _p函数的参数  ===> _p(name, symbol)
  // 否则直接返回 symbol + name 的字符串
  return dynamic
    ? `_p(${name},"${symbol}")`
    : symbol + name // mark the event as captured
}

/**
 * 添加事件
 * @param el ASTElement
 * @param name 事件名称
 * @param value 事件处理函数
 * @param modifiers 事件修饰 .stop .prevent .once 等
 * @param important
 * @param warn
 * @param range
 * @param dynamic
 */
export function addHandler (
  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean,
  warn?: ?Function,
  range?: Range,
  dynamic?: boolean
) {
  modifiers = modifiers || emptyObject
  // warn prevent and passive modifier
  /* istanbul ignore if */
  // 非生产环境，对同一事件同时采用 prevent 和 passive 修饰 会抛出警告
  // .passive 不阻止事件的默认行为，.prevent 阻止事件的默认行为     处理结果会忽略掉 .prevent
  if (
    process.env.NODE_ENV !== 'production' && warn &&
    modifiers.prevent && modifiers.passive
  ) {
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.',
      range
    )
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  // 鼠标按键行为
  if (modifiers.right) {
    if (dynamic) {
      name = `(${name})==='click'?'contextmenu':(${name})`
    } else if (name === 'click') {
      name = 'contextmenu'
      delete modifiers.right
    }
  } else if (modifiers.middle) {
    if (dynamic) {
      name = `(${name})==='click'?'mouseup':(${name})`
    } else if (name === 'click') {
      name = 'mouseup'
    }
  }

  // check capture modifier
  // 事件捕获
  if (modifiers.capture) {
    delete modifiers.capture
    name = prependModifierMarker('!', name, dynamic)
  }
  if (modifiers.once) {
    delete modifiers.once
    name = prependModifierMarker('~', name, dynamic)
  }
  /* istanbul ignore if */
  if (modifiers.passive) {
    delete modifiers.passive
    name = prependModifierMarker('&', name, dynamic)
  }

  let events
  if (modifiers.native) {
    delete modifiers.native
    events = el.nativeEvents || (el.nativeEvents = {})
  } else {
    events = el.events || (el.events = {})
  }

  const newHandler: any = rangeSetItem({ value: value.trim(), dynamic }, range)
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers
  }

  const handlers = events[name]
  /* istanbul ignore if */
  if (Array.isArray(handlers)) {
    important ? handlers.unshift(newHandler) : handlers.push(newHandler)
  } else if (handlers) {
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
  } else {
    events[name] = newHandler
  }

  el.plain = false
}

/**
 *
 * @param el ASTElement
 * @param name
 * @returns {ASTAttr} 返回 key 为 :xx || v-bind:xx || xx 对应的属性值
 */
export function getRawBindingAttr (
  el: ASTElement,
  name: string
) {
  return el.rawAttrsMap[':' + name] ||
    el.rawAttrsMap['v-bind:' + name] ||
    el.rawAttrsMap[name]
}

// 获取绑定的属性 :xx v-bind:xx
// 获取动态绑定的属性值，如果 getStatic 是 true，则将该属性值在 attrsList 中的项删除，返回 该属性对应的值
export function getBindingAttr (
  el: ASTElement,
  name: string,
  getStatic?: boolean
): ?string {
  // 获取动态绑定的属性值 :xx v-bind:xx
  const dynamicValue =
    getAndRemoveAttr(el, ':' + name) ||
    getAndRemoveAttr(el, 'v-bind:' + name)
  // 如果有值
  if (dynamicValue != null) {
    return parseFilters(dynamicValue)
  } else if (getStatic !== false) {
    const staticValue = getAndRemoveAttr(el, name)
    if (staticValue != null) {
      return JSON.stringify(staticValue)
    }
  }
}

// note: this only removes the attr from the Array (attrsList) so that it
// doesn't get processed by processAttrs.
// By default it does NOT remove it from the map (attrsMap) because the map is
// needed during codegen.
/**
 * 获取对应的属性值，如果 属性值存在，则在属性 attrsList 中找到该项，然后删除该项。如果传入了 removeFromMap 是 true, 则从 attrsMap 中也将该属性删除
 * @param el ASTElement
 * @param name String
 * @param removeFromMap  是否删除
 * @returns {*}
 */
export function getAndRemoveAttr (
  el: ASTElement,
  name: string,
  removeFromMap?: boolean
): ?string {
  let val
  // 从元素节点 ASTElement 中获取所有属性的 k: v map对象
  // 查看 该对象中是否存在传入的  name 的属性值
  // 如果存在
  if ((val = el.attrsMap[name]) != null) {
    // 将属性数组 缓存到 list Array<ASTAttr>
    const list = el.attrsList
    // 遍历属性数组
    for (let i = 0, l = list.length; i < l; i++) {
      // 找到属性名和 name 相等的一项
      if (list[i].name === name) {
        // 删除数组中的该项，退出循环
        list.splice(i, 1)
        break
      }
    }
  }
  // 如果 removeFromMap 传入了
  if (removeFromMap) {
    // 删除 属性 map 中对应的属性值
    delete el.attrsMap[name]
  }
  // 返回获取到的该属性值
  return val
}

// 与 getAndRemoveAttr 不同的是 传入的 name 是 一个正则表达式
// 如果有 和正则想匹配的属性，返回该属性
// {
// name,
// value,
// start?,
// end?
// }
export function getAndRemoveAttrByRegex (
  el: ASTElement,
  name: RegExp
) {
  const list = el.attrsList
  for (let i = 0, l = list.length; i < l; i++) {
    const attr = list[i]
    if (name.test(attr.name)) {
      list.splice(i, 1)
      return attr
    }
  }
}

// 修改参数 item 的 start 和 end 属性
function rangeSetItem (
  item: any,
  range?: { start?: number, end?: number }
) {
  // 如果传入了 range
  // 且 range 传入了 start 和 end 属性
  // 则将 传入的 range 的 start 和 end 赋值给 item.start 和 item.end
  if (range) {
    if (range.start != null) {
      item.start = range.start
    }
    if (range.end != null) {
      item.end = range.end
    }
  }
  return item
}

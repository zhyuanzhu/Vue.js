/* @flow */

import { warn } from 'core/util/index'

export * from './attrs'
export * from './class'
export * from './element'

/**
 * Query an element selector if it's not an element already.
 */
export function query (el: string | Element): Element {
  if (typeof el === 'string') {
    // 如果是字符串，则获取 el
    // 所以页面上如果有多个相同类名 或者 id 之类的元素，为什么会渲染至第一个元素的原因
    const selected = document.querySelector(el)
    // dom 对象不存在，开发环境直接爆出异常警告 并 返回一个空的div
    // 否则返回这个 dom
    if (!selected) {
      process.env.NODE_ENV !== 'production' && warn(
        'Cannot find element: ' + el
      )
      return document.createElement('div')
    }
    return selected
  } else {
    return el
  }
}

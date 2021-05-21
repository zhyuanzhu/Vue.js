/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

// 导入的 Vue 入口
import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 缓存 Vue 原型上的 $mount 方法
const mount = Vue.prototype.$mount
// 重写 Vue 原型上的 $mount 方法
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 获取 el ，取保 el 是 dom
  el = el && query(el)

  /* istanbul ignore if */
  // 传入的 dom  不能是 body 或者 document
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  // 获取 Vue 的 $options 属性
  // 对于 $options 属性应该来源于 从 是 './runtime/index' 导入的 Vue 实例，后续追踪这个来源的 Vue
  const options = this.$options
  // resolve template/el and convert to render function

  // 如果 不存在 render 函数，则调用 缓存起来的 mount 方法，即导入的 Vue.prototype.$mount 方法
  if (!options.render) {
    // 获取 template
    let template = options.template
    // 存在
    if (template) {
      // 判断是否是 字符串 , 例如传入 template: '<h1>hello vue.js</h1>'
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) { // 如果不是字符串，查看 template 的 nodeType
        /**
         * nodeType 枚举
         * 1 元素节点
         * 3 元素或者属性中的文字
         * 4 一个 CDATASection
         * 7 一个 XML 文档的 ProcessingInstruction
         * 8 一个注释节点
         * 9 一个 document 节点
         * 10 描述文档类型的 DocumentType 节点
         * 11 一个 DocumentFragment 节点
         */
        // 此处应该是 元素节点
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // template 不存在，给 template 赋值为 el 这个 dom 元素
      template = getOuterHTML(el)
    }
    if (template) {
      /* istanbul ignore if */
      // 开启性能统计的 mark ?
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // 暂时未知，后续查看
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

// 给 Vue 添加静态属性 compile
// 后续查看
Vue.compile = compileToFunctions

export default Vue

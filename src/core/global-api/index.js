/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  // 给 Vue 添加 config 属性的监听，如果设置了 set ，在开发环境报出异常提醒
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.

  // 不对外公开的方法 util
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  // 给 Vue 添加静态 set 方法
  Vue.set = set
  // 给 Vue 添加静态 delete 方法
  Vue.delete = del
  // 给 Vue 添加静态 nextTick 方法
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  // 给 Vue 添加静态方法 observable 将 obj 对象转成 响应式对象
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  // 给 Vue 添加静态属性 options = Object.create(null)
  Vue.options = Object.create(null)
  // 给 Vue 的静态属性 options 挂载 components, directives, filters
  // ['component', 'directive', 'filter']
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })
  /**
   * Vue.options = {
   *     components: {},
   *     directives: {},
   *     filters: {}
   * }
   */

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  // 给 Vue 的静态属性 options 挂载 _base = Vue
  Vue.options._base = Vue

  // extend(to, from) 将 from 浅拷贝至 to； 如果 key 重复，from 对应的属性或方法覆盖 to 原有的属性或方法
  // builtInComponents 后续查看
  // 设置 keep-alive 组件
  extend(Vue.options.components, builtInComponents)

  // 给 Vue 全局注册插件 Vue.use(plugin)
  initUse(Vue)

  // 全局注册一个混入 Vue.mixin(mixin)
  initMixin(Vue)

  // 利用 Vue.extend(options) 返回一个子组件的构造函数
  initExtend(Vue)

  // 注册 Vue.directive() Vue.component()  Vue.filter()
  initAssetRegisters(Vue)
}

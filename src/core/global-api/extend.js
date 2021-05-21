/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    // 缓存 Vue, this
    const Super = this
    const SuperId = Super.cid
    // 设置一个缓存
    // 设置缓存的意义，每次 extend 都使 cid 递增，
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    // 如果 缓存中的 cid 存在，则直接返回 该 cid 对应的值，
    // _Ctor 何用？？？？
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    // 获取 组件的 name
    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      // 开发环境中校验 name 的格式
      validateComponentName(name)
    }

    // 定义一个 Sub 函数，调用该函数时候 触发函数的 _init 方法
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    // 原型继承
    // Sub 函数的 prototype 指向 Vue.prototype   Super 缓存为 this， 即 Vue
    Sub.prototype = Object.create(Super.prototype)
    // 规范操作，将 Sub 原型的 constructor 指向构造函数
    Sub.prototype.constructor = Sub
    // 绑定 cid 的值，并且递增
    Sub.cid = cid++
    // mergeOptions 后续查看，猜测是合并了 options
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    // 给当前组件添加以恶搞 super 属性，指向 Vue
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    // 如果当前子组件 options 有 props 从父组件传入的值
    if (Sub.options.props) {

      initProps(Sub)
    }
    // 如果当前子组件 options 有 computed 计算属性
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 将 Super 中的成员拷贝到 Sub
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    // 将 Vue 的 components, directives, filters 赋值给当前组件的对应属性
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup

    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    // 给当前组件添加 superOptions 属性用来保存 Vue 组件的 options 属性值
    Sub.superOptions = Super.options
    // 给当前组件添加 extendOptions 用来保存 extendOptions
    Sub.extendOptions = extendOptions
    // 给当前组件添加 sealedOptions 属性用来保存 mergeOptions 之后的 options
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    // 将当前组件缓存至 声明的缓存对象中
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}

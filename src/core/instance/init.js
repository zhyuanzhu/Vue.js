/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  // 给 Vue 实例增加 _init 方法
  // 合并 options
  // 初始化的一些操作
  Vue.prototype._init = function (options?: Object) {
    // 缓存 this , 即 Vue
    const vm: Component = this
    // a uid
    // _uid 递增
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    // 性能监控
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    // 给 Vue 挂载静态属性 _isVue，默认值设为 true
    // 设置响应式的时候会处理
    vm._isVue = true
    // merge options
    // _isComponent 这个属性什么时候生成？
     // 这个条件判断，无论是 if 还是 else 中，都是 为 vm 挂载 $options 属性
    // 判断是否是组件
    if (options && options._isComponent) {
      // 如果 传入的参数 options 有 _isComponent 这个属性
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.

      initInternalComponent(vm, options)
    } else {
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }

    /**
     *  vm 中已经有 $options 属性，即 Vue 已经有 $options 属性
     */

    /* istanbul ignore else */
    // 如果是开发环境
    // 设置渲染时候的代理对象
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      // 生产环境，给 Vue 设置 _renderProxy 静态属性，赋值为 自身
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm

    // 初始化声明周期
    // $children, $parent, $root, $refs
    initLifecycle(vm)

    // 初始化 监听事件
    // 父组件绑定在当前组件上的自定义事件
    initEvents(vm)

    // 初始化 render 中的 h 函数
    // 初始化了 $slots, $scopedSlots, _c, $createElement, $attrs, $listeners
    initRender(vm)

    // 触发生命周期的钩子函数  beforeCreate
    callHook(vm, 'beforeCreate')

    // 把 inject 注入到 vm
    // initInjections 和 initProvide 实现依赖注入
    initInjections(vm) // resolve injections before data/props
    
    initState(vm)

    // 把 provide 注入到 vm
    // 给 vm 挂载 _provide
    initProvide(vm) // resolve provide after data/props

    // 触发生命周期的钩子函数  created
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // vm.constructor 指向 vm 的构造函数
  // 获取 该构造函数的 options 属性，并将 vm.$options 赋值为该属性的值
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.

  // 将一些 options 对象的属性挂载到 opts 上
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData

  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}

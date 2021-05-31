/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options

  // 初始化组件的 props
  // 响应式绑定 props 中的数据 注入到 Vue 实例
  // 可以通过 this._props
  if (opts.props) initProps(vm, opts.props)

  // 初始化组件的 methods 中的方法
  // 判断了 methods 中的方法名 是否在 props 中有同名，并且对 方法名称做了规范处理
  if (opts.methods) initMethods(vm, opts.methods)

  // 判断 data 是否存在
  if (opts.data) {
    // 初始化 data 判断  data 中的属性名称
    // 将 data 注入到 vue 实例中，并做响应式处理 data
    initData(vm)
  } else {
    // 不存在，给 vm 挂载 _data 属性并赋值，定义为响应式对象
    observe(vm._data = {}, true /* asRootData */)
  }

  /** TODO */
  // 初始化 computed
  if (opts.computed) initComputed(vm, opts.computed)

  // 初始化 watch
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

function initData (vm: Component) {
  // 获取 $options 中的 data
  let data = vm.$options.data
  // 将 data 做响应式处理并给 vm._data 赋值
  // 如果是函数，获取返回值。否则直接获取 data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)  // 直接调用，并且改变函数内部的指向 vm
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  // 循环遍历  data 的 key
  // 判断 data 中的属性是否和 props 和 methods 中的属性重名
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      // 如果 methods 中有 data 中的 key, warn 警告
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }

    // 如果 props 中有 data 中的 key, warn 警告
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 判断是否以 _ 或者 $ 开头， 如果不是
      // 将 _data 注入到 vue 实例中
      // proxy 处理的结果为 访问 vm.key  实际访问的是 vm._data.key
      // 将 data 中的 key 都挂载到 _data 上
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 响应式处理 data
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    // 调用该函数，并修改内部的 this 为 传入的参数 vm
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

// TODO
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // 如果不是服务端渲染
      // 将 key 添加至 _computedWatchers 中，并设置 观察者
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 如果 key 不在当前 vm 中
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      // 如果 key 在当前 vm 中
      // 依次判断 key 是否存在于 data, props, methods 中，并给出相应的 warn 警告
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(`The computed property "${key}" is already defined as a method.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 判断是否是 SSR
  const shouldCache = !isServerRendering()

  // 传入的是 函数
  // computed 中的属性值是一个函数
  if (typeof userDef === 'function') {
    // 浏览器环境 给 Object.defineProperty 的第三个参数设置 getter
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    // 如果 computed 的属性值是对象，
    // 如果存在 getter
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false        // 不是服务端渲染    且传入的对象的 cache 属性不是 false
        ? createComputedGetter(key)                   // 给该 key 创建一个
        : createGetterInvoker(userDef.get)            // 调用传入对象的 get 函数，并把返回值赋值给 sharedPropertyDefinition 的 getter
      : noop     // 不存在返回一个空函数
    // 设置 setter
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  // 将 key 挂载到 vm 上，并且设置对应的 getter 和 setter
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    // _computedWatchers 在 initComputed 中初始化
    // 查看 _computedWatchers 是否存在，且 当前 key 是否存在于 _computedWatchers 中
    const watcher = this._computedWatchers && this._computedWatchers[key]

    // 当前 key 存在于 this._computedWatchers 中
    if (watcher) {
      // watcher.dirty 是什么意思？ 脏检查？
      if (watcher.dirty) {
        watcher.evaluate()
      }
      // 依赖收集？
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }

      // 判断 props 是否存在 并且 key 是否存在于 props 中
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }

      // 查看方法名称是否以 $ 或 _ 开头，如果是 warn 警告
      // $ 或者 _ 开头的函数是 Vue 的私有函数
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }

    // 将 method 的方法注入到 Vue 的实例中
    // bind 方法改变 methods[key] 中的 this 指向 vm
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

// TODO
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // 给 Vue的原型上挂载了 $data, $props
  // 设置 getter 返回 this._data 和 this._props
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // 设置 $set 和 $delete 方法
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 设置 $watch
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
      const info = `callback for immediate watcher "${watcher.expression}"`
      pushTarget()
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info)
      popTarget()
    }
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}

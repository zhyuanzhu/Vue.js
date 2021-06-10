/* @flow */

import config from '../config'
import { warn } from './debug'
import { set } from '../observer/index'
import { unicodeRegExp } from './lang'
import { nativeWatch, hasSymbol } from './env'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */

// 默认是一个空对象  Object.create(null)
// 合并选项的策略对象，会包含多个合并策略的函数
const strats = config.optionMergeStrategies

/**
 * Options with restrictions
 */
if (process.env.NODE_ENV !== 'production') {
  // 如果不是生产环境
  // 给 策略合并对象添加 el, propsData 策略函数  el 和 propsData 的合并策略
  // 在生产环境， starts 中是没有 el 和 propsData 策略合并函数的，在生产环境中 el 和 propsData 的策略函数是默认的 defaultStrat 函数
  // 返回 如果 child 存在返回 child 否则返回 parent
  strats.el = strats.propsData = function (parent, child, vm, key) {
    // 如果 vm 不存在则说明是 子组件
    // vm 就是 mergeOptions 中的第三个参数 vm
    // 在 _init 函数中 mergeOptions 的第三个参数 vm 是 Vue 的实例
    // 在 global-api extend 方法中 mergeOptions 的第三个参数 vm 是 undefined
    // 即 如果 vm 存在，则是通过 new Vue 创建的，如果不存在，则是通过 Vue.extend 创建的组件
    if (!vm) {
      // key 是 el 或者 propsData
      // TODO propsData??????
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}

/**
 * Helper that recursively merges two data objects together.
 */

/**
 * 经过处理之后的 data 均为纯对象
 * @param to childVal
 * @param from parentVal
 * @returns {Object}
 */
function mergeData (to: Object, from: ?Object): Object {
  // 如果 parent 不存在，直接返回 child
  if (!from) return to

  let key, toVal, fromVal

  // 获取 from 的所有 key
  const keys = hasSymbol
    ? Reflect.ownKeys(from)
    : Object.keys(from)

  // 遍历keys
  for (let i = 0; i < keys.length; i++) {
    // 缓存每一项的key
    key = keys[i]
    // in case the object is already observed...
    // 如果当前数据是响应式数据，跳出本次循环，继续下一次
    if (key === '__ob__') continue
    // 缓存 to 对象中 key 对应的值
    toVal = to[key]
    // 缓存 from 对象中 key 对应的值
    fromVal = from[key]
    // 如果 from 对象中的 key 在 to 对象中不存在
    if (!hasOwn(to, key)) {
      // 使用 set 函数为 to 对象设置 key ，并赋值为 from 中 key 对应的值
      // 会将 to 对象中的 key 值变为响应式
      set(to, key, fromVal)
    } else if (       // 如果 to 和 from 中相同 key 对应的值不同， 且值都是普通对象，递归调用 mergeData 函数
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal)
    }
    // 如果不满足上述条件，则什么都不需要处理
  }
  return to
}

/**
 * Data
 */
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  // 如果 vm 不存在
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    return function mergedDataFn () {
      // 对父组件和子组件对 data 做判断，如果是函数则调用该函数，修改函数内的 this 并返回，否则直接传入 data
      // TODO mergeData 函数
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    // vm 存在
    return function mergedInstanceDataFn () {
      // instance merge
      // 规范 childVal，如果是函数则为 函数的返回值，否则是 childVal 自身
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      // 如果 instanceData 存在，返回 mergeData 函数的返回值
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        // 否则返回处理后的 parentVal
        return defaultData
      }
    }
  }
}

// 给策略合并对象 添加 data 函数
// data 的合并策略
// data 合并后总是会返回一个函数
strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  // 如果 vm 不存在，即 extend 创建的
  if (!vm) {
    // 子组件的 data 存在且不是函数，警告子组件的 data 应该是一个返回了对象的函数，
    // 返回 父组件的 data
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    // 如果 子组件的 data 是函数
    return mergeDataOrFn(parentVal, childVal)
  }

  return mergeDataOrFn(parentVal, childVal, vm)
}

/**
 * Hooks and props are merged as arrays.
 */
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  const res = childVal     // childVal 如果存在，去判断 parentVal
    ? parentVal       // childVal 且 parentVal 存在，将 parentVal 与 childVal 合并成一个数组
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)    // childVal 且 parentVal 不存在，判断 childVal 是否是数组
        ? childVal    // 是数组的话直接返回
        : [childVal]  // 不是数组，修改成数组
    : parentVal   // childVal 不存在，直接返回 parentVal
  // 查看 res 是否存在
  return res
    ? dedupeHooks(res)    // 存在，对 res 去重，    TODO 去重的意义？？？？
    : res
}

function dedupeHooks (hooks) {
  const res = []
  // 遍历传入的hooks
  for (let i = 0; i < hooks.length; i++) {
    // 查看 每一项是否在 res 中存在，如果不存在，则 push 进 res
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i])
    }
  }
  return res
}

// 生命周期策略
// 遍历生命周期钩子函数名称数组
LIFECYCLE_HOOKS.forEach(hook => {
  // 给每一个生命周期函数绑定对应的策略合并函数
  strats[hook] = mergeHook
})

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */

// 第一次初始化的时候 parentVal 是 {KeepAlive, Transition, TransitionGroup}
// 所以在每个组件中都可以使用这三 component
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  // 创建一个对象，如果 parentVal 存在，则该对象的原型指向 parentVal，否则创建一个没原型的空对象
  const res = Object.create(parentVal || null)
  // childVal 如果存在
  if (childVal) {
    // 如果是开发环境 则执行  assertObjectType 检查 childVal 是否是一个纯对象，如果不是报出警告
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    // 将 childVal 合并到 res 上并返回
    return extend(res, childVal)
  } else {
    // 不存在直接返回 res 对象
    return res
  }
}

// 资源选项的合并策略
// 遍历 [component, directive, filter]
ASSET_TYPES.forEach(function (type) {
  // 给每一项添加对应的策略合并函数
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
// watch 的合并策略函数
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  // Firefox 浏览器中原生的 Object.prototype 拥有原生的 watch 函数
  // 所以当发现组件选项是浏览器原生的 watch 时，说明没有写 watch，直接赋值为 undefined
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  // 如果 childVal 不存在，直接创建一个继承 parentVal 的对象 或者 创建一个空对象
  if (!childVal) return Object.create(parentVal || null)
  // 开发环境 对 childVal 做格式检查
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  // 如果 parentVal 不存在，返回 childVal
  if (!parentVal) return childVal
  const ret = {}
  // 将 parentVal 合并到 ret 上
  extend(ret, parentVal)

  // 循环遍历 childVal 中的每一项
  for (const key in childVal) {
    // 缓存 ret 中存储的 key 值
    let parent = ret[key]
    // 获取当前 childVal 中 key 对应的值
    const child = childVal[key]
    // 标准格式化处理 parent, 如果 parent 存在且不是数组，将 parent 转成数组
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    // 给 ret[key] 赋值
    ret[key] = parent        //查看 parent 是否存在
      ? parent.concat(child)     // 存在的话把 parent 与 child 合并
      : Array.isArray(child) ? child : [child]    // 不存在，判断 child 是否是数组，是数组直接返回，不是数组处理成数组
  }
  return ret
}

/**
 * Other object hashes.
 */
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = Object.create(null)
  extend(ret, parentVal)
  if (childVal) extend(ret, childVal)
  return ret
}
strats.provide = mergeDataOrFn

/**
 * Default strategy.
 */
// 如果 childVal 不存在，则返回 parentVal, 否则返回 childVal
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names
 */
function checkComponents (options: Object) {
  // 遍历 options.components
  for (const key in options.components) {
    validateComponentName(key)
  }
}

export function validateComponentName (name: string) {
  if (!new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'should conform to valid custom element name in html5 specification.'
    )
  }
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
function normalizeProps (options: Object, vm: ?Component) {
  // 获取 options 中的 props
  const props = options.props
  // props 不存在直接 return
  if (!props) return
  const res = {}
  let i, val, name
  // 如果 props 是一个数组
  if (Array.isArray(props)) {
    // props: [name, age, hobby]
    i = props.length
    // 遍历数组中的每一项
    while (i--) {
      // 给 val 赋值为当前项
      val = props[i]
      // 如果当前项是字符串
      if (typeof val === 'string') {
        // 将 a-b 转成驼峰 aB
        name = camelize(val)
        // 组装 res 数据格式
        res[name] = { type: null }
        /**
         * res = {
         *   aB: {type: null}
         *  }
         */
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {
    // 如果 props 是一个对象
    // props: { count ... }
    /**
     * count: {
     *   type: Number,
     *   default: 1
     * }
     */
    for (const key in props) {
      val = props[key]
      name = camelize(key)
      // val 是对象的话直接返回
      // bool: Boolean   ----> 处理后 bool: {type: Boolean}
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  // 给 重新赋值 options 的 props 属性为格式化之后的对象
  // 处理后的格式为
  /**
   * props = {
   *   count: {
   *     type: Number,
   *     default: 2
   *   },
   *   str: {
   *     type: null
   *   },
   *   bool: {
   *     type: Boolean
   *   }
   * }
   *
   */
  options.props = res
}

/**
 * Normalize all injections into Object-based format
 */
function normalizeInject (options: Object, vm: ?Component) {
  // 获取 options 中的 inject
  const inject = options.inject
  // inject 不存在，直接 return 返回
  if (!inject) return
  // 重写了 options 中的 inject 属性，并赋值为一个空对象，将 normalized 指向相同的空对象
  const normalized = options.inject = {}
  // 如果 inject 是一个数组
  if (Array.isArray(inject)) {
    // 遍历数组 inject: ['foo', 'bar']
    for (let i = 0; i < inject.length; i++) {
      // 格式化 normalized
      /**
       * {
       *   foo: {
       *     form: 'foo'
       *   },
       *   bar: {
       *     form: 'bar'
       *   }
       * }
       *
       */
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    // 是一个对象
    for (const key in inject) {
      /**
       * inject: {
       *   foo: {
       *     default: 'foo'
       *   },
       *   bar: {
       *     form: 'bar',
       *     default: 'bar'
       *   },
       *   baz: {
       *     from: 'baz',
       *     default: () => [1, 2, 3]
       *   },
       *   faz: 'datas'
       * }
       */
      const val = inject[key]
      // 判断是否是普通对象
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)    // 将 val 和 { form: key } 合并
        : { from: val }
      // 处理户
      // faz: { form: 'datas' }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 */
function normalizeDirectives (options: Object) {
  // 获取 options 中的 directives
  const dirs = options.directives
  // 如果存在
  if (dirs) {
    for (const key in dirs) {
      // 获取每一个指令
      const def = dirs[key]
      // 查看指令是否是函数，如果是函数
      if (typeof def === 'function') {
        // 标准化处理 v-test v-test1
        /**
         * test: {
         *   bind: model,
         *   update: model
         * },
         * test1: function () {}
         *
         */
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

function assertObjectType (name: string, value: any, vm: ?Component) {
  // 检查 value 是否是一个纯对象，如果不是 则抛出警告
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== 'production') {
    // 检查子组件的组件名称
    checkComponents(child)
  }

  // 如果子组件是函数式组件
  if (typeof child === 'function') {
    child = child.options
  }

  // 标准化处理 Props
  normalizeProps(child, vm)

  // 标准化处理 inject
  normalizeInject(child, vm)

  // 标准化处理 指令 directive
  normalizeDirectives(child)

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.
  // TODO 子组件什么时候没有 _base 属性
  if (!child._base) {
    // 如果使用 extends 扩展了另一个组件
    if (child.extends) {
      // 递归调用合并 extends，并将返回值 赋值为 parent 的值
      parent = mergeOptions(parent, child.extends, vm)
    }
    // 如果存在 mixins
    if (child.mixins) {
      // 循环遍历 mixins 的每一项
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        // 递归调用合并每一项 mixins 的数据
        // 并将返回值赋值为 parent 的新值
        parent = mergeOptions(parent, child.mixins[i], vm)
      }
    }
  }

  const options = {}
  let key
  /**
   * 如果 parent 是 Vue.options
   * Vue.options = {
   *   components: {
   *     KeepAlive,
   *     Transition,
   *     TransitionGroup
   *   },
   *   directives: {
   *     model,
   *     show
   *   },
   *   filters: Object.create(null),
   *   _base: Vue
   * }
   */
  for (key in parent) {
    mergeField(key)
  }
  for (key in child) {
    // key 不存在与 parent 中，避免了 重复调用，因为已经在上一个 for in 循环中调用了
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  function mergeField (key) {
    //
    const strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  const assets = options[type]
  // check local registration variations first
  if (hasOwn(assets, id)) return assets[id]
  const camelizedId = camelize(id)
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // fallback to prototype chain
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}

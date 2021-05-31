/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
// 将 对象转换成被观察的对象，并且将每个属性转换成 getter 和 setter
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    // 观测对象
    this.value = value

    // 数据依赖对象
    this.dep = new Dep()

    // 计数器
    this.vmCount = 0

    // 将实例挂载到 观察对象的 __ob__ 属性，且该属性不能被枚举。无须设置 getter 和 setter
    def(value, '__ob__', this)

    // 是数组  数组的响应式处理
    if (Array.isArray(value)) {
      if (hasProto) {    // 有 __proto__ 属性
        // arrayMethods = Array.prototype
        // value.__proto__ = arrayMethods
        protoAugment(value, arrayMethods)
      } else {
        // 遍历 arrayKeys , 将 arrayKeys 中的每一项都挂载到 value 上，且设置为不可枚举
        // arrayKeys 是 Object.getOwnPropertyNames(arrayMethods)
        // arrayKeys 是 js 原生数组的 属性和方法名
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // 为数组中的每一个对象创建一个 observer 实例
      this.observeArray(value)
    } else {
      // 是对象
      // 遍历对象的每一个属性，转换成 getter 和 setter
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    // 获取对象的每一个key
    const keys = Object.keys(obj)
    // 遍历对象的key
    for (let i = 0; i < keys.length; i++) {
      // 将每一项设置为响应式
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    // 遍历数组的每一项
    for (let i = 0, l = items.length; i < l; i++) {
      // 对数组的每一项做响应式处理
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// 响应式处理函数
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 判断 value 是否是一个对象 或者是 VNode 的一个实例
  // 如果是 直接返回，不需要做响应式处理
  if (!isObject(value) || value instanceof VNode) {
    return
  }

  // Observer
  let ob: Observer | void

  // 如果 value  有 __ob__ 属性，并且 value.__ob__ 是 Observer 的一个实例
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    // 给 ob  赋值
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&   // value 是数组或者是原生对象
    Object.isExtensible(value) &&
    !value._isVue   // value 是否是 Vue 的实例
  ) {
    // 如果没有，则创建 else if 的条件是创建 ob 时对 value 的判断
    // 创建一个 Observer 对象
    // 将 value 中的所有属性设置为 setter getter
    ob = new Observer(value)
  }

  // 如果是根数据
  if (asRootData && ob) {
    // vmCount
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
// 为对象定义响应式属性
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 创建依赖对象
  // 创建 当前对象的 watcher
  const dep = new Dep()
  // 获取 obj 的属性描述符对象
  const property = Object.getOwnPropertyDescriptor(obj, key)
  // 如果不可枚举，直接返回
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 判断是否递归观察子对象，并将子对象的属性都转换成 getter 和 setter，返回子观察对象
  let childOb = !shallow && observe(val)
  // 把 obj 的 key 属性转换成 getter 和 setter
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 如果用户预定于的 getter 存在，则 value  等于 getter 调用的返回值
      const value = getter ? getter.call(obj) : val
      // TODO
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      // 返回 value
      return value
    },
    set: function reactiveSetter (newVal) {
      // getter 存在，返回 getter 的 返回值，否则是传入的 val
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // 设置的新值和原始值相等，或者 新值是和原始值都是 NaN
      // 不处理，直接 return
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      // 如果只存在 getter 不存在 setter 直接返回
      if (getter && !setter) return
      if (setter) {
        // setter 存在，直接调用 setter, 将 setter 函数内部的 this 指向 obj
        setter.call(obj, newVal)
      } else {
        // 直接将 新值 赋值给 val
        val = newVal
      }
      // 如果新值是对象，观察子对象并返回子的 observer 对象
      childOb = !shallow && observe(newVal)
      // 发布通知，数据已经更新了
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}

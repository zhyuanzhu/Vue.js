/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean    // 是否是渲染 watcher
  ) {
    this.vm = vm
    // 判断是否是渲染 wathcer
    if (isRenderWatcher) {
      vm._watcher = this
    }
    // 存储的是所有的 watcher ， 包括用户 写的和 渲染 watcher   、computed
    vm._watchers.push(this)
    // options
    // 用户 watcher
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user      // 用户 watcher 是 true
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    /**
     * 用来记录 dep 相关
     * @type {*[]}
     */
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()

    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // expOrFn 是字符串
      // 例如 watcher: { 'person.name': function () {} }
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 如果是计算属性，lazy 是 true
    // 其他是 false
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    // 把当前的 watcher 保存到栈
    // 并且给 Dep.target = target
    // 为了处理父子组件嵌套
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching

      if (this.deep) {
        traverse(value)
      }

      // 弹出栈
      popTarget()
      // 清空 newDeps
      // 需要清空的原因是防止未使用的订阅存在，避免了重复执行 componentUpdate
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    // 获取 dep 的 id， dep 的唯一标识
    const id = dep.id
    // this.newDepIds 存在 不存在 id
    // 保证不会重新添加，但已有但仍然存在
    if (!this.newDepIds.has(id)) {
      // 将 id 添加进去
      this.newDepIds.add(id)
      // 将 dep push 进 this.newDeps
      this.newDeps.push(dep)
      // 如果 this.depIds 不存在 中不存在 id
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * 比对 dep 和 newDeps；防止原有添加，但未使用的部分仍然被订阅
   */
  cleanupDeps () {
    // 获取 deps 的长度
    let i = this.deps.length
    while (i--) {
      // 缓存当前 dep
      const dep = this.deps[i]
      // 如果newDepIds 中不存在当前 dep
      if (!this.newDepIds.has(dep.id)) {
        // 清除已有但 dep
        dep.removeSub(this)
      }
    }
    // 缓存 depIds
    let tmp = this.depIds
    // 更改 this.depIds 为 this.newDepIds; 将 this.newDepIds 赋值给 this.depIds
    this.depIds = this.newDepIds
    // 将 this.depIds 赋值给 this.newDepIds
    this.newDepIds = tmp
    // 清空 this.newDepIds
    this.newDepIds.clear()
    // 缓存 this.deps
    tmp = this.deps
    // 将 this.newDeps 赋值给 this.deps
    this.deps = this.newDeps
    // 将 this.deps 赋值给 this.newDeps
    this.newDeps = tmp
    // 清空 this.newDeps
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    // 判断是否是 computed
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      // 更新 watcher 队列
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      // 渲染 watcher 和用户watcher
      // 渲染 watcher value = undefined
      const value = this.get()
      // 判断get获取到到值和当前constructor中缓存的value值做比较
      // constructor 中 this.value = this.lazy ? undefined : this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||      // value 值是对象或者用户传入了 deep = true
        this.deep
      ) {
        // set new value
        // 将 this.value 缓存
        const oldValue = this.value
        // 更新 this.value 的值
        this.value = value
        if (this.user) {
          // 如果是用户 watcher
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {
          // 渲染 watcher 的 cb 是 noop 空函数
          // 回掉函数 newValue, oldValue
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}

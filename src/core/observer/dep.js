/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  // Dep 类的静态属性 target, 是一个 Watcher
  static target: ?Watcher;
  // id 递增的数值，唯一标识
  id: number;
  // 存储 Watcher 的数组
  subs: Array<Watcher>;

  constructor () {
    // 每次 new Dep uid++
    this.id = uid++
    // 初始化容器为 []
    this.subs = []
  }

  addSub (sub: Watcher) {
    // 往容器中添加 watcher
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  depend () {
    // 如果 Dep.target 存在
    if (Dep.target) {
      // 相当于 Watcher.addDep(this)
      Dep.target.addDep(this)
      // 处理后调用 dep.addSub(Watcher)
    }
  }

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack = []

export function pushTarget (target: ?Watcher) {
  // 存入 栈
  targetStack.push(target)
  // 给 Dep.target 赋值
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}

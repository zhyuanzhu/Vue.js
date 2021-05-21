/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    // 如果 Vue 中 有 _installedPlugins 返回否则返回 []
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    // 存在这个plugin 则直接返回
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // 将 arguments 从第一项开始，将后面所有项存放至一个数组中，顺序保持不变
    const args = toArray(arguments, 1)
    // 将 Vue 添加至数组的第一项
    args.unshift(this)
    // 如果传入的 plugin 的 install 属性是一个 function
    if (typeof plugin.install === 'function') {
      // 调用 plugin 的 install 方法，并且传入 args 数组，且该方法的 this 指向 plugin
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      // 如果 plugin 本身是一个 function, 直接调用，将参数传入
      plugin.apply(null, args)
    }
    // 将 plugin push 进数组 installedPlugins 中
    installedPlugins.push(plugin)
    return this
  }
}

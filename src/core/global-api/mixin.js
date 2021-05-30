/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // mergeOptions 后续查看
    // 把 mixin 中的所有成员拷贝到 this.options 中
    // this 是全局的 Vue
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}

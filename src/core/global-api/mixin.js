/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // mergeOptions 后续查看
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}

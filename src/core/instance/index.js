import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// Vue 构造函数声明
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 调用 _init 方法初始化传入的参数 options
  // _init 方法的实现及来源
  // 来于 initMixin
  this._init(options)
}
// 给 Vue 的原型挂载 _init 方法
initMixin(Vue)

// ?
stateMixin(Vue)
// ?
eventsMixin(Vue)
// ?
lifecycleMixin(Vue)
// ?
renderMixin(Vue)

export default Vue

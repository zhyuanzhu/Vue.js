/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        // 不传入参数，获取对应的 api 方法
        // 获取 组件、 过滤器、 或者 自定义指令
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }

        // 注册组件
        // 传入了一个对象 [object Object]
        // Vue.component('comp-name', {template: 'xxx', name: 'xx', methods: {} })
        if (type === 'component' && isPlainObject(definition)) {
          // 设置组件的 name 为传入的 name 或 当前组件的 id
          definition.name = definition.name || id
          // this.options._base 是 Vue 构造函数
          // 设置组件 为 Vue.extend(definition)
          definition = this.options._base.extend(definition)
        }

        //
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }

        // 如果直接传入的是 Vue.component ,存入全局的 this.options.components 中
        this.options[type + 's'][id] = definition

        return definition
      }
    }
  })
}

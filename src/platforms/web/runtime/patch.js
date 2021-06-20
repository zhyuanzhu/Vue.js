/* @flow */

// nodeOps 操作 DOM  api
import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
// 处理 指令 directives 和 ref
import baseModules from 'core/vdom/modules/index'

// 操作属性，事件，样式，动画等
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)

// 创建 patch 函数，通过 createPatchFunction 方法生成
export const patch: Function = createPatchFunction({ nodeOps, modules })

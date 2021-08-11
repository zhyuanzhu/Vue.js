/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'


export function createCompilerCreator (baseCompile: Function): Function {
  // baseOptions 和平台相关的参数
  // 返回函数，处理 和平台相关的参数与用户传入的参数
  return function createCompiler (baseOptions: CompilerOptions) {
    /**
     *
     * @param template 模版
     * @param options  用户传入的选项
     * @returns {*}
     */
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      // 创建一个对象 finalOptions，原型指向 baseOptions
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []

      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }

      if (options) {
        // TODO  outputSourceRange 什么时候挂载，什么作用
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }
        // merge custom modules
        // 如果 有 modules
        if (options.modules) {
          // 给 finalOptions 挂载 modules ,将 baseOptions.modules 和 传入的 options.modules 合并
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives
        // 如果有 directives
        if (options.directives) {
          // 给 finalOptions 挂载 directives；将传入的 options.directives 合并到 baseOptions.directives 上
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        // 将 options 上的值浅拷贝到 finalOptions 中
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn
      // 调用 baseCompile 函数，处理 template 和 finalOptions，返回值为 compiled 函数
      const compiled = baseCompile(template.trim(), finalOptions)
      if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn)
      }
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}

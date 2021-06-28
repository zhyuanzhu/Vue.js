/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 把模版编译成 ast 抽象语法树
  // 抽象语法树，用来以树的形式描述代码结构

  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    // 优化抽象语法树
    optimize(ast, options)
  }
  // TODO   调用  generate 函数
  // 将 抽象语法树转换成 js 代码
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,      // 字符串 render
    staticRenderFns: code.staticRenderFns      // 静态渲染函数，生成静态渲染 code
  }
})

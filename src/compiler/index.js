/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// createCompilerCreator 返回一个 createCompiler 函数
// createCompiler 函数返回
// compile： ----> compile 是 baseCompile 函数的返回值
// compileToFunctions: createCompileToFunctionFn(compile)
// createCompileToFunctionFn 返回一个 compileToFunctions 函数， 返回的这个 compileToFunctions 函数返回 一个 CompiledFunctionResult 对象
/**
  type CompiledFunctionResult = {
    render: Function;
    staticRenderFns: Array<Function>;
  };
 */

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// 编译的核心入口
// 编译核心三部曲  生成 ast --> 优化 ast 树 --> 将 ast 树生成代码
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

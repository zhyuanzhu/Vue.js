/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  // 查看 options.staticKeys 是否存在，如果存在则返回对应的值，不存在则缓存对应的值并返回这个值
  isStaticKey = genStaticKeysCached(options.staticKeys || '')

  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  markStatic(root)
  // second pass: mark static roots.
  markStaticRoots(root, false)
}

// 返回一个 节点的对象
function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

/**
 * 标记 node 节点及 node 节点的子节点 是否是 静态节点
 * 如果有一个子节点不是静态节点，则当前节点不是静态节点
 * @param node
 */
function markStatic (node: ASTNode) {
  // 判断 节点是否是 static 节点，并且将结果挂载到 node 上
  node.static = isStatic(node)
  // 如果是元素节点
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }
    // 遍历当前节点的子节点
    for (let i = 0, l = node.children.length; i < l; i++) {
      // 缓存当前子节点
      const child = node.children[i]
      // 递归标记当前子节点
      markStatic(child)
      // 如果当前子节点不是静态节点
      if (!child.static) {
        // 将 当前 node 节点 的 static 属性设置为 false,也不是静态节点
        node.static = false
      }
    }
    // 如果当前节点存在 ifConditions 属性
    // [{exp: string, block: ASTElement}]
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        // 标记缓存的 block 元素
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

/**
 * 给父元素标记是不是 staticRoot 节点，如果没有子节点，则不会标记
 * 标记是否是静态根节点
 * @param node
 * @param isInFor
 */
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  // 如果是元素节点
  if (node.type === 1) {
    // 如果是静态节点 或者节点上有 once
    if (node.static || node.once) {
      // 给节点挂载 staticInFor 属性，并赋值为 false
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 静态节点，且子节点存在
    // 如果只有一个子节点，且这个子节点是文本节点
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      // 有多个子节点，且第一个子节点不是文本节点
      // 设置 node 的 staticRoot 属性值为 true，并跳出函数执行
      node.staticRoot = true
      return
    } else {
      // 如果只有一个子节点，且这个子节点就是一个文本节点，设置 node 的 staticRoot 属性值为 false
      node.staticRoot = false
    }
    // 如果 node 有子节点
    if (node.children) {
      // 循环遍历每一个子节点，递归调用 markStaticRoots 函数
      // isInFor 的值 取决于 !!node.for，第一次传入的 isInFor 是 false
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    // 如果有 v-if
    if (node.ifConditions) {
      // 循环遍历，对每一个 block 即 ASTElement 递归调用 markStaticRoots
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

/**
 * 查看一个节点是否是静态节点
 * 没有动态绑定的属性，如果是 文本节点则是
 * 如果不是文本节点，没有动态绑定的属性、没有 v-if v-for，不是 slot,component, 不是 component， 或者 直接是 pre ???
 * @param node
 * @returns {boolean}
 */
function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression
    return false
  }
  if (node.type === 3) { // text
    return true
  }
  // TODO  node.pre ????
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in    不是 slot,component
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}

/**
 * 查看当前 node 的父节点 是不是 template，不是返回 false。是则返回 true
 * 当前节点 node 的父节点是不是 有 v-for ，如果有则返回 true 否则返回 false
 * @param node
 * @returns {boolean}
 */
function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}

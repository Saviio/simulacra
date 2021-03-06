'use strict'

var processNodes = require('./process_nodes')
var bindKeys = require('./bind_keys')
var keyMap = require('./key_map')

var hasDefinitionKey = keyMap.hasDefinition
var isBoundToParentKey = keyMap.isBoundToParent
var markerMap = processNodes.markerMap
var storeMeta = bindKeys.storeMeta
var addToPath = bindKeys.addToPath
var findTarget = bindKeys.findTarget


module.exports = rehydrate


/**
 * Rehydration of existing DOM nodes by recursively checking equality.
 *
 * @param {*} scope
 * @param {Object} obj
 * @param {Object} def
 * @param {Node} node
 * @param {Node} matchNode
 */
function rehydrate (scope, obj, def, node, matchNode) {
  var document = scope ? scope.document : window.document
  var NodeFilter = scope ? scope.NodeFilter : window.NodeFilter

  var key, branch, x, value, change, definition, mount, keyPath, endPath
  var meta, valueIsArray, activeNodes, index, treeWalker, currentNode

  for (key in def) {
    branch = def[key]
    meta = storeMeta.get(obj)[key]
    change = !branch[hasDefinitionKey] && branch[1]
    definition = branch[hasDefinitionKey] && branch[1]
    mount = branch[2]
    keyPath = meta.keyPath

    if (branch[isBoundToParentKey]) {
      x = obj[key]

      if (definition && x != null)
        bindKeys(scope, x, definition, matchNode, keyPath)
      else if (change) change(matchNode, x, null, keyPath)

      continue
    }

    activeNodes = meta.activeNodes
    if (!activeNodes.length) continue

    valueIsArray = meta.valueIsArray
    x = valueIsArray ? obj[key] : [ obj[key] ]
    index = 0
    treeWalker = document.createTreeWalker(matchNode, NodeFilter.SHOW_ELEMENT)

    while (index < activeNodes.length && treeWalker.nextNode()) {
      currentNode = activeNodes[index]
      if (treeWalker.currentNode.isEqualNode(currentNode)) {
        activeNodes.splice(index, 1, treeWalker.currentNode)

        value = x[index]
        endPath = keyPath

        if (valueIsArray)
          endPath = addToPath(keyPath, keyPath, index)

        if (definition) {
          rehydrate(scope, value, definition,
            currentNode, treeWalker.currentNode)

          if (mount) {
            findTarget(endPath, keyPath)
            mount(treeWalker.currentNode, value, null, endPath)
          }
        }
        else if (change)
          change(treeWalker.currentNode, value, null, endPath)

        index++
      }
    }

    if (index !== activeNodes.length) throw new Error(
      'Matching nodes could not be found on key "' + key + '".')

    // Rehydrate marker node.
    currentNode = treeWalker.currentNode

    // Ignore comment node setting, comment may already exist.
    markerMap.set(branch, currentNode.parentNode.insertBefore(
      document.createTextNode(''), currentNode.nextSibling))
  }
}
